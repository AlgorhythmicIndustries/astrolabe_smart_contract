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
    swapTransaction: string;
    lastValidBlockHeight: number;
    prioritizationFeeLamports?: number;
}
