import {
    createSolanaRpc,
    createKeyPairFromBytes,
    createSignerFromKeyPair,
    address,
    createNoopSigner,
    lamports,
    generateKeyPair,
    getCompiledTransactionMessageDecoder,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import * as fs from 'fs';
import { createSimpleTransaction } from '../simpleTransaction';
import { deriveSmartAccountInfo } from '../utils/index';

// Use require for crypto to avoid TS issues with imports
const crypto = require('crypto');
const subtle = crypto.webcrypto.subtle;

async function testReproFeePayerCpi() {
    console.log('Testing reproduction of backend fee payer CPI signer issue...');

    // Set up connection
    const rpc = createSolanaRpc('http://localhost:8899');

    // 1. Setup User (Signer)
    const creatorKeypairFile = fs.readFileSync('/Users/algorhythmic/.config/solana/id.json');
    const creatorKeypairBytes = new Uint8Array(JSON.parse(creatorKeypairFile.toString()));
    const creatorKeypair = await createKeyPairFromBytes(creatorKeypairBytes);
    const creatorSigner = await createSignerFromKeyPair(creatorKeypair);

    // 2. Setup Backend Fee Payer (Dummy)
    const backendFeePayerKeypair = await generateKeyPair();
    const backendFeePayerSigner = await createSignerFromKeyPair(backendFeePayerKeypair);
    console.log('Backend Fee Payer:', backendFeePayerSigner.address);

    // Airdrop to backend fee payer so it can pay fees and transfer
    console.log('Airdropping to backend fee payer...');
    await rpc.requestAirdrop(backendFeePayerSigner.address, lamports(BigInt(1_000_000_000))).send(); // 1 SOL

    // 3. Load Smart Account Settings
    let smartAccountSettings;
    try {
        const testState = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'test-state.json'), 'utf8'));
        smartAccountSettings = address(testState.smartAccountSettings);
        console.log('📂 Loaded smart account settings:', smartAccountSettings);
    } catch (error) {
        throw new Error('❌ Could not load test state. Run 01-createSmartAccount.test.ts first!');
    }

    const smartAccountInfo = await deriveSmartAccountInfo(smartAccountSettings);
    console.log('Smart Account PDA:', smartAccountInfo.smartAccountPda);

    // 4. Create Inner Instruction: Transfer FROM Backend Fee Payer TO Smart Account
    // This requires Backend Fee Payer to be a SIGNER in the inner instruction.
    const innerTransferInstruction = getTransferSolInstruction({
        source: backendFeePayerSigner, // Must sign!
        destination: smartAccountInfo.smartAccountPda,
        amount: lamports(BigInt(100_000)), // 0.0001 SOL
    });

    console.log('Creating simple transaction with inner instruction requiring fee payer signature...');

    // 5. Build Smart Account Transaction
    const result = await createSimpleTransaction({
        rpc,
        smartAccountSettings,
        smartAccountPda: smartAccountInfo.smartAccountPda,
        smartAccountPdaBump: smartAccountInfo.smartAccountPdaBump,
        signer: creatorSigner,
        feePayer: backendFeePayerSigner.address, // Backend is fee payer
        innerInstructions: [innerTransferInstruction],
        memo: 'Repro Fee Payer CPI',
    });

    console.log('✅ Transaction built. Serializing and signing...');

    // 6. Construct the final transaction and sign it
    const messageBytes = result.transactionBuffer;
    const decoder = getCompiledTransactionMessageDecoder();
    const decodedMessage = decoder.decode(messageBytes);

    // Sign with Backend Fee Payer using crypto.subtle
    const feePayerSignatureBuffer = await subtle.sign(
        'Ed25519',
        backendFeePayerKeypair.privateKey,
        messageBytes
    );
    const feePayerSignature = new Uint8Array(feePayerSignatureBuffer);

    // Sign with Creator using crypto.subtle
    const creatorSignatureBuffer = await subtle.sign(
        'Ed25519',
        creatorKeypair.privateKey,
        messageBytes
    );
    const creatorSignature = new Uint8Array(creatorSignatureBuffer);

    // Construct the transaction with signatures
    const numRequiredSignatures = messageBytes[1];
    console.log('Number of required signatures:', numRequiredSignatures);

    const staticAccounts = decodedMessage.staticAccounts;
    const signerAccounts = staticAccounts.slice(0, numRequiredSignatures);

    const signatures: Record<string, Uint8Array> = {};

    // Map addresses to signatures
    signatures[backendFeePayerSigner.address.toString()] = feePayerSignature;
    signatures[creatorSigner.address.toString()] = creatorSignature;

    // Create the signature array in the correct order
    const orderedSignatures = signerAccounts.map(acc => {
        const sig = signatures[acc.toString()];
        if (!sig) throw new Error(`Missing signature for account ${acc.toString()}`);
        return sig;
    });

    const signatureCountBytes = new Uint8Array([orderedSignatures.length]);
    const signaturesBytes = new Uint8Array(orderedSignatures.length * 64);
    orderedSignatures.forEach((sig, i) => {
        signaturesBytes.set(sig, i * 64);
    });

    const serializedTransaction = new Uint8Array(
        signatureCountBytes.length + signaturesBytes.length + messageBytes.length
    );
    serializedTransaction.set(signatureCountBytes, 0);
    serializedTransaction.set(signaturesBytes, signatureCountBytes.length);
    serializedTransaction.set(messageBytes, signatureCountBytes.length + signaturesBytes.length);

    console.log('🚀 Sending transaction...');
    const base64Tx = Buffer.from(serializedTransaction).toString('base64');

    // Cast to any to bypass strict type check for Base64EncodedWireTransaction
    const sendResult = await rpc.sendTransaction(base64Tx as any, {
        encoding: 'base64',
        skipPreflight: false,
        preflightCommitment: 'confirmed'
    }).send();

    console.log('Transaction sent! Signature:', sendResult);
    console.log('✅ Test finished successfully');
}

testReproFeePayerCpi().catch(e => {
    console.error('❌ Test failed:', e);
    process.exit(1);
});
