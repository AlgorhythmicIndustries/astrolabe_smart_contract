export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: number;
  outAmount: number;
  otherAmountThreshold: number;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: number | string;
  routePlan: RoutePlanStep[];
  contextSlot: number;
  timeTaken: number;
}

export interface RoutePlanStep {
  swapInfo: SwapInfo;
  percent: number;
}

export interface SwapInfo {
  ammKey: string;
  label: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount: string;
  feeMint: string;
}

export interface JupiterSwapResponse {
  swapTransaction: string; // Base64 encoded transaction
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

// Ultra V3 API types
export interface UltraOrderResponse {
  transaction: string; // Base64 encoded transaction
  inAmount: string;
  outAmount: string;
  slippageBps: number;
  priceImpactPct: string;
  swapType: string;
  routePlan: RoutePlanStep[];
  requestId?: string; // Optional, for tracking
}

export type JupiterApiMode = 'ultra' | 'legacy';

export interface SwapConfig {
  apiMode: JupiterApiMode;
  excludedDexes: string[];
}
