import {
  createSolanaRpc,
  createKeyPairFromBytes,
  createSignerFromKeyPair,
  address,
  createTransactionMessage,
  appendTransactionMessageInstruction,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  pipe,
  sendAndConfirmTransactionFactory,
  signTransactionMessageWithSigners,
  assertIsTransactionWithinSizeLimit,
  getProgramDerivedAddress,
} from '@solana/kit';
import * as bs58 from 'bs58';
import * as fs from 'fs';
import { getCloseTransactionBufferInstruction } from '../clients/js/src/generated/instructions';
import { ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS } from '../clients/js/src/generated/programs';

async function cleanBuffers() {
  console.log('🧹 Cleaning up transaction buffers...');
  
  // Set up connection
  const rpc = createSolanaRpc('http://localhost:8899');
  
  // Load test state
  const testStateFile = './tests/test-state.json';
  if (!fs.existsSync(testStateFile)) {
    throw new Error('Test state file not found. Run setup and create account tests first.');
  }
  
  const testState = JSON.parse(fs.readFileSync(testStateFile, 'utf8'));
  const smartAccountSettings = address(testState.smartAccountSettings);
  
  console.log('📂 Smart account settings:', smartAccountSettings);

  // Load creator signer (use the default Solana CLI keypair)
  const creatorKeypairFile = fs.readFileSync('/Users/algorhythmic/.config/solana/id.json');
  const creatorKeypairBytes = new Uint8Array(JSON.parse(creatorKeypairFile.toString()));
  const creatorKeypair = await createKeyPairFromBytes(creatorKeypairBytes);
  const creatorSigner = await createSignerFromKeyPair(creatorKeypair);

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc });

  // List of buffer indexes to clean (you can expand this list as needed)
  const bufferIndexesToClean = [0, 1, 2, 99, 100];
  
  console.log(`🔍 Checking ${bufferIndexesToClean.length} buffer indexes...`);

  for (const bufferIndex of bufferIndexesToClean) {
    try {
      // Derive the buffer PDA
      const [transactionBufferPda] = await getProgramDerivedAddress({
        programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
          new Uint8Array(Buffer.from('smart_account')),
          bs58.decode(smartAccountSettings),
          new Uint8Array(Buffer.from('transaction_buffer')),
          bs58.decode(creatorSigner.address),
          new Uint8Array([bufferIndex]),
        ],
      });

      console.log(`📍 Buffer ${bufferIndex} PDA:`, transactionBufferPda);

      // Check if the buffer account exists
      try {
        const accountInfo = await rpc.getAccountInfo(transactionBufferPda, { encoding: 'base64' }).send();
        
        if (accountInfo.value === null) {
          console.log(`  ⚪ Buffer ${bufferIndex}: Account doesn't exist, skipping`);
          continue;
        }

        console.log(`  🟡 Buffer ${bufferIndex}: Account exists, closing...`);

        // Create close buffer instruction
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
        assertIsTransactionWithinSizeLimit(signedCloseBuffer);

        const closeSignature = await sendAndConfirm(signedCloseBuffer, { commitment: 'confirmed' });
        console.log(`  ✅ Buffer ${bufferIndex}: Closed successfully (${closeSignature})`);

      } catch (accountError) {
        console.log(`  ⚪ Buffer ${bufferIndex}: Account doesn't exist or error checking:`, accountError.message);
      }

    } catch (error) {
      console.error(`  ❌ Buffer ${bufferIndex}: Error during cleanup:`, error.message);
    }
  }

  console.log('');
  console.log('🎉 Buffer cleanup completed!');
  console.log('💡 You can now run tests without "account exists" errors');
}

// Run the cleanup
cleanBuffers().catch(console.error);
