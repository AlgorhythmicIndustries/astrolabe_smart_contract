import { UltraOrderResponse } from '../types/jupiter';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Get swap order using Jupiter Ultra V3 API
 * @param inputMint Input token mint address
 * @param outputMint Output token mint address
 * @param amount Amount in smallest unit
 * @param taker Wallet address (smart account PDA)
 * @returns Ultra order response with transaction and quote details
 */
export async function getUltraOrder(
  inputMint: string,
  outputMint: string,
  amount: number,
  taker: string
): Promise<UltraOrderResponse> {
  // Convert native to WSOL mint
  const actualInputMint = inputMint === 'native' ? WSOL_MINT : inputMint;
  const actualOutputMint = outputMint === 'native' ? WSOL_MINT : outputMint;

  console.log('Requesting Ultra order with params:', {
    inputMint: actualInputMint,
    outputMint: actualOutputMint,
    amount,
    taker
  });

  const url = new URL('https://api.jup.ag/ultra/v1/order');
  url.searchParams.append('inputMint', actualInputMint);
  url.searchParams.append('outputMint', actualOutputMint);
  url.searchParams.append('amount', amount.toString());
  url.searchParams.append('taker', taker);

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      console.error('Ultra order error:', data);
      throw new Error(data.error || 'Failed to get Ultra order');
    }

    console.log('Ultra order response:', {
      inAmount: data.inAmount,
      outAmount: data.outAmount,
      slippageBps: data.slippageBps,
      priceImpactPct: data.priceImpactPct,
      swapType: data.swapType,
      transactionLength: data.transaction?.length || 0
    });

    return data;
  } catch (error) {
    console.error('Failed to fetch Ultra order:', error);
    throw error;
  }
}

/**
 * Execute a swap order using Jupiter Ultra V3 API
 * Note: We may not use this in practice since we submit transactions directly via our backend
 * @param signedTransaction Base64 encoded signed transaction
 * @param requestId Request ID from the order response
 * @returns Execution result
 */
export async function executeUltraOrder(
  signedTransaction: string,
  requestId: string
): Promise<any> {
  console.log('Executing Ultra order:', requestId);

  try {
    const response = await fetch('https://api.jup.ag/ultra/v1/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        signedTransaction,
        requestId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Ultra execute error:', data);
      throw new Error(data.error || 'Failed to execute Ultra order');
    }

    console.log('Ultra execute response:', data);
    return data;
  } catch (error) {
    console.error('Failed to execute Ultra order:', error);
    throw error;
  }
}

