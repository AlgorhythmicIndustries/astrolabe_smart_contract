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
  assertIsTransactionWithinSizeLimit,
  getCompiledTransactionMessageDecoder,
  decompileTransactionMessage,
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

async function testCorrectBufferedTransaction() {
  console.log('Testing CORRECT buffered transaction with raw TransactionMessage bytes...');
  
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

  // Fetch settings to get the next transaction index
  const settings = await fetchSettings(rpc, smartAccountSettings);
  const nextTransactionIndex = settings.data.transactionIndex + 1n;
  
  console.log('📊 Next transaction index:', nextTransactionIndex);

  // Get the smart account PDA bump
  const [smartAccountPdaCheck, smartAccountPdaBump] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      bs58.decode(smartAccountSettings),
      new Uint8Array(Buffer.from('smart_account')),
      new Uint8Array([0]), // account index 0
    ],
  });
  
  console.log('📍 Smart Account PDA Check:', smartAccountPdaCheck);
  console.log('📍 Smart Account PDA from state:', smartAccountPda);
  console.log('📍 Smart Account PDA Bump:', smartAccountPdaBump);
  console.log('📍 PDA Match:', smartAccountPdaCheck === smartAccountPda ? '✅' : '❌');

  // Create a simple SOL transfer transaction message
  console.log('🔧 Creating raw Solana TransactionMessage for buffer...');
  
  const transferInstruction = getTransferSolInstruction({
    source: createNoopSigner(smartAccountPda),
    destination: creatorSigner.address,
    amount: lamports(1000000n), // 0.001 SOL in lamports
  });
  
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  
  // Build the inner transaction message - this is what goes in the buffer
  const innerTransactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(createNoopSigner(smartAccountPda), tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx => appendTransactionMessageInstruction(transferInstruction, tx)
  );
  
  // Compile to get the raw message bytes that Rust can deserialize
  const compiledInnerMessage = compileTransaction(innerTransactionMessage);
  const rawTransactionMessageBytes = new Uint8Array(compiledInnerMessage.messageBytes);
  
  console.log('✅ Raw Solana TransactionMessage created:', {
    messageSize: rawTransactionMessageBytes.length,
    feePayer: smartAccountPda
  });

  // This is what should go in the buffer - raw TransactionMessage bytes
  const bufferContent = rawTransactionMessageBytes;
  
  console.log(`📊 Buffer content size: ${bufferContent.length} bytes`);
  console.log(`🔍 Buffer contains: Raw Solana TransactionMessage (not SmartAccountTransactionMessage)`);

  // Calculate buffer hash
  const hashBuf = await crypto.subtle.digest('SHA-256', bufferContent as unknown as ArrayBuffer);
  const bufferHash = new Uint8Array(hashBuf);

  // Derive PDAs
  const [transactionPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      bs58.decode(smartAccountSettings),
      new Uint8Array(Buffer.from('transaction')),
      new Uint8Array(Buffer.from(nextTransactionIndex.toString(16).padStart(16, '0'), 'hex').reverse()),
    ],
  });

  const bufferIndex = 104;
  const [transactionBufferPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      bs58.decode(smartAccountSettings),
      new Uint8Array(Buffer.from('transaction_buffer')),
      bs58.decode(creatorSigner.address as string),
      new Uint8Array([bufferIndex & 0xff]),
    ],
  });

  const [proposalPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      bs58.decode(smartAccountSettings),
      new Uint8Array(Buffer.from('transaction')),
      new Uint8Array(Buffer.from(nextTransactionIndex.toString(16).padStart(16, '0'), 'hex').reverse()),
      new Uint8Array(Buffer.from('proposal')),
    ],
  });

  console.log('📍 Transaction PDA:', transactionPda);
  console.log('📍 Buffer PDA:', transactionBufferPda);
  console.log('📍 Proposal PDA:', proposalPda);

  // Step 1: Create buffer with raw TransactionMessage bytes
  console.log('');
  console.log('📝 Step 1: Creating buffer with raw TransactionMessage bytes...');
  
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
    finalBufferSize: bufferContent.length,
    buffer: Array.from(bufferContent),
  });

  const createBufferMsg = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(creatorSigner, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx => appendTransactionMessageInstruction(createBufferIx, tx)
  );

  const signedCreateBuffer = await signTransactionMessageWithSigners(createBufferMsg);
  assertIsTransactionWithinSizeLimit(signedCreateBuffer);

  const createBufferSignature = await sendAndConfirm(signedCreateBuffer, { commitment: 'confirmed' });
  console.log('  ✅ Buffer created with raw TransactionMessage:', createBufferSignature);

  // Step 2: Create transaction from buffer
  console.log('');
  console.log('📋 Step 2: Creating transaction from buffer (should deserialize TransactionMessage)...');
  
  const createFromBufferIx = getCreateTransactionFromBufferInstruction({
    settings: smartAccountSettings,
    transaction: transactionPda,
    bufferCreator: creatorSigner,
    rentPayer: creatorSigner,
    systemProgram: address('11111111111111111111111111111111'),
    transactionBuffer: transactionBufferPda,
    creator: creatorSigner,
    args: {
      accountIndex: 0,
      accountBump: smartAccountPdaBump,
      ephemeralSigners: 0,
      transactionMessage: new Uint8Array([0, 0, 0, 0, 0, 0]), // Required empty marker
      memo: null,
    },
  });

  const createFromBufferMsg = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(creatorSigner, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx => appendTransactionMessageInstruction(createFromBufferIx, tx)
  );

  try {
    const signedCreateFromBuffer = await signTransactionMessageWithSigners(createFromBufferMsg);
    assertIsTransactionWithinSizeLimit(signedCreateFromBuffer);

    const createFromBufferSignature = await sendAndConfirm(signedCreateFromBuffer, { commitment: 'confirmed' });
    console.log('  ✅ Transaction created from buffer (TransactionMessage deserialized!):', createFromBufferSignature);

    // Step 3: Create proposal
    console.log('');
    console.log('📋 Step 3: Creating proposal...');
    
    const createProposalIx = getCreateProposalInstruction({
      settings: smartAccountSettings,
      proposal: proposalPda,
      creator: creatorSigner,
      rentPayer: creatorSigner,
      systemProgram: address('11111111111111111111111111111111'),
      args: {
        transactionIndex: nextTransactionIndex,
        draft: false,
      },
    });

    const createProposalMsg = pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageFeePayerSigner(creatorSigner, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      tx => appendTransactionMessageInstruction(createProposalIx, tx)
    );

    const signedCreateProposal = await signTransactionMessageWithSigners(createProposalMsg);
    const createProposalSignature = await sendAndConfirm(signedCreateProposal, { commitment: 'confirmed' });
    console.log('  ✅ Proposal created:', createProposalSignature);

    // Step 4: Approve proposal
    console.log('');
    console.log('📋 Step 4: Approving proposal...');
    
    const approveIx = getApproveProposalInstruction({
      settings: smartAccountSettings,
      signer: creatorSigner,
      proposal: proposalPda,
      systemProgram: address('11111111111111111111111111111111'),
      args: { memo: null },
    });

    const approveMsg = pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageFeePayerSigner(creatorSigner, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      tx => appendTransactionMessageInstruction(approveIx, tx)
    );

    const signedApprove = await signTransactionMessageWithSigners(approveMsg);
    const approveSignature = await sendAndConfirm(signedApprove, { commitment: 'confirmed' });
    console.log('  ✅ Proposal approved:', approveSignature);

    // Step 5: Execute transaction
    console.log('');
    console.log('⚡ Step 5: Executing SOL transfer...');
    
    const executeIx = getExecuteTransactionInstruction({
      settings: smartAccountSettings,
      transaction: transactionPda,
      systemProgram: address('11111111111111111111111111111111'),
    });

    const executeMsg = pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageFeePayerSigner(creatorSigner, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      tx => appendTransactionMessageInstruction(executeIx, tx)
    );

    const signedExecute = await signTransactionMessageWithSigners(executeMsg);
    const executeSignature = await sendAndConfirm(signedExecute, { commitment: 'confirmed' });
    
    console.log('  🎉 SOL TRANSFER EXECUTED!');
    console.log('  ✅ Execution signature:', executeSignature);
    console.log('');
    console.log('🏆 SUCCESS! Correct buffered transaction completed successfully!');
    console.log('  - Buffer created with raw Solana TransactionMessage bytes');
    console.log('  - Rust code deserialized TransactionMessage and converted to SmartAccountTransactionMessage');  
    console.log('  - Transaction created from buffer');
    console.log('  - Proposal created and approved');
    console.log('  - SOL transfer executed through smart account');

    // Step 6: Clean up - close the buffer
    console.log('');
    console.log('🧹 Step 6: Cleaning up - closing buffer...');
    
    try {
      const closeBufferIx = getCloseTransactionBufferInstruction({
        settings: smartAccountSettings,
        transactionBuffer: transactionBufferPda,
        bufferCreator: creatorSigner,
        systemProgram: address('11111111111111111111111111111111'),
      });

      const closeBufferMsg = pipe(
        createTransactionMessage({ version: 0 }),
        tx => setTransactionMessageFeePayerSigner(creatorSigner, tx),
        tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
        tx => appendTransactionMessageInstruction(closeBufferIx, tx)
      );

      const signedCloseBuffer = await signTransactionMessageWithSigners(closeBufferMsg);
      const closeSignature = await sendAndConfirm(signedCloseBuffer, { commitment: 'confirmed' });
      
      console.log('  ✅ Buffer closed successfully:', closeSignature);
      console.log('  💰 Rent reclaimed to creator');
    } catch (cleanupError) {
      console.log('  ⚠️ Buffer cleanup failed (this is okay):', cleanupError.message);
    }

  } catch (error) {
    console.error('❌ Correct buffered transaction failed:', error);
    
    if (error.context?.logs) {
      console.log('📋 Contract logs:');
      error.context.logs.forEach((log: string) => console.log('  ', log));
    }
    
    throw error;
  }
}

// Run the test
testCorrectBufferedTransaction().catch(console.error);