import { JupiterQuote, JupiterSwapResponse } from '../types/jupiter';
export declare function getSwapQuote(inputMint: string, outputMint: string, amount: number, slippage: number, platformFeeBps?: number): Promise<JupiterQuote>;
export declare function getSwapTransaction(quote: JupiterQuote, userPublicKey: string, wrapAndUnwrapSol?: boolean, dynamicComputeUnitLimit?: boolean, prioritizationFeeLamports?: string | number): Promise<JupiterSwapResponse>;
