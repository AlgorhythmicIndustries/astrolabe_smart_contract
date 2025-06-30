import {
  pipe,
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
  lamports,
  Address,
  address,
  getProgramDerivedAddress,
} from '@solana/kit';
import fs from 'fs';
import {
  getCreateSmartAccountInstructionAsync,
  getInitializeProgramConfigInstruction,
} from '../clients/js/src/generated/instructions';
import {
  fetchProgramConfig,
} from '../clients/js/src/generated/accounts/programConfig';
import {
  ASTROLABE_SMART_ACCOUNT_PROGRAM_PROGRAM_ADDRESS,
} from '../clients/js/src/generated/programs';

// Set up connection and payer
const rpc = createSolanaRpc('http://localhost:8899'); // or your devnet/testnet endpoint
const rpcSubscriptions = createSolanaRpcSubscriptions('ws://localhost:8900');
// Get bytes from local keypair file.
const keypairFile = fs.readFileSync('/home/user/.config/solana/id.json');
const keypairBytes = new Uint8Array(JSON.parse(keypairFile.toString()));

const initializerKeypairFile = fs.readFileSync('../test-program-config-initializer-keypair.json');
const initializerKeypairBytes = new Uint8Array(JSON.parse(initializerKeypairFile.toString()));


async function main() {
  // Create a authority from the bytes.
  const authorityKeypair = await createKeyPairFromBytes(keypairBytes);
  const authoritySigner = await createSignerFromKeyPair(authorityKeypair);

  const initializerKeypair = await createKeyPairFromBytes(initializerKeypairBytes);
  const initializerSigner = await createSignerFromKeyPair(initializerKeypair);

  console.log('Authority:', authoritySigner.address);
  console.log('Initializer:', initializerSigner.address);

  // 2. Airdrop SOL to payer
  const airdrop = airdropFactory({rpc: rpc, rpcSubscriptions: rpcSubscriptions});
  await airdrop({
        commitment: 'confirmed',
        recipientAddress: authoritySigner.address, 
        lamports: lamports(10_000_000n)
    }); // 10 SOL

  await airdrop({
    commitment: 'confirmed',
    recipientAddress: initializerSigner.address, 
    lamports: lamports(10_000_000n)
}); // 10 SOL

  // 3. Derive program config PDA
  const [programConfigPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      new Uint8Array(Buffer.from('program_config')),
    ],
  });

  const [treasuryPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      new Uint8Array(Buffer.from('treasury')),
    ],
  });

  // 4. Initialize program config (only do this if it doesn't exist yet)
  const instruction = await getInitializeProgramConfigInstruction({
    programConfig: programConfigPda,
    initializer: initializerSigner,
    systemProgram: address('11111111111111111111111111111111'),
    authority: authoritySigner.address,
    smartAccountCreationFee: lamports(10000000n),
    treasury: treasuryPda,
  });

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(initializerSigner, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions([instruction], tx)
  );

  const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  const signature = await sendAndConfirm(signedTransaction, { commitment: 'confirmed' });
  console.log('Program config initialized! Signature:', signature);

  // 5. Fetch program config to get treasury address
  const programConfig = await fetchProgramConfig(rpc, address(programConfigPda));
  const treasury = programConfig.data.treasury as Address;

  // 6. Airdrop SOL to treasury PDA
  await airdrop({
    commitment: 'confirmed',
    recipientAddress: address(treasury.toString()),
    lamports: lamports(10_000_000n)
  });

  // 7. Fetch and print treasury PDA address and balance
  const balance = await rpc.getBalance(treasury).send();
  console.log('Treasury PDA:', treasury);
  console.log('Treasury Balance:', balance.value, 'SOL');
}

main().catch(console.error);
