import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createKeyPairFromBytes,
  createSignerFromKeyPair,
  airdropFactory,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
  assertIsTransactionWithinSizeLimit,
  lamports,
  address,
  getProgramDerivedAddress,
} from '@solana/kit';
import * as fs from 'fs';
import { Buffer } from 'buffer';
import {
  getInitializeProgramConfigInstructionAsync,
} from '../clients/js/src/generated/instructions';
import {
  ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
} from '../clients/js/src/generated/programs';

async function setupProgramConfig() {
  console.log('🔧 Setting up program configuration...');
  
  // Set up connection
  const rpc = createSolanaRpc('http://localhost:8899');
  const rpcSubscriptions = createSolanaRpcSubscriptions('ws://localhost:8900');

  // Load the program config initializer keypair
  const initializerKeypairFile = fs.readFileSync('../test-program-config-initializer-keypair.json');
  const initializerKeypairBytes = new Uint8Array(JSON.parse(initializerKeypairFile.toString()));
  const initializerKeypair = await createKeyPairFromBytes(initializerKeypairBytes);
  const initializerSigner = await createSignerFromKeyPair(initializerKeypair);

  console.log('Program config initializer:', initializerSigner.address);

  // Airdrop to the initializer
  const airdrop = airdropFactory({rpc: rpc, rpcSubscriptions: rpcSubscriptions});
  await airdrop({
    commitment: 'confirmed',
    lamports: lamports(BigInt(10_000_000_000)), // 10 SOL
    recipientAddress: initializerSigner.address,
  });
  console.log('✅ Airdropped 10 SOL to program config initializer');

  // Derive the program config PDA
  console.log('🔧 Deriving program config PDA...');
  console.log('Program address:', ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS);
  const [programConfigPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      new Uint8Array(Buffer.from('program_config')),
    ],
  });

  // Derive the treasury PDA
  console.log('🔧 Deriving treasury PDA...');
  const [treasuryPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      new Uint8Array(Buffer.from('treasury')),
    ],
  });

  console.log('Program Config PDA:', programConfigPda);
  console.log('Treasury PDA:', treasuryPda);

  // Validate PDAs are properly derived
  if (!programConfigPda) {
    throw new Error('Failed to derive program config PDA');
  }
  if (!treasuryPda) {
    throw new Error('Failed to derive treasury PDA');
  }

  try {
    // Build the initialize program config instruction
    const initInstruction = await getInitializeProgramConfigInstructionAsync({
      programConfig: programConfigPda,
      treasury: treasuryPda,
      initializer: initializerSigner,
      systemProgram: address('11111111111111111111111111111111'),
      authority: initializerSigner.address,
      smartAccountCreationFee: BigInt(0),
    });

    // Build the transaction message
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const transactionMessage = createTransactionMessage({ version: 0 });
    const messageWithFeePayer = setTransactionMessageFeePayerSigner(initializerSigner, transactionMessage);
    const messageWithLifetime = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, messageWithFeePayer);
    const finalMessage = appendTransactionMessageInstructions([initInstruction], messageWithLifetime);

    // Sign and send the transaction
    const signedTransaction = await signTransactionMessageWithSigners(finalMessage);
    assertIsTransactionWithinSizeLimit(signedTransaction);

    const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
    await sendAndConfirm(signedTransaction, { commitment: 'confirmed' });
    
    console.log('✅ Program configuration initialized successfully!');
    
  } catch (error: any) {
    if (error.message?.includes('already in use') || error.context?.logs?.some((log: string) => log.includes('already in use'))) {
      console.log('✅ Program configuration already initialized (expected on subsequent runs)');
    } else {
      throw error;
    }
  }
}

setupProgramConfig().catch(console.error);
