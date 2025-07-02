import {
  pipe,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createKeyPairFromBytes,
  createSignerFromKeyPair,
  generateKeyPair,
  airdropFactory,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
  getSignatureFromTransaction,
  lamports,
  Address,
  address,
  getProgramDerivedAddress,
  type IAccountMeta,
  AccountRole,
} from '@solana/kit';
import fs from 'fs';
import {
  getCreateSmartAccountInstructionAsync,
} from '../../clients/js/src/generated/instructions';
import {
  fetchProgramConfig,
} from '../../clients/js/src/generated/accounts/programConfig';
import {
  ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
} from '../../clients/js/src/generated/programs';
import { getAccountMetaFactory } from '../../clients/js/src/generated/shared';
import bs58 from 'bs58';
import { Buffer } from 'buffer';


async function main() {
  // Set up connection
  const rpc = createSolanaRpc('http://localhost:8899');
  const rpcSubscriptions = createSolanaRpcSubscriptions('ws://localhost:8900');

  // Create two distinct signers: one for creation, one for paying fees.
  const creatorKeypairFile = fs.readFileSync('/home/user/.config/solana/id.json');
  const creatorKeypairBytes = new Uint8Array(JSON.parse(creatorKeypairFile.toString()));
  const creatorKeypair = await createKeyPairFromBytes(creatorKeypairBytes);
  const creatorSigner = await createSignerFromKeyPair(creatorKeypair);

  // Airdrop to both signers
  const airdrop = airdropFactory({rpc: rpc, rpcSubscriptions: rpcSubscriptions});
  await airdrop({
    commitment: 'confirmed',
    recipientAddress: creatorSigner.address, 
    lamports: lamports(10_000_000n)
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

  const restrictedSigner = address('32F4nT2DmowKMgJB6SHZNZa4NpWqiqbjBDz668GwkFDW'); // Astrolabe authority 1

  // 1. Fetch the current index and compute the seed
  const currentIndex = Number(programConfig.data.smartAccountIndex);
  const nextIndex = currentIndex + 1;
  const settingsSeedLE = new Uint8Array(16); // u128 is 16 bytes
  const view = new DataView(settingsSeedLE.buffer);
  view.setBigUint64(0, BigInt(nextIndex), true); // low 64 bits
  view.setBigUint64(8, 0n, true); // high 64 bits

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
  const brandedSettingsPda = address(smartAccountSettingsPda) as Address<"GyhGAqjokLwF9UXdQ2dR5Zwiup242j4mX4J1tSMKyAmD">;

  // 3. Build the create smart account instruction
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
    restrictedSigners: [{ key: restrictedSigner, restrictedPermissions: { mask: 1 } }],
    timeLock: 0,
    rentCollector: null,
    memo: null,
  });

  console.log('--- Inspecting Instruction Accounts ---');
  console.log(JSON.stringify(createSmartAccountInstruction.accounts, null, 2));
  console.log('--- End Inspecting Instruction Accounts ---');

  console.log('createSmartAccountInstruction.accounts:');
  console.log(createSmartAccountInstruction.accounts.map(a => a.address?.toString?.() ?? a.address));

  // 6. Build and send the transaction
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const createSmartAccountTransactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(creatorSigner, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions([createSmartAccountInstruction], tx)
  );
  const signedCreateTransaction = await signTransactionMessageWithSigners(createSmartAccountTransactionMessage);

  const signature = getSignatureFromTransaction(signedCreateTransaction);
  console.log('--- Inspecting Signatures ---');
  console.log('Fee Payer (and signer):', creatorSigner.address);
  console.log('Transaction Signature:', signature);
  console.log('--- End Inspecting Signatures ---');

  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  await sendAndConfirm(signedCreateTransaction, { commitment: 'confirmed' });
  console.log('Smart account created! Confirmed in transaction:', signature);
  console.log('Smart account first signer:', creatorSigner.address);
  console.log('Transaction signature: ', signature);
}

main().catch(console.error);

