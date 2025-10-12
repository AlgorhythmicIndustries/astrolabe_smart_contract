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
} from '@solana/kit';
import { getAddSignerAsAuthorityInstruction } from './clients/js/src/generated/instructions';
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
   * The settings authority that can add signers directly.
   * This is typically the backend fee payer for Astrolabe controlled accounts.
   * This account must sign the final transaction on the backend.
   */
  settingsAuthority: Address;
  /**
   * The public key of the account that will pay for transaction fees and any reallocation costs.
   * This is typically the same as settingsAuthority but can be different if needed.
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
 * This function constructs a transaction using the `add_signer_as_authority` instruction, which allows
 * a settings authority (typically the backend) to directly add a new signer without going through
 * the proposal/voting process. This is appropriate for controlled smart accounts where the settings_authority
 * is set to a trusted backend key.
 * 
 * The resulting buffer is intended to be sent to a backend where it will be signed by the `settingsAuthority`
 * account and submitted to the network.
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
 *   settingsAuthority: backendAuthority,
 *   feePayer: backendAuthority,
 *   newSigner: {
 *     key: passkeyPublicKey,
 *     permissions: { mask: 0x07 } // Full permissions
 *   },
 *   memo: 'Added new passkey via QR code'
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
    settingsAuthority,
    feePayer,
    newSigner,
    memo = null,
  } = params;

  // Build the add_signer_as_authority instruction.
  // The settingsAuthority is represented as a NoopSigner because the transaction
  // will be signed later by the backend.
  const addSignerInstruction = getAddSignerAsAuthorityInstruction({
    settings: smartAccountSettings,
    settingsAuthority: createNoopSigner(settingsAuthority),
    rentPayer: createNoopSigner(feePayer),
    systemProgram: address('11111111111111111111111111111111'),
    program: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    newSigner,
    memo,
  });

  // Build the transaction message. The fee payer is typically the backend authority.
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const baseTransactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(createNoopSigner(feePayer), tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions([addSignerInstruction], tx)
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

