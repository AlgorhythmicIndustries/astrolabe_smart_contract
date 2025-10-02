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
  getSignatureFromTransaction,
  prependTransactionMessageInstructions,
  assertIsTransactionWithinSizeLimit,
  lamports,
  Address,
  address,
  getProgramDerivedAddress,
} from '@solana/kit';
import * as fs from 'fs';
import {
  getCreateSmartAccountInstructionAsync,
} from '../clients/js/src/generated/instructions';
import {
  fetchProgramConfig,
} from '../clients/js/src/generated/accounts/programConfig';
import {
  ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
} from '../clients/js/src/generated/programs';
import { Buffer } from 'buffer';
import * as bs58 from 'bs58';


async function main() {
  // Set up connection
  const rpc = createSolanaRpc('http://localhost:8899');
  const rpcSubscriptions = createSolanaRpcSubscriptions('ws://localhost:8900');

  // Use a consistent creator and fee payer
  const creatorKeypairFile = fs.readFileSync('/Users/algorhythmic/.config/solana/id.json');
  const creatorKeypairBytes = new Uint8Array(JSON.parse(creatorKeypairFile.toString()));
  const creatorKeypair = await createKeyPairFromBytes(creatorKeypairBytes);
  const creatorSigner = await createSignerFromKeyPair(creatorKeypair);

  // Airdrop to the creator/fee payer
  const airdrop = airdropFactory({rpc: rpc, rpcSubscriptions: rpcSubscriptions});
  await airdrop({
    commitment: 'confirmed',
    recipientAddress: creatorSigner.address,
    lamports: lamports(BigInt(10_000_000))
  });

  // Fetch program config PDA and treasury from on-chain (assume already initialized)
  const [programConfigPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      new Uint8Array(Buffer.from('program_config')),
    ],
  });
  const programConfig = await fetchProgramConfig(rpc, address(programConfigPda));
  const treasury = programConfig.data.treasury as Address;

  const restrictedSignerKeypairFile = fs.readFileSync('/Users/algorhythmic/.config/solana/restricted_signer.json');
  const restrictedSignerKeypairBytes = new Uint8Array(JSON.parse(restrictedSignerKeypairFile.toString()));
  const restrictedSignerKeypair = await createKeyPairFromBytes(restrictedSignerKeypairBytes);
  const restrictedSignerSigner = await createSignerFromKeyPair(restrictedSignerKeypair);

  // 1. Fetch the current index and compute the seed
  const currentIndex = Number(programConfig.data.smartAccountIndex);
  const nextIndex = currentIndex + 1;
  const settingsSeedLE = new Uint8Array(16); // u128 is 16 bytes
  const view = new DataView(settingsSeedLE.buffer);
  view.setBigUint64(0, BigInt(nextIndex), true); // low 64 bits
  view.setBigUint64(8, BigInt(0), true); // high 64 bits


  // 2. Derive the settings PDA
  const [smartAccountSettingsPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      new Uint8Array(Buffer.from('settings')),
      settingsSeedLE,
    ],
  });
  console.log('smartAccountSettingsPda:', smartAccountSettingsPda);
  const brandedSettingsPda = address(smartAccountSettingsPda) as Address<"BNz2Ja9gXc6WSWJo1zsTBcbX6uDERZk9ExKJFBi862BS">;

  // 3. Derive the smart account's own treasury/wallet PDA
  const [smartAccountWalletPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      bs58.decode(brandedSettingsPda),
      new Uint8Array(Buffer.from('smart_account')),
      new Uint8Array([0]), // account_index as u8
    ],
  });
  console.log('Smart Account Wallet PDA:', smartAccountWalletPda);

  // 4. Build the create smart account instruction
  const createSmartAccountInstruction = await getCreateSmartAccountInstructionAsync({
    programConfig: address(programConfigPda),
    settings: brandedSettingsPda,
    treasury: address(treasury),
    creator: creatorSigner,
    systemProgram: address('11111111111111111111111111111111'),
    program: address(ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS),
    settingsAuthority: null,
    threshold: 1,
    signers: [{ key: creatorSigner.address, permissions: { mask: 7 } }],
    restrictedSigners: [{ key: restrictedSignerSigner.address, restrictedPermissions: { mask: 1 } }],
    timeLock: 0,
    rentCollector: null,
    memo: null,
  });

  // 5. Build the transaction message
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const finalTransactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(creatorSigner, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions([createSmartAccountInstruction], tx)
  );

  const signedCreateTransaction = await signTransactionMessageWithSigners(finalTransactionMessage);

  // Validate the transaction
  assertIsTransactionWithinSizeLimit(signedCreateTransaction);

  const signature = getSignatureFromTransaction(signedCreateTransaction);
  console.log('--- Inspecting Signatures ---');
  console.log('Fee Payer / Creator (and signer):', creatorSigner.address);
  console.log('Transaction Signature:', signature);
  console.log('--- End Inspecting Signatures ---');

  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  await sendAndConfirm(signedCreateTransaction, { commitment: 'confirmed' });
  console.log('Smart account created!');
}

main().catch(console.error);

