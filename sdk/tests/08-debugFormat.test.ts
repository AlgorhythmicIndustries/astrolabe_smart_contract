import * as fs from 'fs';
import {
  createSolanaRpc,
  createKeyPairFromBytes,
  createSignerFromKeyPair,
  address,
  createTransactionMessage,
  appendTransactionMessageInstruction,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  compileTransaction,
  pipe,
  createNoopSigner,
  getCompiledTransactionMessageDecoder,
  lamports,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import { getSmartAccountTransactionMessageEncoder } from '../clients/js/src/generated/types/smartAccountTransactionMessage';

async function debugTransactionFormat() {
  console.log('🔍 DEBUG: Analyzing transaction message formats...');
  
  // Set up connection and load test data
  const rpc = createSolanaRpc('http://localhost:8899');
  const testState = JSON.parse(fs.readFileSync('./tests/test-state.json', 'utf8'));
  const smartAccountPda = address(testState.smartAccountPda);
  
  const creatorKeypairFile = fs.readFileSync('/Users/algorhythmic/.config/solana/id.json');
  const creatorKeypairBytes = new Uint8Array(JSON.parse(creatorKeypairFile.toString()));
  const creatorKeypair = await createKeyPairFromBytes(creatorKeypairBytes);
  const creatorSigner = await createSignerFromKeyPair(creatorKeypair);

  // Create the exact same transaction as simpleTransaction.ts
  console.log('📋 Step 1: Creating the EXACT same transaction as working simpleTransaction.ts...');
  
  const transferInstruction = getTransferSolInstruction({
    source: createNoopSigner(smartAccountPda),
    destination: creatorSigner.address,
    amount: lamports(1000000n), // 0.001 SOL
  });
  
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  
  // Build the inner transaction message (same as simpleTransaction.ts)
  const innerTransactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(createNoopSigner(smartAccountPda), tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx => appendTransactionMessageInstruction(transferInstruction, tx)
  );
  
  const compiledInnerMessage = compileTransaction(innerTransactionMessage);
  const decodedMessage = getCompiledTransactionMessageDecoder().decode(compiledInnerMessage.messageBytes);
  
  // Create SmartAccountTransactionMessage (same as simpleTransaction.ts)
  const smartAccountMessage = {
    numSigners: 1,
    numWritableSigners: 1,
    numWritableNonSigners: decodedMessage.staticAccounts.length - 1,
    accountKeys: decodedMessage.staticAccounts,
    instructions: decodedMessage.instructions.map((ix: any) => ({
      programIdIndex: ix.programAddressIndex,
      accountIndexes: new Uint8Array(ix.accountIndices ?? []),
      data: ix.data ?? new Uint8Array(),
    })),
    addressTableLookups: [],
  };
  
  // Encode with Codama (same as simpleTransaction.ts)
  const transactionMessageBytes = getSmartAccountTransactionMessageEncoder().encode(smartAccountMessage);
  
  console.log('✅ Encoded SmartAccountTransactionMessage (simpleTransaction.ts format):');
  console.log('  Size:', transactionMessageBytes.length, 'bytes');
  console.log('  First 20 bytes:', Array.from(transactionMessageBytes.slice(0, 20)));
  console.log('  Structure:', {
    numSigners: smartAccountMessage.numSigners,
    numWritableSigners: smartAccountMessage.numWritableSigners,
    numWritableNonSigners: smartAccountMessage.numWritableNonSigners,
    accountKeysCount: smartAccountMessage.accountKeys.length,
    instructionsCount: smartAccountMessage.instructions.length,
  });
  
  console.log('');
  console.log('🎯 CONCLUSION:');
  console.log('  This is the EXACT format that simpleTransaction.ts produces and passes to CreateTransactionInstruction.');
  console.log('  If CreateTransactionInstruction works with this format, then TransactionMessage::deserialize()');
  console.log('  must be able to handle SmartAccountTransactionMessage-encoded bytes.');
  console.log('');
  console.log('  Therefore, the buffer should contain these same bytes!');
  
  return transactionMessageBytes;
}

debugTransactionFormat().catch(console.error);