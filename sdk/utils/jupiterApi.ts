import { JupiterQuote, JupiterSwapResponse } from '../types/jupiter';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Jupiter API configuration
// Migration: lite-api.jup.ag deprecated Jan 31, 2026 - now using api.jup.ag with API key
// See: https://dev.jup.ag/portal/migrate-from-lite-api
const JUPITER_API_BASE = 'https://api.jup.ag';
const JUPITER_API_KEY = '8b22cf80-e656-4d14-8b49-afd65fb3d53c'; // SDK testing only - not exposed

/**
 * Build headers for Jupiter API requests
 */
function buildHeaders(includeContentType: boolean = false): HeadersInit {
  const headers: HeadersInit = {
    'x-api-key': JUPITER_API_KEY,
  };
  
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  
  return headers;
}

export async function getSwapQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippage: number,
  platformFeeBps?: number,
  excludeDexes?: string[]
): Promise<JupiterQuote> {

  // Convert native to WSOL mint
  const actualInputMint = inputMint === 'native' ? WSOL_MINT : inputMint;
  const actualOutputMint = outputMint === 'native' ? WSOL_MINT : outputMint;

  console.log('Requesting quote with params:', {
    inputMint,
    outputMint,
    amount,
    slippage,
    platformFeeBps,
    excludeDexes
  });

  const url = new URL(`${JUPITER_API_BASE}/swap/v1/quote`);
  url.searchParams.append('inputMint', actualInputMint);
  url.searchParams.append('outputMint', actualOutputMint);
  url.searchParams.append('amount', amount.toString());
  url.searchParams.append('slippageBps', Math.round(slippage * 1000).toString());
  url.searchParams.append('restrictIntermediateTokens', 'true');
  // Additional routing restrictions for smaller transactions
  url.searchParams.append('maxAccounts', '32'); // Limit total accounts
  url.searchParams.append('onlyDirectRoutes', 'false'); // Allow direct routes when possible
  url.searchParams.append('asLegacyTransaction', 'false'); // Ensure versioned transactions for ALT support
  
  // Add platform fee if provided
  if (platformFeeBps && platformFeeBps > 0) {
    url.searchParams.append('platformFeeBps', platformFeeBps.toString());
    console.log('💰 Adding platform fee:', platformFeeBps, 'basis points');
  }

  // Add excluded DEXes if provided
  if (excludeDexes && excludeDexes.length > 0) {
    url.searchParams.append('excludeDexes', excludeDexes.join(','));
    console.log('🚫 Excluding DEXes:', excludeDexes.join(', '));
  }

  try {
    const response = await fetch(url.toString(), {
      headers: buildHeaders(),
    });
    const data = await response.json();
    
    if (!response.ok) {
      console.error('Quote error:', data);
      throw new Error(data.error || 'Failed to get quote');
    }

    console.log('Quote response:', data);

    return data;
  } catch (error) {
    console.error('Failed to fetch quote:', error);
    throw error;
  }
}

export async function getSwapTransaction(
  quote: JupiterQuote,
  userPublicKey: string,
  wrapAndUnwrapSol: boolean = false, // DISABLED so rent from WSOL account closure goes to fee payer, not user
  dynamicComputeUnitLimit: boolean = true,
  prioritizationFeeLamports: string | number = 'auto'
): Promise<JupiterSwapResponse> {
  console.log('Requesting swap transaction for user:', userPublicKey);

  try {
    const response = await fetch(`${JUPITER_API_BASE}/swap/v1/swap`, {
      method: 'POST',
      headers: buildHeaders(true),
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol,
        dynamicComputeUnitLimit,
        prioritizationFeeLamports,
        asLegacyTransaction: false, // CRITICAL: Must match quote parameter for versioned transactions
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Swap transaction error:', data);
      throw new Error(data.error || 'Failed to get swap transaction');
    }

    console.log('Swap transaction response received, size:', data.swapTransaction?.length || 0, 'chars');

    return data;
  } catch (error) {
    console.error('Failed to fetch swap transaction:', error);
    throw error;
  }
}
