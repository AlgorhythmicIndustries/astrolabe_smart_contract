import {
  createSolanaRpc,
  createKeyPairFromBytes,
  createSignerFromKeyPair,
  address,
} from '@solana/kit';
import * as fs from 'fs';
import { createSmartAccountTransaction } from '../createSmartAccount';

async function testCreateSmartAccount() {
  console.log('Testing createSmartAccount.ts...');
  
  // Set up connection
  const rpc = createSolanaRpc('http://localhost:8899');
  
  // Use the same creator from the working example
  const creatorKeypairFile = fs.readFileSync('/Users/algorhythmic/.config/solana/id.json');
  const creatorKeypairBytes = new Uint8Array(JSON.parse(creatorKeypairFile.toString()));
  const creatorKeypair = await createKeyPairFromBytes(creatorKeypairBytes);
  const creatorSigner = await createSignerFromKeyPair(creatorKeypair);
  
  try {
    console.log('Creator address:', creatorSigner.address);
    console.log('About to call createSmartAccountTransaction...');
    
    const result = await createSmartAccountTransaction({
      rpc,
      creator: creatorSigner.address,
      feePayer: creatorSigner.address,
      threshold: 1,
      signers: [{ key: creatorSigner.address, permissions: { mask: 7 } }],
      restrictedSigners: [],
      settingsAuthority: null,
      timeLock: 0,
      rentCollector: null,
      memo: null,
    });
    
    console.log('✅ createSmartAccountTransaction succeeded!');
    console.log('Smart Account PDA:', result.smartAccountPda);
    console.log('Settings Address:', result.settingsAddress);
    console.log('Next Smart Account Index:', result.nextSmartAccountIndex.toString());
    console.log('Transaction Buffer Length:', result.transactionBuffer.length);
    
    // Store the settings address for use in subsequent tests
    const testState = {
      smartAccountSettings: result.settingsAddress,
      smartAccountPda: result.smartAccountPda,
      createdAt: new Date().toISOString(),
    };
    
    require('fs').writeFileSync(
      require('path').join(__dirname, 'test-state.json'),
      JSON.stringify(testState, null, 2)
    );
    console.log('💾 Test state saved for subsequent tests');
    
  } catch (error) {
    console.error('❌ createSmartAccountTransaction failed:', error);
  }
}

testCreateSmartAccount().catch(console.error);
