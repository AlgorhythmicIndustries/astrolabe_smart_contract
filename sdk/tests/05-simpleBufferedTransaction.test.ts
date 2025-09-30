import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createKeyPairFromBytes,
  createSignerFromKeyPair,
  address,
  sendAndConfirmTransactionFactory,
  signTransactionMessageWithSigners,
  assertIsTransactionWithinSizeLimit,
  getCompiledTransactionMessageDecoder,
  decompileTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  createTransactionMessage,
  appendTransactionMessageInstruction,
  AccountRole,
  pipe,
  prependTransactionMessageInstruction,
  compileTransaction,
  getTransactionEncoder,
} from '@solana/kit';
import { getSetComputeUnitLimitInstruction } from '@solana-program/compute-budget';
import * as fs from 'fs';
import { createComplexBufferedTransaction } from '../complexBufferedTransaction';
import { deriveSmartAccountInfo } from '../utils/index';

async function testSimpleBufferedTransaction() {
  console.log('Testing complexBufferedTransaction.ts with a simple SOL transfer...');
  
  // Set up connection to Surfpool
  const rpc = createSolanaRpc('http://localhost:8899');
  const rpcSubscriptions = createSolanaRpcSubscriptions('ws://localhost:8900');
  
  // Use the same creator from the working example
  const creatorKeypairFile = fs.readFileSync('/Users/algorhythmic/.config/solana/id.json');
  const creatorKeypairBytes = new Uint8Array(JSON.parse(creatorKeypairFile.toString()));
  const creatorKeypair = await createKeyPairFromBytes(creatorKeypairBytes);
  const creatorSigner = await createSignerFromKeyPair(creatorKeypair);
  
  // Load the smart account settings from the previous test
  let smartAccountSettings;
  let smartAccountPda;
  try {
    const testState = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'test-state.json'), 'utf8'));
    smartAccountSettings = address(testState.smartAccountSettings);
    smartAccountPda = address(testState.smartAccountPda);
    console.log('📂 Loaded smart account settings from test state:', smartAccountSettings);
    console.log('📂 Loaded smart account PDA from test state:', smartAccountPda);
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
    
    // Create a simple SOL transfer transaction
    console.log('📦 Creating a simple SOL transfer transaction...');
    
    // Build a simple transfer instruction: smart account PDA -> creator (0.001 SOL)
    const transferAmount = 1_000_000n; // 0.001 SOL in lamports
    const recipient = address(creatorSigner.address); // Send back to creator
    
    console.log('💸 Transfer: Smart Account PDA -> Creator (0.001 SOL)');
    console.log('  From:', smartAccountInfo.smartAccountPda);
    console.log('  To:', recipient);
    
    // Build the inner transaction message with smart account PDA as fee payer (like Jupiter does)
    // Create a noop signer for the smart account PDA to use as fee payer during encoding
    const { createNoopSigner } = await import('@solana/kit');
    const smartAccountNoopSigner = createNoopSigner(address(smartAccountInfo.smartAccountPda));
    
    const innerTransactionMsg = pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageFeePayerSigner(smartAccountNoopSigner, tx), // Smart account PDA as fee payer (like Jupiter)
      tx => appendTransactionMessageInstruction({
        programAddress: address('11111111111111111111111111111111'), // System program
        accounts: [
          { address: address(smartAccountInfo.smartAccountPda), role: AccountRole.WRITABLE_SIGNER }, // From (smart account will sign via CPI)
          { address: recipient, role: AccountRole.WRITABLE }, // To
        ],
        data: new Uint8Array([
          2, 0, 0, 0, // Transfer instruction discriminator
          ...new Uint8Array(new BigUint64Array([transferAmount]).buffer), // Amount (little-endian u64)
        ]),
      }, tx)
    );
    
    // Compile and create a VersionedTransaction structure (like Jupiter returns)
    const compiled = compileTransaction(innerTransactionMsg);
    
    // Decode the message to get the number of signers
    const decodedMsg = getCompiledTransactionMessageDecoder().decode(compiled.messageBytes);
    const numSignatures = (decodedMsg as any).header?.numSignerAccounts || 1;
    
    // Create a VersionedTransaction with empty signatures (Jupiter returns this structure)
    const versionedTransaction = {
      version: 0,
      signatures: new Array(numSignatures).fill(new Uint8Array(64)), // Empty signatures
      messageBytes: compiled.messageBytes,
    };
    
    const innerTransactionBytes = getTransactionEncoder().encode(versionedTransaction as any);
    
    console.log('✅ Inner transaction created:', innerTransactionBytes.length, 'bytes');
    
    // Call complexBufferedTransaction
    console.log('🚀 Creating complex buffered transaction...');
    const result = await createComplexBufferedTransaction({
      rpc,
      smartAccountSettings,
      smartAccountPda: address(smartAccountInfo.smartAccountPda),
      smartAccountPdaBump: smartAccountInfo.smartAccountPdaBump,
      signer: creatorSigner,
      feePayer: address(creatorSigner.address),
      innerTransactionBytes,
      addressTableLookups: [], // No ALTs for simple SOL transfer
      memo: 'Simple Buffered SOL Transfer',
    });
    
    console.log('✅ createComplexBufferedTransaction succeeded!');
    console.log('📊 Results:', result.createBufferTx.length, 'buffer tx,', result.createFromBufferTx.length, 'create tx,', result.proposeAndApproveTx.length, 'propose tx,', result.executeTx.length, 'execute tx');
    
    // Execute the buffered transactions
    console.log('');
    console.log('🚀 EXECUTING BUFFERED TRANSACTIONS ON SURFPOOL...');
    console.log('');
    
    const bufferSignatures: string[] = [];
    
    // Step 1: Create transaction buffers
    console.log('📝 Step 1: Creating transaction buffers...');
    for (let i = 0; i < result.createBufferTx.length; i++) {
      console.log(`  🔄 Submitting buffer creation transaction ${i + 1}...`);
      console.log(`  📋 Transaction size: ${result.createBufferTx[i].length} bytes`);
      
      try {
        const compiled = getCompiledTransactionMessageDecoder().decode(result.createBufferTx[i]);
        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
        const decoded = decompileTransactionMessage(compiled);
        const txMessageWithSigner = setTransactionMessageFeePayerSigner(creatorSigner, decoded as any);
        const txMessageWithBlockhash = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, txMessageWithSigner as any);
        
        const signedBufferTx = await signTransactionMessageWithSigners(txMessageWithBlockhash as any);
        assertIsTransactionWithinSizeLimit(signedBufferTx);
        
        const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
        const signature = await sendAndConfirm({
          ...signedBufferTx,
          lifetimeConstraint: { lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
        } as any, { commitment: 'confirmed' });
        
        bufferSignatures.push(signature);
        console.log(`  ✅ Buffer creation ${i + 1} confirmed:`, signature);
      } catch (signingError: any) {
        console.error(`  ❌ Failed to sign/send buffer transaction ${i + 1}:`, signingError.message);
        throw signingError;
      }
    }

    // Step 2: Create transaction from buffer
    console.log('');
    console.log('📋 Step 2: Creating transaction from buffer (SDK-prepared)...');
    {
      const compiled = getCompiledTransactionMessageDecoder().decode(result.createFromBufferTx);
      const { value: latestBlockhash2 } = await rpc.getLatestBlockhash().send();
      const decoded = decompileTransactionMessage(compiled);
      const msgWithSigner = setTransactionMessageFeePayerSigner(creatorSigner, decoded as any);
      const msgWithBh = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash2, msgWithSigner as any);
      const signed = await signTransactionMessageWithSigners(msgWithBh as any);
      assertIsTransactionWithinSizeLimit(signed);
      const sendAndConfirm2 = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
      const sig = await sendAndConfirm2({
        ...signed,
        lifetimeConstraint: { lastValidBlockHeight: latestBlockhash2.lastValidBlockHeight },
      } as any, { commitment: 'confirmed' });
      console.log('  ✅ Create-from-buffer confirmed:', sig);
    }
    
    // Step 3: Propose and approve
    console.log('');
    console.log('📝 Step 3: PROPOSE AND APPROVE (SDK-prepared)...');
    {
      const compiled = getCompiledTransactionMessageDecoder().decode(result.proposeAndApproveTx);
      const { value: latestBlockhash3 } = await rpc.getLatestBlockhash().send();
      const decoded = decompileTransactionMessage(compiled);
      const msgWithSigner = setTransactionMessageFeePayerSigner(creatorSigner, decoded as any);
      const msgWithBh = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash3, msgWithSigner as any);
      const signed = await signTransactionMessageWithSigners(msgWithBh as any);
      assertIsTransactionWithinSizeLimit(signed);
      const sendAndConfirm3 = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
      const sig = await sendAndConfirm3({
        ...signed,
        lifetimeConstraint: { lastValidBlockHeight: latestBlockhash3.lastValidBlockHeight },
      } as any, { commitment: 'confirmed' });
      console.log('  ✅ Propose-and-approve confirmed:', sig);
    }

    // Step 4: Execute
    console.log('');
    console.log('⚡ Step 4: EXECUTE (SDK-prepared)...');
    {
      const compiled = getCompiledTransactionMessageDecoder().decode(result.executeTx);
      const { value: latestBlockhash4 } = await rpc.getLatestBlockhash().send();
      const decoded = decompileTransactionMessage(compiled);
      
      // Add compute budget for safety
      const decodedWithComputeBudget = prependTransactionMessageInstruction(
        getSetComputeUnitLimitInstruction({ units: 200_000 }),
        decoded as any
      );
      
      const msgWithSigner = setTransactionMessageFeePayerSigner(creatorSigner, decodedWithComputeBudget as any);
      const msgWithBh = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash4, msgWithSigner as any);
      const signed = await signTransactionMessageWithSigners(msgWithBh as any);
      assertIsTransactionWithinSizeLimit(signed);
      
      // Simulate first
      console.log('  🔍 Simulating execute transaction...');
      try {
        const { getBase64EncodedWireTransaction } = await import('@solana/kit');
        const base64Tx = getBase64EncodedWireTransaction(signed);
        const simulationResult = await rpc.simulateTransaction(base64Tx, {
          encoding: 'base64',
          commitment: 'confirmed',
        }).send();
        
        if (simulationResult.value.err) {
          console.error('  ❌ Simulation failed:', simulationResult.value.err);
          console.error('  📜 Logs:', simulationResult.value.logs);
        } else {
          console.log('  ✅ Simulation succeeded!');
          console.log(`  ⚡ Compute units consumed: ${simulationResult.value.unitsConsumed}`);
        }
      } catch (simErr) {
        console.error('  ⚠️  Simulation error:', simErr);
      }
      
      const sendAndConfirm4 = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
      const sig = await sendAndConfirm4({
        ...signed,
        lifetimeConstraint: { lastValidBlockHeight: latestBlockhash4.lastValidBlockHeight },
      } as any, { commitment: 'confirmed' });
      console.log('  🎉 EXECUTE CONFIRMED:', sig);
    }
    
    console.log('');
    console.log('🏆 SUCCESS! The complete buffered transaction flow executed successfully!');
    console.log('  1. ✅ Buffer creation transactions submitted');
    console.log('  2. ✅ Transaction created from buffer');
    console.log('  3. ✅ Proposal created and approved');
    console.log('  4. ✅ SOL transfer executed through smart account');
    console.log('');
    console.log('🔍 Transaction signatures:');
    bufferSignatures.forEach((sig, i) => {
      console.log(`  - Buffer ${i + 1}: https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=http://localhost:8899`);
    });
    
  } catch (error: any) {
    console.error('❌ Test failed:', error);
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
    throw error;
  }
  
  console.log('🎯 Simple buffered transaction test completed successfully!');
}

testSimpleBufferedTransaction();
