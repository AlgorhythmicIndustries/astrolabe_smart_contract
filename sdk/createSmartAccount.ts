import {
  type Address,
  type TransactionMessage,
  createNoopSigner,
  getProgramDerivedAddress,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  pipe,
  getComputeUnitEstimateForTransactionMessageFactory,
  prependTransactionMessageInstructions,
  address,
  type SolanaRpcApi,
  compileTransaction,
  createSolanaRpc,
} from '@solana/kit';
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from '@solana-program/compute-budget';
import { Buffer } from 'buffer';
import { fetchProgramConfig } from '../clients/js/src/generated/accounts/programConfig';
import { getCreateSmartAccountInstructionAsync } from '../clients/js/src/generated/instructions';
import { ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS } from '../clients/js/src/generated/programs';
import {
  type RestrictedSmartAccountSignerArgs,
  type SmartAccountSignerArgs,
} from '../clients/js/src/generated/types';

type SolanaRpc = ReturnType<typeof createSolanaRpc>;

/**
 * Parameters for creating a new smart account, intended to be called from a frontend.
 */
export type CreateSmartAccountParams = {
  /** The RPC client to use for fetching on-chain data. */
  rpc: SolanaRpc;
  /**
   * The public key of the account that will create the smart account and pay for transaction fees.
   * This account must sign the final transaction on the backend.
   */
  creator: Address;
  /** The signature threshold required to execute a transaction. */
  threshold: number;
  /** The initial set of signers on the smart account. */
  signers: SmartAccountSignerArgs[];
  /** Optional: The initial set of restricted signers on the smart account. */
  restrictedSigners?: RestrictedSmartAccountSignerArgs[];
  /** Optional: The authority that can configure the smart account. Defaults to None. */
  settingsAuthority?: Address | null;
  /** Optional: The number of seconds for the time lock. Defaults to 0. */
  timeLock?: number;
  /** Optional: The address to collect rent from closed accounts. Defaults to None. */
  rentCollector?: Address | null;
  /** Optional: A memo for the transaction. Defaults to None. */
  memo?: string | null;
  /** Optional: The micro lamports price for compute units. Defaults to 10_000. */
  computeUnitPrice?: bigint;
};

/**
 * The result of preparing a smart account creation transaction.
 */
export type CreateSmartAccountResult = {
  /** The unsigned, compiled transaction message as a byte array, ready to be sent to a backend. */
  transactionBuffer: Uint8Array;
  /** The derived address of the new smart account's settings account. */
  settingsAddress: Address;
};

/**
 * Creates an unsigned, compiled transaction buffer to deploy a new smart account.
 * This function fetches the necessary on-chain data, derives the required PDAs,
 * and constructs the transaction. The resulting buffer is intended to be sent to a backend
 * where it will be signed by the `creator` account and submitted to the network.
 *
 * @param params - The parameters for creating the smart account.
 * @returns A promise that resolves to the transaction buffer and the new settings account address.
 */
export async function createSmartAccountTransaction(
  params: CreateSmartAccountParams
): Promise<CreateSmartAccountResult> {
  const {
    rpc,
    creator,
    threshold,
    signers,
    restrictedSigners = [],
    settingsAuthority = null,
    timeLock = 0,
    rentCollector = null,
    memo = null,
    computeUnitPrice = 10000n,
  } = params;

  // 1. Fetch program config PDA and treasury from on-chain, as seen in createAccountTest.ts
  const [programConfigPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      new Uint8Array(Buffer.from('program_config')),
    ],
  });
  const programConfig = await fetchProgramConfig(rpc, programConfigPda);
  const { treasury, smartAccountIndex } = programConfig.data;

  // 2. Compute the seed for the new settings account using the current index.
  const settingsSeed = new Uint8Array(16); // u128 is 16 bytes
  const view = new DataView(settingsSeed.buffer);
  view.setBigUint64(0, smartAccountIndex, true); // low 64 bits
  view.setBigUint64(8, 0n, true); // high 64 bits

  // 3. Derive the settings PDA
  const [settingsAddress] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      new Uint8Array(Buffer.from('settings')),
      settingsSeed,
    ],
  });

  // 4. Build the create smart account instruction.
  // The creator is represented as a NoopSigner because the transaction
  // will be signed later by a backend.
  const createSmartAccountInstruction =
    await getCreateSmartAccountInstructionAsync({
      programConfig: programConfigPda,
      settings: settingsAddress,
      treasury,
      creator: createNoopSigner(creator),
      systemProgram: address('11111111111111111111111111111111'),
      program: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
      settingsAuthority,
      threshold,
      signers,
      restrictedSigners,
      timeLock,
      rentCollector,
      memo,
    });

  // 5. Build the base transaction message. The fee payer is the creator,
  // also represented as a NoopSigner.
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const baseTransactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(createNoopSigner(creator), tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) =>
      appendTransactionMessageInstructions([createSmartAccountInstruction], tx)
  );

  // 6. Estimate compute units and build the final transaction message
  const getComputeUnitEstimate =
    getComputeUnitEstimateForTransactionMessageFactory({ rpc });
  const estimatedComputeUnits =
    await getComputeUnitEstimate(baseTransactionMessage);
  const computeUnitLimit = Math.floor(Number(estimatedComputeUnits) * 1.2);

  const transactionMessage = prependTransactionMessageInstructions(
    [
      getSetComputeUnitPriceInstruction({ microLamports: computeUnitPrice }),
      getSetComputeUnitLimitInstruction({ units: computeUnitLimit }),
    ],
    baseTransactionMessage
  );

  // 7. Compile the transaction to get the buffer to be sent to the backend
  const compiledTransaction = compileTransaction(transactionMessage);

  return {
    transactionBuffer: new Uint8Array(compiledTransaction.messageBytes),
    settingsAddress: address(settingsAddress),
  };
} 