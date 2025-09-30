import {
  createSolanaRpc,
  createKeyPairFromBytes,
  createSignerFromKeyPair,
  address,
  createNoopSigner,
  lamports,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import * as fs from 'fs';
import { createSimpleTransaction } from '../simpleTransaction';
import { deriveSmartAccountInfo } from '../utils/index';

async function testSimpleTransaction() {
  console.log('Testing simpleTransaction.ts...');
  
  // Set up connection
  const rpc = createSolanaRpc('http://localhost:8899');
  
  // Use the same creator from the working example
  const creatorKeypairFile = fs.readFileSync('/Users/algorhythmic/.config/solana/id.json');
  const creatorKeypairBytes = new Uint8Array(JSON.parse(creatorKeypairFile.toString()));
  const creatorKeypair = await createKeyPairFromBytes(creatorKeypairBytes);
  const creatorSigner = await createSignerFromKeyPair(creatorKeypair);
  
  // Load the smart account settings from the previous test
  let smartAccountSettings;
  try {
    const testState = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'test-state.json'), 'utf8'));
    smartAccountSettings = address(testState.smartAccountSettings);
    console.log('📂 Loaded smart account settings from test state:', smartAccountSettings);
  } catch (error) {
    throw new Error('❌ Could not load test state. Make sure to run 01-createSmartAccount.test.ts first!');
  }
  
  try {
    console.log('Deriving smart account info...');
    const smartAccountInfo = await deriveSmartAccountInfo(smartAccountSettings);
    console.log('Smart account info:', {
      smartAccountPda: smartAccountInfo.smartAccountPda,
      accountIndex: smartAccountInfo.accountIndex.toString(),
      smartAccountPdaBump: smartAccountInfo.smartAccountPdaBump,
    });
    
    // Create a simple transfer instruction
    const transferInstruction = getTransferSolInstruction({
      source: createNoopSigner(smartAccountInfo.smartAccountPda),
      destination: creatorSigner.address,
      amount: lamports(BigInt(500_000_000)), // 0.5 SOL
    });
    
    console.log('Creating simple transaction...');
    const result = await createSimpleTransaction({
      rpc,
      smartAccountSettings,
      smartAccountPda: smartAccountInfo.smartAccountPda,
      smartAccountPdaBump: smartAccountInfo.smartAccountPdaBump,
      signer: creatorSigner,
      feePayer: creatorSigner.address,
      innerInstructions: [transferInstruction],
      memo: 'Test transfer using simpleTransaction',
    });
    
    console.log('✅ createSimpleTransaction succeeded!');
    console.log('Transaction PDA:', result.transactionPda);
    console.log('Proposal PDA:', result.proposalPda);
    console.log('Transaction Index:', result.transactionIndex.toString());
    console.log('Transaction Buffer Length:', result.transactionBuffer.length);
    
  } catch (error) {
    console.error('❌ createSimpleTransaction failed:', error);
    throw error; // Re-throw to properly fail the test
  }
}

testSimpleTransaction();
