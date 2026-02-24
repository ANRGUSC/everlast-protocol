/**
 * Off-chain CLUM computation module
 *
 * Computes C(q) off-chain using arbitrary-precision arithmetic,
 * then generates a verification payload that can be verified on-chain
 * in a single O(N) pass (vs O(N * iterations) for on-chain bisection).
 *
 * Usage:
 *   const verifier = new CLUMVerifier(provider, engineAddress);
 *   const result = await verifier.computeCostOffchain();
 *   await verifier.submitVerification(result);
 */

import { ethers, Contract, Provider, Signer } from "ethers";

const WAD = BigInt("1000000000000000000"); // 1e18

// ─── Fixed-point math helpers ────────────────────────────────────────

function mulWad(a: bigint, b: bigint): bigint {
  return (a * b) / WAD;
}

function divWad(a: bigint, b: bigint): bigint {
  return (a * WAD) / b;
}

/**
 * Natural logarithm using native JS floating-point, then scaled to WAD.
 * For off-chain computation, double-precision (53-bit mantissa) is sufficient
 * since on-chain verification confirms the result.
 */
function lnWad(x: bigint): bigint {
  if (x <= 0n) throw new Error("lnWad: x must be positive");
  const xFloat = Number(x) / Number(WAD);
  const result = Math.log(xFloat);
  return BigInt(Math.round(result * Number(WAD)));
}

// ─── CLUM Engine ABI (minimal) ──────────────────────────────────────

const ENGINE_ABI = [
  "function getNumBuckets() view returns (uint256)",
  "function getQuantity(uint256 bucketIndex) view returns (int256)",
  "function priors(uint256) view returns (uint256)",
  "function getCachedCost() view returns (int256)",
  "function getUtilityLevel() view returns (int256)",
  "function verifyAndSetCost(int256 proposedCost, int256[] newQuantities)",
];

const BUCKET_ABI = [
  "function numBuckets() view returns (uint256)",
  "function getBucketMidpoint(uint256 index) view returns (uint256)",
  "function getBucketBounds(uint256 index) view returns (uint256 lower, uint256 upper)",
  "function getSpotPrice() view returns (uint256)",
  "function getCenterPrice() view returns (uint256)",
  "function getBucketWidth() view returns (uint256)",
];

// ─── Types ──────────────────────────────────────────────────────────

interface CLUMState {
  numBuckets: number;
  quantities: bigint[];
  priors: bigint[];
  cachedCost: bigint;
  utilityLevel: bigint;
}

interface VerificationPayload {
  proposedCost: bigint;
  quantities: bigint[];
  residual: number; // how close f(C) - U is (for diagnostics)
}

interface ImpliedDistribution {
  midpoints: bigint[];
  probabilities: number[];
}

// ─── CLUM Verifier ──────────────────────────────────────────────────

export class CLUMVerifier {
  private engine: Contract;
  private bucketRegistry: Contract | null = null;

  constructor(
    provider: Provider,
    engineAddress: string,
    private signer?: Signer
  ) {
    this.engine = new Contract(engineAddress, ENGINE_ABI, signer || provider);
  }

  setBucketRegistry(address: string, provider: Provider) {
    this.bucketRegistry = new Contract(address, BUCKET_ABI, provider);
  }

  /** Fetch current on-chain state */
  async fetchState(): Promise<CLUMState> {
    const numBuckets = Number(await this.engine.getNumBuckets());
    const quantities: bigint[] = [];
    const priors: bigint[] = [];

    for (let i = 0; i < numBuckets; i++) {
      quantities.push(BigInt(await this.engine.getQuantity(i)));
      priors.push(BigInt(await this.engine.priors(i)));
    }

    const cachedCost = BigInt(await this.engine.getCachedCost());
    const utilityLevel = BigInt(await this.engine.getUtilityLevel());

    return { numBuckets, quantities, priors, cachedCost, utilityLevel };
  }

