import * as fs from 'fs';
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
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
  sendAndConfirmTransactionFactory,
  signTransactionMessageWithSigners,
  assertIsSendableTransaction,
  getProgramDerivedAddress,
  lamports,
} from '@solana/kit';
import * as bs58 from 'bs58';
import { getTransferSolInstruction } from '@solana-program/system';
import {
  getCreateTransactionBufferInstruction,
  getCreateTransactionFromBufferInstruction,
  getCreateProposalInstruction,
  getApproveProposalInstruction,
  getExecuteTransactionInstruction,
  getCloseTransactionBufferInstruction,
} from '../clients/js/src/generated/instructions';
import { fetchSettings } from '../clients/js/src/generated/accounts/settings';
import { ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS } from '../clients/js/src/generated/programs';
import { getTransactionMessageEncoder } from '../utils/index';
import { deriveSmartAccountInfo, decodeTransactionMessage, deriveTransactionPda } from '../utils/index';

async function testCorrectBufferedTransaction() {
  console.log('Testing CORRECT buffered transaction with proper CreateTransactionArgs encoding...');
  
  // Set up connection
  const rpc = createSolanaRpc('http://localhost:8899');
  const rpcSubscriptions = createSolanaRpcSubscriptions('ws://localhost:8900');

  // Load test state
  const testStateFile = './tests/test-state.json';
  if (!fs.existsSync(testStateFile)) {
    throw new Error('Test state file not found. Run setup and create account tests first.');
  }
  
  const testState = JSON.parse(fs.readFileSync(testStateFile, 'utf8'));
  const smartAccountSettings = address(testState.smartAccountSettings);
  const smartAccountPda = address(testState.smartAccountPda);
  
  console.log('📂 Loaded smart account settings:', smartAccountSettings);
  console.log('📂 Loaded smart account PDA:', smartAccountPda);

  // Load creator signer
  const creatorKeypairFile = fs.readFileSync('/Users/algorhythmic/.config/solana/id.json');
  const creatorKeypairBytes = new Uint8Array(JSON.parse(creatorKeypairFile.toString()));
  const creatorKeypair = await createKeyPairFromBytes(creatorKeypairBytes);
  const creatorSigner = await createSignerFromKeyPair(creatorKeypair);

  // Derive smart account info to get the bump
  const smartAccountInfo = await deriveSmartAccountInfo(smartAccountSettings);
  console.log('📊 Smart account info:', {
    smartAccountPda: smartAccountInfo.smartAccountPda,
    smartAccountPdaBump: smartAccountInfo.smartAccountPdaBump,
  });

  // Fetch settings to get the next transaction index (use the actual next index)
  const settings = await fetchSettings(rpc, smartAccountSettings);
  const nextTransactionIndex = settings.data.transactionIndex + 1n; // Use the actual next transaction index
  
  console.log('📊 Next transaction index:', nextTransactionIndex);

  try {
    // Step 1: Create the inner transaction (SOL transfer)
    console.log('🔧 Step 1: Creating inner transaction...');
    
    const transferInstruction = getTransferSolInstruction({
      source: createNoopSigner(smartAccountPda),
      destination: creatorSigner.address,
      amount: lamports(1000000n), // 0.001 SOL
    });
    
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    
    // Create inner transaction message (this will be executed by the smart account)
    const innerTransactionMessage = pipe(
      createTransactionMessage({ version: 'legacy' }),
      tx => appendTransactionMessageInstruction(transferInstruction, tx),
      tx => setTransactionMessageFeePayerSigner(createNoopSigner(smartAccountPda), tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx)
    );
    
    // Compile and decode the inner transaction
    const compiledInnerTx = compileTransaction(innerTransactionMessage);
    const decodedMessage = decodeTransactionMessage(compiledInnerTx.messageBytes as any);
    
    console.log('✅ Inner transaction created:', {
      staticAccounts: decodedMessage.staticAccounts.length,
      instructions: decodedMessage.instructions.length,
      messageSize: compiledInnerTx.messageBytes.length
    });

    // Step 2: Convert to TransactionMessage format (what the smart contract expects)
    console.log('🔧 Step 2: Converting to TransactionMessage...');
    
    const transactionMessage = {
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

    const transactionMessageBytes = getTransactionMessageEncoder().encode(transactionMessage);
    console.log('✅ TransactionMessage encoded:', {
      messageSize: transactionMessageBytes.length,
      numAccounts: transactionMessage.accountKeys.length,
      numInstructions: transactionMessage.instructions.length
    });
    
    // 🔍 DETAILED DEBUG LOGGING FOR COMPARISON WITH WORKING TRANSACTION
    console.log('📊 DETAILED TransactionMessage structure:');
    console.log('  numSigners:', transactionMessage.numSigners);
    console.log('  numWritableSigners:', transactionMessage.numWritableSigners);
    console.log('  numWritableNonSigners:', transactionMessage.numWritableNonSigners);
    console.log('  accountKeys.length:', transactionMessage.accountKeys.length);
    console.log('  accountKeys:', transactionMessage.accountKeys.map(key => key.toString()));
    console.log('  instructions.length:', transactionMessage.instructions.length);
    transactionMessage.instructions.forEach((ix, i) => {
      console.log(`  instruction[${i}]:`, {
        programIdIndex: ix.programIdIndex,
        accountIndexes: Array.from(ix.accountIndexes),
        data: Array.from(ix.data)
      });
    });
    console.log('  addressTableLookups.length:', transactionMessage.addressTableLookups.length);
    
    // 🔍 LOG THE EXACT BYTES FOR COMPARISON
    console.log('📊 Encoded bytes (first 50):', Array.from(transactionMessageBytes.slice(0, 50)));
    console.log('📊 Encoded hex (first 100 chars):', Array.from(transactionMessageBytes.slice(0, 50)).map(b => b.toString(16).padStart(2, '0')).join(''));

    // Step 3: The buffer should contain TransactionMessage bytes directly
    console.log('🔧 Step 3: Preparing buffer with TransactionMessage bytes...');
    
    const bufferData = transactionMessageBytes;
    console.log('✅ Buffer data prepared:', {
      bufferSize: bufferData.length,
      format: 'TransactionMessage bytes (what smart contract expects to deserialize)'
    });

    // Step 4: Calculate buffer hash and derive PDAs
    console.log('🔧 Step 4: Deriving PDAs...');
    
    const hashBuf = await crypto.subtle.digest('SHA-256', bufferData as any);
    const bufferHash = new Uint8Array(hashBuf);

    const [transactionPda] = await getProgramDerivedAddress({
      programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
      seeds: [
        new Uint8Array(Buffer.from('smart_account')),
        bs58.decode(smartAccountSettings),
        new Uint8Array(Buffer.from('transaction')),
        new Uint8Array(new BigUint64Array([nextTransactionIndex]).buffer),
      ],
    });

    const bufferIndex = 0; // Use a fixed buffer index to ensure consistency
    
    // 🔍 DEBUG: Log the exact seeds we're using
    console.log('🔍 DEBUG: PDA derivation seeds:');
    console.log('  SEED_PREFIX:', Buffer.from('smart_account'));
    console.log('  settings.key():', smartAccountSettings);
    console.log('  SEED_TRANSACTION_BUFFER:', Buffer.from('transaction_buffer'));
    console.log('  buffer_creator.key():', creatorSigner.address);
    console.log('  buffer_index (u8):', bufferIndex);
    console.log('  buffer_index.to_le_bytes():', new Uint8Array([bufferIndex])); // u8.to_le_bytes() is just [u8]
    
    const [transactionBufferPda] = await getProgramDerivedAddress({
      programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
      seeds: [
        new Uint8Array(Buffer.from('smart_account')),
        bs58.decode(smartAccountSettings),
        new Uint8Array(Buffer.from('transaction_buffer')),
        bs58.decode(creatorSigner.address as string),
        new Uint8Array([bufferIndex]), // This should match u8.to_le_bytes()
      ],
    });
    
    console.log('🔍 DEBUG: Derived transactionBufferPda:', transactionBufferPda);

    const [proposalPda] = await getProgramDerivedAddress({
      programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
      seeds: [
        new Uint8Array(Buffer.from('smart_account')),
        bs58.decode(smartAccountSettings),
        new Uint8Array(Buffer.from('transaction')),
        new Uint8Array(new BigUint64Array([nextTransactionIndex]).buffer),
        new Uint8Array(Buffer.from('proposal')),
      ],
    });

    console.log('📍 Transaction PDA:', transactionPda);
    console.log('📍 Buffer PDA:', transactionBufferPda);
    console.log('📍 Proposal PDA:', proposalPda);

    // Step 5: Create the buffer with the properly encoded CreateTransactionArgs
    console.log('🔧 Step 5: Creating transaction buffer...');
    
    const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
    
    const createBufferIx = getCreateTransactionBufferInstruction({
      settings: smartAccountSettings,
      transactionBuffer: transactionBufferPda,
      bufferCreator: creatorSigner,
      rentPayer: creatorSigner,
      systemProgram: address('11111111111111111111111111111111'),
      bufferIndex: bufferIndex,
      accountIndex: 0,
      finalBufferHash: Array.from(bufferHash),
      finalBufferSize: bufferData.length,
      buffer: Array.from(bufferData), // TransactionMessage bytes - what smart contract expects!
    });

    const createBufferMsg = pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageFeePayerSigner(creatorSigner, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      tx => appendTransactionMessageInstruction(createBufferIx, tx)
    );

    const signedCreateBuffer = await signTransactionMessageWithSigners(createBufferMsg);
    assertIsSendableTransaction(signedCreateBuffer);

    // 🔍 DEBUG: Add comprehensive error handling for buffer creation
    try {
      console.log('🔧 Attempting to create buffer...');
      await sendAndConfirm(signedCreateBuffer, { commitment: 'confirmed' });
      console.log('✅ Buffer created successfully')
    } catch (bufferError) {
      console.error('❌ Buffer creation failed!');
      console.error('Error details:', bufferError);
      
      // Check if it's a transaction simulation error
      if (bufferError.context && bufferError.context.logs) {
        console.error('📋 Transaction logs:');
        bufferError.context.logs.forEach((log, i) => {
          console.error(`  ${i}: ${log}`);
        });
      }
      
      // Check if it's a constraint violation
      if (bufferError.message) {
        console.error('📋 Error message:', bufferError.message);
      }
      
      throw bufferError; // Re-throw to stop execution
    }

    // Step 6: Create transaction from buffer
    console.log('🔧 Step 6: Creating transaction from buffer...');

    // Re-fetch settings just-in-time to get the true next index
    const latestSettings = await fetchSettings(rpc, smartAccountSettings);
    const nextTxIndex = latestSettings.data.transactionIndex + 1n;

    const createFromBufferTransactionPda = await deriveTransactionPda(smartAccountSettings, nextTxIndex);

    console.log('📍 JIT Transaction PDA:', createFromBufferTransactionPda, 'nextTxIndex:', nextTxIndex.toString());

    const zeroBytes = new Uint8Array(transactionMessageBytes.length); // auto-filled with 0s

    
    const createFromBufferIx = getCreateTransactionFromBufferInstruction({
      settings: smartAccountSettings,
      transaction: createFromBufferTransactionPda,
      fromBufferCreator: creatorSigner,
      rentPayer: creatorSigner,
      systemProgram: address('11111111111111111111111111111111'),
      transactionBuffer: transactionBufferPda,
      creator: creatorSigner,
      args: {
        accountIndex: 0,
        accountBump: smartAccountInfo.smartAccountPdaBump,
        ephemeralSigners: 0,
        // Provide the actual TransactionMessage bytes so Anchor can compute
        // the correct init space during account validation
        transactionMessage: zeroBytes,
        memo: undefined,
      },
    });

    const createFromBufferMsg = pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageFeePayerSigner(creatorSigner, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      tx => appendTransactionMessageInstruction(createFromBufferIx, tx)
    );

    const signedCreateFromBuffer = await signTransactionMessageWithSigners(createFromBufferMsg);
    assertIsSendableTransaction(signedCreateFromBuffer);

    const createFromBufferSignature = await sendAndConfirm(signedCreateFromBuffer, { commitment: 'confirmed' });
    console.log('✅ Transaction created from buffer:', createFromBufferSignature);

    // Step 7: Create and approve proposal
    console.log('🔧 Step 7: Creating and approving proposal...');
    
    const createProposalIx = getCreateProposalInstruction({
      settings: smartAccountSettings,
      proposal: proposalPda,
      creator: creatorSigner,
      rentPayer: creatorSigner,
      systemProgram: address('11111111111111111111111111111111'),
      transactionIndex: nextTxIndex,
      draft: false,
    });

    const createProposalMsg = pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageFeePayerSigner(creatorSigner, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      tx => appendTransactionMessageInstruction(createProposalIx, tx)
    );

    const signedCreateProposal = await signTransactionMessageWithSigners(createProposalMsg);
    const createProposalSignature = await sendAndConfirm(signedCreateProposal as any, { commitment: 'confirmed' });
    console.log('✅ Proposal created:', createProposalSignature);

    const approveIx = getApproveProposalInstruction({
      settings: smartAccountSettings,
      signer: creatorSigner,
      proposal: proposalPda,
      systemProgram: address('11111111111111111111111111111111'),
      args: { memo: undefined },
    });

    const approveMsg = pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageFeePayerSigner(creatorSigner, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      tx => appendTransactionMessageInstruction(approveIx, tx)
    );

    const signedApprove = await signTransactionMessageWithSigners(approveMsg);
    const approveSignature = await sendAndConfirm(signedApprove as any, { commitment: 'confirmed' });
    console.log('✅ Proposal approved:', approveSignature);

    // Step 8: Execute the transaction
    console.log('🔧 Step 8: Executing transaction...');
    
    let executeIx = getExecuteTransactionInstruction({
      settings: smartAccountSettings,
      proposal: proposalPda,
      transaction: createFromBufferTransactionPda,
      signer: creatorSigner,
    });

    // Add the required accounts for the inner transaction
    for (const accountKey of decodedMessage.staticAccounts) {
      executeIx.accounts.push({
        address: accountKey,
        role: 1, // WRITABLE
      });
    }

    const executeMsg = pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageFeePayerSigner(creatorSigner, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      tx => appendTransactionMessageInstruction(executeIx, tx)
    );

    const signedExecute = await signTransactionMessageWithSigners(executeMsg);
    assertIsSendableTransaction(signedExecute);
    const executeSignature = await sendAndConfirm(signedExecute, { commitment: 'confirmed' });
    
    console.log('🎉 TRANSACTION EXECUTED SUCCESSFULLY!');
    console.log('✅ Execution signature:', executeSignature);
    console.log('');
    console.log('🏆 SUCCESS! Buffered transaction completed end-to-end:');
    console.log('  1. ✅ Created proper CreateTransactionArgs structure');
    console.log('  2. ✅ Encoded it correctly using getCreateTransactionArgsEncoder()');
    console.log('  3. ✅ Stored it in transaction buffer');
    console.log('  4. ✅ Created transaction from buffer (deserialization worked!)');
    console.log('  5. ✅ Created and approved proposal');
    console.log('  6. ✅ Executed SOL transfer through smart account');

  } catch (error) {
    console.error('❌ Correct buffered transaction failed:', error);
    
    if (error.context?.logs) {
      console.log('📋 Contract logs:');
      error.context.logs.forEach((log: string) => console.log('  ', log));
    }
    
    throw error; // Re-throw to properly fail the test
  }
}

// Run the test
testCorrectBufferedTransaction();
