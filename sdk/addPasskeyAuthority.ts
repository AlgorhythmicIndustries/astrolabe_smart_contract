import {
  type Address,
  createNoopSigner,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  pipe,
  address,
  compileTransaction,
  createSolanaRpc,
  getTransactionEncoder,
  getAddressEncoder,
} from '@solana/kit';
import { 
  getExecuteSettingsTransactionSyncInstruction 
} from './clients/js/src/generated/instructions';
import { ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS } from './clients/js/src/generated/programs';
import type { SmartAccountSignerArgs } from './clients/js/src/generated/types';

type SolanaRpc = ReturnType<typeof createSolanaRpc>;

/**
 * Parameters for adding a new passkey/authority to an existing smart account.
 */
export type AddPasskeyAuthorityParams = {
  /** The RPC client to use for fetching on-chain data. */
  rpc: SolanaRpc;
  /** The settings account address of the smart account. */
  smartAccountSettings: Address;
  /**
   * The creator/signer who is adding the new passkey.
   * For autonomous smart accounts, this is one of the existing signers (the user's original passkey).
   * This account must sign the final transaction.
   */
  creator: Address;
  /**
   * The public key of the account that will pay for transaction fees and any account rent.
   * This is typically the backend fee payer to make the operation gasless for the user.
   */
  feePayer: Address;
  /**
   * The new passkey/signer to add to the smart account.
   * Should include the passkey's public key derived from the credential ID and permissions mask.
   */
  newSigner: SmartAccountSignerArgs;
  /** Optional: A memo for the transaction. Defaults to None. */
  memo?: string | null;
};

/**
 * The result of preparing an add passkey authority transaction.
 */
export type AddPasskeyAuthorityResult = {
  /** The unsigned, compiled transaction message as a byte array, ready to be sent to a backend. */
  transactionBuffer: Uint8Array;
  /** The new signer that will be added to the smart account. */
  newSignerKey: Address;
};

/**
 * Creates an unsigned, compiled transaction buffer to add a new passkey as an authority to an existing smart account.
 * 
 * This function constructs a transaction using the `execute_settings_transaction_sync` instruction,
 * which is the correct approach for autonomous smart accounts (accounts without a settings_authority).
 * This instruction atomically creates and executes a settings change in a single transaction,
 * which is valid for accounts with threshold=1 where a single signer can execute immediately.
 * 
 * The resulting buffer is intended to be sent to a backend where it will be signed by the `creator`
 * (the user's existing passkey) and the `feePayer` (backend), then submitted to the network.
 * 
 * ## Permissions
 * 
 * The permissions mask is a u8 bitmask where:
 * - 0x01 (bit 0): PROPOSE - Can create proposals
 * - 0x02 (bit 1): VOTE - Can vote on proposals
 * - 0x04 (bit 2): EXECUTE - Can execute approved transactions
 * 
 * For full permissions, use 0x07 (all bits set).
 * For standard user permissions (propose + vote), use 0x03.
 * For execute-only permissions, use 0x04.
 * 
 * @param params - The parameters for adding the passkey authority.
 * @returns A promise that resolves to the transaction buffer and the new signer key.
 * 
 * @example
 * ```typescript
 * const result = await addPasskeyAuthorityTransaction({
 *   rpc,
 *   smartAccountSettings: settingsAddress,
 *   creator: userOriginalPasskeyPubkey, // User's original passkey
 *   feePayer: backendFeePayerPubkey,    // Backend pays fees
 *   newSigner: {
 *     key: newPasskeyPublicKey,
 *     permissions: { mask: 0x07 } // Full permissions
 *   },
 *   memo: 'Added new passkey'
 * });
 * 
 * // Send result.transactionBuffer to backend for signing and submission
 * ```
 */
export async function addPasskeyAuthorityTransaction(
  params: AddPasskeyAuthorityParams
): Promise<AddPasskeyAuthorityResult> {
  const {
    rpc,
    smartAccountSettings,
    creator,
    feePayer,
    newSigner,
    memo = null,
  } = params;

  // Fetch the settings account to determine numSigners
  const settingsAccountInfo = await rpc.getAccountInfo(smartAccountSettings, { encoding: 'base64' }).send();
  if (!settingsAccountInfo.value) {
    throw new Error(`Settings account not found: ${smartAccountSettings}`);
  }

  // For now, assume we have 1 signer (the creator) signing this transaction
  // In the future, we may need to parse the settings account to get the exact threshold
  const numSigners = 1;

  // Build the execute_settings_transaction_sync instruction
  // This atomically creates and executes a settings change in one instruction
  const executeInstruction = getExecuteSettingsTransactionSyncInstruction({
    settings: smartAccountSettings,
    rentPayer: createNoopSigner(feePayer),
    systemProgram: address('11111111111111111111111111111111'),
    program: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    numSigners,
    actions: [
      {
        __kind: 'AddSigner',
        newSigner,
      }
    ],
    memo,
  });

  // Build the transaction message
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const baseTransactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(createNoopSigner(feePayer), tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions([executeInstruction], tx)
  );

  // Compile the transaction to get the buffer to be sent to the backend
  const compiledTransaction = compileTransaction(baseTransactionMessage);
  
  // Encode the full transaction (with empty signatures) for the backend
  const transactionBytes = getTransactionEncoder().encode(compiledTransaction);

  return {
    transactionBuffer: new Uint8Array(transactionBytes),
    newSignerKey: newSigner.key,
  };
}

