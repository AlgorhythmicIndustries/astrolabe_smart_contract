import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createKeyPairFromBytes,
  createSignerFromKeyPair,
  address,
  sendAndConfirmTransactionFactory,
  signTransactionMessageWithSigners,
  assertIsTransactionWithinSizeLimit,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  pipe,
  getProgramDerivedAddress,
  lamports,
} from '@solana/kit';
import * as fs from 'fs';
import * as path from 'path';
import { Buffer } from 'buffer';
import { createSmartAccountTransaction } from '../createSmartAccount';
import { getCreateSmartAccountInstructionAsync } from '../clients/js/src/generated/instructions';
import { fetchProgramConfig } from '../clients/js/src/generated/accounts/programConfig';
import { ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS } from '../clients/js/src/generated/programs';

async function testCreateSmartAccount() {
  console.log('Testing createSmartAccount.ts...');
  
  // Set up connection
  const rpc = createSolanaRpc('http://localhost:8899');
  const rpcSubscriptions = createSolanaRpcSubscriptions('ws://localhost:8900');
  
  // Use the same creator from the working example
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
  await rpc.requestAirdrop(backendFeePayerSigner.address, lamports(BigInt(1_000_000_000)), { commitment: 'confirmed' }).send();
  
  try {
    console.log('Creator address:', creatorSigner.address);
    console.log('About to call createSmartAccountTransaction...');
    
    const result = await createSmartAccountTransaction({
      rpc,
      creator: creatorSigner.address,
      feePayer: backendFeePayerSigner.address, // Use backend fee payer
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
    
    // Now actually sign and send the transaction to create the smart account on-chain
    console.log('🚀 Creating and sending actual transaction to blockchain...');
    
    // Get program config and treasury addresses
    const [programConfigPda] = await getProgramDerivedAddress({
      programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
      seeds: [
        new Uint8Array(Buffer.from('smart_account')),
        new Uint8Array(Buffer.from('program_config')),
      ],
    });
    const programConfig = await fetchProgramConfig(rpc, programConfigPda);
    const { treasury } = programConfig.data;
    
    // Create the instruction with the actual signer
    const createSmartAccountInstruction = await getCreateSmartAccountInstructionAsync({
      programConfig: programConfigPda,
      settings: result.settingsAddress,
      treasury,
      creator: creatorSigner,
      systemProgram: address('11111111111111111111111111111111'),
      settingsAuthority: null,
      threshold: 1,
      signers: [{ key: creatorSigner.address, permissions: { mask: 7 } }],
      restrictedSigners: [],
      timeLock: 0,
      rentCollector: null,
      memo: null,
    });
    
    // Build and send the transaction
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const transactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(backendFeePayerSigner, tx), // Use backend fee payer signer
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstructions([createSmartAccountInstruction], tx)
    );
    
    // Sign the transaction (fee payer signs automatically via setTransactionMessageFeePayerSigner, creator must sign instruction)
    // Since we used setTransactionMessageFeePayerSigner with backendFeePayerSigner, it is attached.
    // We also need to attach creatorSigner because it is a signer in the instruction (creator account).
    // However, pipe doesn't attach other signers. We must do it or signTransactionMessageWithSigners takes an array?
    // signTransactionMessageWithSigners signature: (message: TransactionMessage) => Promise<SignedTransaction>
    // It looks at message.accountKeys and signs if the account is a signer AND it finds a signer implementation.
    // setTransactionMessageFeePayerSigner attaches the fee payer signer.
    // For other signers, we need to ensure they are present?
    // Wait, transactionMessage from pipe() has instructions. The instruction from getCreateSmartAccountInstructionAsync
    // has 'creator' as a Signer object (TransactionSigner).
    // So the message *should* have the signer embedded.
    // Let's verify.
    
    const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
    assertIsTransactionWithinSizeLimit(signedTransaction);
    
    // Send and confirm the transaction
    const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
    const signature = await sendAndConfirm(signedTransaction, { commitment: 'confirmed' });
    
    console.log('✅ Smart account created on-chain!');
    console.log('Transaction signature:', signature);
    
    // Verify the account exists on-chain
    console.log('🔍 Verifying smart account settings exist on-chain...');
    try {
      const accountInfo = await rpc.getAccountInfo(result.settingsAddress, { commitment: 'confirmed' }).send();
      if (accountInfo.value) {
        console.log('✅ Smart account settings confirmed on-chain');
      } else {
        console.log('❌ Smart account settings not found on-chain');
      }
    } catch (error) {
      console.log('❌ Error verifying smart account settings:', error);
    }
    
    // Store the settings address for use in subsequent tests
    const testState = {
      smartAccountSettings: result.settingsAddress,
      smartAccountPda: result.smartAccountPda,
      createdAt: new Date().toISOString(),
      backendFeePayer: backendFeePayerSigner.address,
    };
    
    require('fs').writeFileSync(
      require('path').join(__dirname, 'test-state.json'),
      JSON.stringify(testState, null, 2)
    );
    console.log('💾 Test state saved for subsequent tests');
    
  } catch (error) {
    console.error('❌ createSmartAccountTransaction failed:', error);
    throw error; // Re-throw to properly fail the test
  }

  const { value: airdropSig} = await rpc.requestAirdrop(address('9F4ug3X5W4SQ27N3hb2tUTEHoa9L5DpBiQUGkU9Asg3W'), 10_000_000_000n as any).send();
  console.log('✅ Airdropped 10 SOL to smart account pda 9F4ug3X5W4SQ27N3hb2tUTEHoa9L5DpBiQUGkU9Asg3W');
}

testCreateSmartAccount();