  /** Evaluate f(C) = sum(pi_i * ln(C - q_i)) for given C and state */
  evaluateUtility(C: bigint, state: CLUMState): bigint {
    let sum = 0n;
    for (let i = 0; i < state.numBuckets; i++) {
      const diff = C - state.quantities[i];
      if (diff <= 0n) throw new Error(`C <= q_${i}: C=${C}, q=${state.quantities[i]}`);
      const logVal = lnWad(diff);
      sum += (state.priors[i] * logVal) / WAD;
    }
    return sum;
  }

  /** Solve for C using bisection with off-chain precision */
  solveCost(state: CLUMState): bigint {
    const maxQ = state.quantities.reduce((a, b) => (a > b ? a : b), -WAD * 1000000n);

    let low = maxQ + 1n;
    let high = state.cachedCost * 2n;
    if (high <= low) high = maxQ + WAD * 100000n;

    // Ensure high is above root
    while (this.evaluateUtility(high, state) < state.utilityLevel) {
      high *= 2n;
    }

    // Bisection (200 iterations for ~60 digits of precision)
    for (let iter = 0; iter < 200; iter++) {
      const mid = (low + high) / 2n;
      if (high - low <= 1n) break;

      const fMid = this.evaluateUtility(mid, state);
      if (fMid < state.utilityLevel) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return (low + high) / 2n;
  }

  /**
   * Compute the cost of a hypothetical trade off-chain
   * @param optionType 0 = CALL, 1 = PUT
   * @param strikeWad Strike price in WAD
   * @param sizeWad Size in WAD
   * @param isBuy Whether trader is buying
   * @param midpoints Bucket midpoints (from BucketRegistry)
   */
  async computeTradeCost(
    optionType: number,
    strikeWad: bigint,
    sizeWad: bigint,
    isBuy: boolean,
    midpoints: bigint[]
  ): Promise<{ cost: bigint; newState: CLUMState }> {
    const state = await this.fetchState();

    // Build kappa vector
    const newQuantities = [...state.quantities];
    for (let i = 0; i < state.numBuckets; i++) {
      const mid = midpoints[i];
      let payoff: bigint;
      if (optionType === 0) {
        payoff = mid > strikeWad ? mid - strikeWad : 0n;
      } else {
        payoff = strikeWad > mid ? strikeWad - mid : 0n;
      }
      if (payoff === 0n) continue;

      const kappa = (payoff * sizeWad) / WAD;
      if (isBuy) {
        newQuantities[i] += kappa;
      } else {
        newQuantities[i] -= kappa;
      }
    }

    const newState = { ...state, quantities: newQuantities };
    const newCost = this.solveCost(newState);

    const cost = isBuy
      ? newCost - state.cachedCost
      : state.cachedCost - newCost;

    return { cost, newState: { ...newState, cachedCost: newCost } };
  }

  /** Generate verification payload for on-chain submission */
  async computeVerification(): Promise<VerificationPayload> {
    const state = await this.fetchState();
    const computedCost = this.solveCost(state);
    const fVal = this.evaluateUtility(computedCost, state);
    const residual = Number(fVal - state.utilityLevel) / Number(WAD);

    return {
      proposedCost: computedCost,
      quantities: state.quantities,
      residual,
    };
  }

  /** Submit verification to the on-chain engine */
  async submitVerification(payload: VerificationPayload): Promise<string> {
    if (!this.signer) throw new Error("Signer required for submission");

    const tx = await this.engine.verifyAndSetCost(
      payload.proposedCost,
      payload.quantities
    );
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /** Compute implied distribution from current state */
  async getImpliedDistribution(): Promise<ImpliedDistribution> {
    const state = await this.fetchState();
    const C = state.cachedCost;

    const rawWeights: bigint[] = [];
    let denominator = 0n;

    for (let i = 0; i < state.numBuckets; i++) {
      const diff = C - state.quantities[i];
      if (diff <= 0n) throw new Error(`Negative wealth at bucket ${i}`);
      const w = (state.priors[i] * WAD) / diff;
      rawWeights.push(w);
      denominator += w;
    }

    const probabilities = rawWeights.map(
      (w) => Number((w * WAD) / denominator) / Number(WAD)
    );

    // Fetch midpoints if bucket registry is set
    let midpoints: bigint[] = [];
    if (this.bucketRegistry) {
      for (let i = 0; i < state.numBuckets; i++) {
        midpoints.push(BigInt(await this.bucketRegistry.getBucketMidpoint(i)));
      }
    }

    return { midpoints, probabilities };
  }

  /**
   * Compute Stage 1 LP price bounds for a set of strikes.
   * Returns tightened bid/ask bounds per strike based on cross-strike
   * portfolio dominance (the LP from the paper's Stage 1).
   *
   * This is a simplified version that checks basic no-arbitrage conditions.
   * A full implementation would solve the LP from the paper.
   */
  computeArbitrageBounds(
    strikes: bigint[],
    callPrices: bigint[],
    putPrices: bigint[],
    spotWad: bigint
  ): { callBids: bigint[]; callAsks: bigint[]; putBids: bigint[]; putAsks: bigint[] } {
    const n = strikes.length;
    const callBids = [...callPrices];
    const callAsks = [...callPrices];
    const putBids = [...putPrices];
    const putAsks = [...putPrices];

    // Enforce convexity: for K1 < K2 < K3,
    // C(K2) <= lambda * C(K1) + (1-lambda) * C(K3)
    for (let j = 1; j < n - 1; j++) {
      const lambda = divWad(strikes[j + 1] - strikes[j], strikes[j + 1] - strikes[j - 1]);
      const interpolated = mulWad(lambda, callPrices[j - 1]) +
        mulWad(WAD - lambda, callPrices[j + 1]);

      if (callAsks[j] > interpolated) {
        callAsks[j] = interpolated;
      }
    }

    // Enforce put-call parity: C(K) - P(K) = S - K (for zero-rate)
    for (let j = 0; j < n; j++) {
      const parity = spotWad > strikes[j] ? spotWad - strikes[j] : 0n;
      const impliedPut = callPrices[j] > parity ? callPrices[j] - parity : 0n;
      if (putBids[j] < impliedPut) {
        putBids[j] = impliedPut;
      }
    }

    return { callBids, callAsks, putBids, putAsks };
  }
}

// ─── Merkle tree for price bounds ───────────────────────────────────

export function buildPriceBoundsMerkleTree(
  bounds: Array<{
    optionType: number;
    strike: bigint;
    bid: bigint;
    ask: bigint;
  }>
): { root: string; leaves: string[]; proofs: string[][] } {
  const leaves = bounds.map((b) =>
    ethers.solidityPackedKeccak256(
      ["uint8", "uint256", "uint256", "uint256"],
      [b.optionType, b.strike, b.bid, b.ask]
    )
  );

  // Simple binary Merkle tree
  function buildTree(nodes: string[]): { root: string; layers: string[][] } {
    const layers: string[][] = [nodes];
    let current = [...nodes];

    while (current.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < current.length; i += 2) {
        if (i + 1 < current.length) {
          const pair =
            current[i] < current[i + 1]
              ? [current[i], current[i + 1]]
              : [current[i + 1], current[i]];
          next.push(ethers.solidityPackedKeccak256(["bytes32", "bytes32"], pair));
        } else {
          next.push(current[i]);
        }
      }
      layers.push(next);
      current = next;
    }

    return { root: current[0], layers };
  }

  const { root, layers } = buildTree(leaves);

  // Generate proofs for each leaf
  const proofs: string[][] = leaves.map((_, idx) => {
    const proof: string[] = [];
    let currentIdx = idx;

    for (let level = 0; level < layers.length - 1; level++) {
      const siblingIdx = currentIdx % 2 === 0 ? currentIdx + 1 : currentIdx - 1;
      if (siblingIdx < layers[level].length) {
        proof.push(layers[level][siblingIdx]);
      }
      currentIdx = Math.floor(currentIdx / 2);
    }

    return proof;
  });

  return { root, leaves, proofs };
}
