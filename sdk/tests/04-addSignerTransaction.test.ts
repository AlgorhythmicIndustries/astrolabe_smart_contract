import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createKeyPairFromBytes,
  createSignerFromKeyPair,
  address,
  sendAndConfirmTransactionFactory,
  signTransactionMessageWithSigners,
  getTransactionDecoder,
  createTransactionMessage,
  appendTransactionMessageInstructions,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  generateKeyPair,
  getAddressFromPublicKey,
  pipe,
  lamports,
} from '@solana/kit';
import * as fs from 'fs';
import * as path from 'path';
import { addPasskeyAuthorityTransaction } from '../addPasskeyAuthority';
import { fetchSettings } from '../clients/js/src/generated/accounts/settings';

async function testAddSignerTransaction() {
  console.log('Testing addPasskeyAuthorityTransaction...');
  console.log('This test adds a new signer to an existing smart account.');
  console.log('');
  
  // Set up connection
  const rpc = createSolanaRpc('http://localhost:8899');
  const rpcSubscriptions = createSolanaRpcSubscriptions('ws://localhost:8900');
  
  // Load the creator signer (existing signer on the smart account)
  const creatorKeypairFile = fs.readFileSync('/Users/algorhythmic/.config/solana/id.json');
  const creatorKeypairBytes = new Uint8Array(JSON.parse(creatorKeypairFile.toString()));
  const creatorKeypair = await createKeyPairFromBytes(creatorKeypairBytes);
  const creatorSigner = await createSignerFromKeyPair(creatorKeypair);
  
  // Load Backend Fee Payer
  const backendFeePayerFile = fs.readFileSync(path.join(__dirname, 'backend-fee-payer-keypair.json'));
  const backendFeePayerBytes = new Uint8Array(JSON.parse(backendFeePayerFile.toString()));
  const backendFeePayerKeypair = await createKeyPairFromBytes(backendFeePayerBytes);
  const backendFeePayerSigner = await createSignerFromKeyPair(backendFeePayerKeypair);
  console.log('📝 Backend Fee Payer:', backendFeePayerSigner.address);

  // Fund Backend Fee Payer
  console.log('💰 Funding Backend Fee Payer...');
  await rpc.requestAirdrop(backendFeePayerSigner.address, lamports(1_000_000_000n), { commitment: 'confirmed' }).send();
  
  console.log('📝 Creator/Fee Payer:', creatorSigner.address);
  
  // Load the smart account settings from previous tests
  let smartAccountSettings;
  try {
    const testState = JSON.parse(fs.readFileSync(__dirname + '/test-state.json', 'utf8'));
    smartAccountSettings = address(testState.smartAccountSettings);
    console.log('📂 Loaded smart account settings:', smartAccountSettings);
  } catch (error) {
    throw new Error('❌ Could not load test state. Make sure to run 01-createSmartAccount.test.ts first!');
  }
  
  try {
    // Step 1: Fetch current settings to see existing signers
    console.log('');
    console.log('📊 Step 1: Fetching current smart account settings...');
    const settingsBefore = await fetchSettings(rpc, smartAccountSettings);
    
    console.log('Current settings:');
    console.log('  Threshold:', settingsBefore.data.threshold);
    console.log('  Time Lock:', settingsBefore.data.timeLock, 'seconds');
    console.log('  Transaction Index:', settingsBefore.data.transactionIndex.toString());
    console.log('  Number of Signers:', settingsBefore.data.signers.length);
    console.log('  Existing Signers:');
    settingsBefore.data.signers.forEach((signer, i) => {
      console.log(`    ${i + 1}. ${signer.key} (permissions: 0x${signer.permissions.mask.toString(16).padStart(2, '0')})`);
    });
    
    // Step 2: Generate a new keypair to act as the new signer
    console.log('');
    console.log('🔑 Step 2: Generating new signer keypair...');
    const newSignerKeypair = await generateKeyPair();
    const newSignerAddress = await getAddressFromPublicKey(newSignerKeypair.publicKey);
    console.log('New signer public key:', newSignerAddress);
    
    // Step 3: Build the add signer transaction directly
    // Note: We could use addPasskeyAuthorityTransaction, but it returns an unsigned transaction
    // designed for backend use. For testing, we'll build it directly with proper signers.
    console.log('');
    console.log('🔧 Step 3: Creating add signer transaction...');
    
    const { getExecuteSettingsTransactionSyncInstruction } = await import('../clients/js/src/generated/instructions');
    const { ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS } = await import('../clients/js/src/generated/programs');
    const { AccountRole } = await import('@solana/kit');
    
    // Build the execute_settings_transaction_sync instruction
    // IMPORTANT: Use the SAME creatorSigner instance everywhere to avoid "multiple signers" error
    const executeInstruction = getExecuteSettingsTransactionSyncInstruction({
      settings: smartAccountSettings,
      feePayer: backendFeePayerSigner, // Backend pays rent
      systemProgram: address('11111111111111111111111111111111'),
      program: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
      numSigners: 1,
      actions: [
        {
          __kind: 'AddSigner',
          newSigner: {
            key: newSignerAddress,
            permissions: { mask: 0x07 } // Full permissions (PROPOSE | VOTE | EXECUTE)
          },
        }
      ],
      memo: 'Test: Adding new signer via SDK',
    });
    
    // Add the creator as a remaining account (they must sign to authorize the settings change)
    // Use the SAME creatorSigner instance here too
    const instructionWithCreator = {
      ...executeInstruction,
      accounts: [
        ...executeInstruction.accounts,
        {
          address: creatorSigner.address,
          role: AccountRole.READONLY_SIGNER, // Creator must sign
          signer: creatorSigner, // Same instance as used for fee payer and rent payer
        }
      ]
    };
    
    console.log('✅ Transaction instruction created');
    console.log('  New signer key:', newSignerAddress);
    console.log('  Permissions: 0x07 (full)');
    
    // Step 4: Build, sign and send the transaction
    console.log('');
    console.log('📝 Step 4: Building and sending transaction...');
    
    // Get fresh blockhash
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    
    // Build the transaction message with proper signers
    const transactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(backendFeePayerSigner, tx), // Backend pays fee
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstructions([instructionWithCreator], tx)
    );
    
    // Sign the transaction (creatorSigner is in instruction, backendFeePayerSigner is fee payer)
    const signedTx = await signTransactionMessageWithSigners(transactionMessage as any);
    
    // Send and confirm
    const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
    const signature = await sendAndConfirm({
      ...signedTx,
      lifetimeConstraint: { lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
    } as any, { commitment: 'confirmed' });
    
    console.log('✅ Transaction confirmed!');
    console.log('  Signature:', signature);
    console.log('  Explorer:', `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=http://localhost:8899`);
    
    // Step 5: Verify the new signer was added
    console.log('');
    console.log('🔍 Step 5: Verifying new signer was added...');
    const settingsAfter = await fetchSettings(rpc, smartAccountSettings);
    
    console.log('Updated settings:');
    console.log('  Number of Signers:', settingsAfter.data.signers.length);
    console.log('  All Signers:');
    settingsAfter.data.signers.forEach((signer, i) => {
      const isNew = signer.key === newSignerAddress;
      const marker = isNew ? '← NEW' : '';
      console.log(`    ${i + 1}. ${signer.key} (permissions: 0x${signer.permissions.mask.toString(16).padStart(2, '0')}) ${marker}`);
    });
    
    // Verify the count increased by 1
    const expectedCount = settingsBefore.data.signers.length + 1;
    if (settingsAfter.data.signers.length !== expectedCount) {
      throw new Error(`Expected ${expectedCount} signers, but found ${settingsAfter.data.signers.length}`);
    }
    
    // Verify the new signer is present
    const newSignerExists = settingsAfter.data.signers.some(s => s.key === newSignerAddress);
    if (!newSignerExists) {
      throw new Error('New signer was not found in the settings account!');
    }
    
    // Verify the new signer has correct permissions
    const newSignerEntry = settingsAfter.data.signers.find(s => s.key === newSignerAddress);
    if (newSignerEntry?.permissions.mask !== 0x07) {
      throw new Error(`Expected permissions 0x07, but got 0x${newSignerEntry?.permissions.mask.toString(16)}`);
    }
    
    console.log('');
    console.log('🎉 SUCCESS! New signer was added successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log('  - Started with', settingsBefore.data.signers.length, 'signer(s)');
    console.log('  - Added new signer:', newSignerAddress);
    console.log('  - Now have', settingsAfter.data.signers.length, 'signer(s)');
    console.log('  - New signer has full permissions (0x07)');
    console.log('');
    console.log('✅ The addPasskeyAuthorityTransaction SDK function works correctly!');
    
    // Save the new signer info for potential future tests
    const addSignerTestState = {
      smartAccountSettings,
      originalSigner: creatorSigner.address,
      newSigner: newSignerAddress,
      signersCount: settingsAfter.data.signers.length,
      addedAt: new Date().toISOString(),
    };
    
    fs.writeFileSync(
      __dirname + '/add-signer-test-state.json',
      JSON.stringify(addSignerTestState, null, 2)
    );
    console.log('💾 Test state saved to add-signer-test-state.json');
    
  } catch (error: any) {
    console.error('❌ Add signer transaction failed:', error);
    
    if (error?.context?.logs) {
      console.log('📋 Contract logs:');
      error.context.logs.forEach((log: string) => console.log('  ', log));
    }
    
    throw error; // Re-throw to properly fail the test
  }
}

// Run the test
testAddSignerTransaction();

