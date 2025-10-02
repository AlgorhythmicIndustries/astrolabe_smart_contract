"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSwapQuote = getSwapQuote;
exports.getSwapTransaction = getSwapTransaction;
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
async function getSwapQuote(inputMint, outputMint, amount, slippage, platformFeeBps) {
    // Convert native to WSOL mint
    const actualInputMint = inputMint === 'native' ? WSOL_MINT : inputMint;
    const actualOutputMint = outputMint === 'native' ? WSOL_MINT : outputMint;
    console.log('Requesting quote with params:', {
        inputMint,
        outputMint,
        amount,
        slippage,
        platformFeeBps
    });
    const url = new URL('https://lite-api.jup.ag/swap/v1/quote');
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
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (!response.ok) {
            console.error('Quote error:', data);
            throw new Error(data.error || 'Failed to get quote');
        }
        console.log('Quote response:', data);
        return data;
    }
    catch (error) {
        console.error('Failed to fetch quote:', error);
        throw error;
    }
}
async function getSwapTransaction(quote, userPublicKey, wrapAndUnwrapSol = true, dynamicComputeUnitLimit = true, prioritizationFeeLamports = 'auto') {
    console.log('Requesting swap transaction for user:', userPublicKey);
    try {
        const response = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                quoteResponse: quote,
                userPublicKey,
                wrapAndUnwrapSol,
                dynamicComputeUnitLimit,
                prioritizationFeeLamports,
            }),
        });
        const data = await response.json();
        if (!response.ok) {
            console.error('Swap transaction error:', data);
            throw new Error(data.error || 'Failed to get swap transaction');
        }
        console.log('Swap transaction response received, size:', data.swapTransaction?.length || 0, 'chars');
        return data;
    }
    catch (error) {
        console.error('Failed to fetch swap transaction:', error);
        throw error;
    }
}
