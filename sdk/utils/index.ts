import {
    Address,
    createSolanaRpc,
    getProgramDerivedAddress,
    getCompiledTransactionMessageDecoder,
    Encoder,
    getStructEncoder,
    getU8Encoder,
    getArrayEncoder,
    getAddressEncoder,
    addEncoderSizePrefix,
    getBytesEncoder,
    getU32Encoder,
} from '@solana/kit';
import { Buffer } from 'buffer';
import * as bs58 from 'bs58';
import { fetchSettings } from '../clients/js/src/generated/accounts/settings';
import { ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS } from '../clients/js/src/generated/programs';

type SolanaRpc = ReturnType<typeof createSolanaRpc>;

/**
 * Derives a transaction PDA from settings address and transaction index
 */
export async function deriveTransactionPda(settingsAddress: Address, transactionIndex: bigint): Promise<Address> {
  const [transactionPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      bs58.decode(settingsAddress),
      new Uint8Array(Buffer.from('transaction')),
      new Uint8Array(new BigUint64Array([transactionIndex]).buffer),
    ],
  });
  return transactionPda;
}

/**
 * Derives a proposal PDA from settings address and transaction index
 */
export async function deriveProposalPda(
  settingsAddress: Address, 
  transactionIndex: bigint
): Promise<Address> {
  console.log('🔧 deriveProposalPda debug:', {
    settingsAddress: settingsAddress.toString(),
    transactionIndex: transactionIndex.toString(),
  });
  
  const [proposalPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),   // SEED_PREFIX
      bs58.decode(settingsAddress),                   // settings.key().as_ref() - settings ADDRESS
      new Uint8Array(Buffer.from('transaction')),     // SEED_TRANSACTION
      new Uint8Array(new BigUint64Array([transactionIndex]).buffer), // transaction_index
      new Uint8Array(Buffer.from('proposal')),        // SEED_PROPOSAL
    ],
  });
  
  console.log('🔧 deriveProposalPda result:', proposalPda.toString());
  return proposalPda;
}

/**
 Derives the transaction buffer PDA for a given settings address, creator, and buffer index
*/
export async function deriveBufferPda(
  settingsAddress: Address,
  creatorAddress: Address,
  bufferIndex: number
): Promise<Address> {
  const [bufferPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      bs58.decode(settingsAddress),
      new Uint8Array(Buffer.from('transaction_buffer')),
      bs58.decode(creatorAddress),
      new Uint8Array([bufferIndex & 0xff]),
    ],
  });
  return bufferPda;
}

/**
 * Fetches smart account settings and returns current and next transaction indices
 */
export async function fetchSmartAccountSettings(rpc: SolanaRpc, settingsAddress: Address) {
  const settings = await fetchSettings(rpc, settingsAddress);
  return {
    currentTransactionIndex: settings.data.transactionIndex,
    nextTransactionIndex: settings.data.transactionIndex + BigInt(1),
    threshold: settings.data.threshold
  };
}
  
/**
 * Decodes a compiled transaction message to extract accounts and instructions
 */
export function decodeTransactionMessage(messageBytes: Uint8Array) {
  return getCompiledTransactionMessageDecoder().decode(messageBytes);
}

// Manual encoder for TransactionMessage struct from transaction_create.rs
// This matches the Rust struct exactly:
// pub struct TransactionMessage {
//     pub num_signers: u8,
//     pub num_writable_signers: u8,
//     pub num_writable_non_signers: u8,
//     pub account_keys: Vec<Pubkey>,
//     pub instructions: Vec<CompiledInstruction>,
//     pub address_table_lookups: Vec<MessageAddressTableLookup>,
// }


export function getTransactionMessageEncoder(): Encoder<TransactionMessageArgs> {
  return getStructEncoder([
    ['numSigners', getU8Encoder()],
    ['numWritableSigners', getU8Encoder()],
    ['numWritableNonSigners', getU8Encoder()],
    ['accountKeys', getArrayEncoder(getAddressEncoder())],
    ['instructions', getArrayEncoder(getCompiledInstructionEncoder())],
    ['addressTableLookups', getArrayEncoder(getMessageAddressTableLookupEncoder())],
  ]);
}

export interface CompiledInstructionArgs {
  programIdIndex: number;
  accountIndexes: Uint8Array;
  data: Uint8Array;
}

export interface MessageAddressTableLookupArgs {
  accountKey: Address; // Proper Address type
  writableIndexes: Uint8Array;
  readonlyIndexes: Uint8Array;
}

export interface TransactionMessageArgs {
  numSigners: number;
  numWritableSigners: number;
  numWritableNonSigners: number;
  accountKeys: Address[]; // Array of proper Address types
  instructions: CompiledInstructionArgs[];
  addressTableLookups: MessageAddressTableLookupArgs[];
}

// Encoder for CompiledInstruction
export function getCompiledInstructionEncoder(): Encoder<CompiledInstructionArgs> {
  return getStructEncoder([
    ['programIdIndex', getU8Encoder()],
    ['accountIndexes', addEncoderSizePrefix(getBytesEncoder(), getU32Encoder())],
    ['data', addEncoderSizePrefix(getBytesEncoder(), getU32Encoder())],
  ]);
}

// Encoder for MessageAddressTableLookup
export function getMessageAddressTableLookupEncoder(): Encoder<MessageAddressTableLookupArgs> {
  return getStructEncoder([
    ['accountKey', getAddressEncoder()],
    ['writableIndexes', addEncoderSizePrefix(getBytesEncoder(), getU32Encoder())],
    ['readonlyIndexes', addEncoderSizePrefix(getBytesEncoder(), getU32Encoder())],
  ]);
}
  
/**
 * Derives smart account PDA and related info from a settings address
 */
export async function deriveSmartAccountInfo(
  settingsAddress: Address,
  accountIndex?: bigint
): Promise<{
  smartAccountPda: Address;
  settingsAddress: Address;
  accountIndex: bigint;
  smartAccountPdaBump: number;
}> {
    // Always use account_index = 0 for the primary smart account
    console.log('🔧 Using account index 0 for primary smart account (ignoring any provided accountIndex)');
  
    console.log('🔧 Deriving smart account PDA with:', {
      settingsAddress: settingsAddress.toString(),
      accountIndex: '0',
      programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS.toString()
    });
  
    const [smartAccountPda, smartAccountPdaBump] = await getProgramDerivedAddress({
      programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
      seeds: [
        new Uint8Array(Buffer.from('smart_account')),
        bs58.decode(settingsAddress),
        new Uint8Array(Buffer.from('smart_account')),
        // Use account_index 0 for the primary smart account
        new Uint8Array([0]),
      ],
    });
  
    console.log('✅ Derived smart account PDA:', {
      smartAccountPda: smartAccountPda.toString(),
      smartAccountPdaBump,
      settingsAddress: settingsAddress.toString(),
      accountIndex: 0
    });
  
    return {
      smartAccountPda,
      settingsAddress,
      accountIndex: BigInt(0),
      smartAccountPdaBump,
    };
  }