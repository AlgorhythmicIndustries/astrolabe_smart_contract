import { Address, createSolanaRpc, Encoder } from '@solana/kit';
type SolanaRpc = ReturnType<typeof createSolanaRpc>;
/**
 * Derives a transaction PDA from settings address and transaction index
 */
export declare function deriveTransactionPda(settingsAddress: Address, transactionIndex: bigint): Promise<Address>;
/**
 * Derives a proposal PDA from settings address and transaction index
 */
export declare function deriveProposalPda(settingsAddress: Address, transactionIndex: bigint): Promise<Address>;
/**
 Derives the transaction buffer PDA for a given settings address, creator, and buffer index
*/
export declare function deriveBufferPda(settingsAddress: Address, creatorAddress: Address, bufferIndex: number): Promise<Address>;
/**
 * Fetches smart account settings and returns current and next transaction indices
 */
export declare function fetchSmartAccountSettings(rpc: SolanaRpc, settingsAddress: Address): Promise<{
    currentTransactionIndex: bigint;
    nextTransactionIndex: bigint;
    threshold: number;
}>;
/**
 * Decodes a compiled transaction message to extract accounts and instructions
 */
export declare function decodeTransactionMessage(messageBytes: Uint8Array): import("@solana/kit").CompiledTransactionMessage & Readonly<{
    lifetimeToken: ReturnType<typeof import("@solana/transaction-messages/dist/types/compile/lifetime-token").getCompiledLifetimeToken>;
}>;
export declare function getTransactionMessageEncoder(): Encoder<TransactionMessageArgs>;
export interface CompiledInstructionArgs {
    programIdIndex: number;
    accountIndexes: Uint8Array;
    data: Uint8Array;
}
export interface MessageAddressTableLookupArgs {
    accountKey: Address;
    writableIndexes: Uint8Array;
    readonlyIndexes: Uint8Array;
}
export interface TransactionMessageArgs {
    numSigners: number;
    numWritableSigners: number;
    numWritableNonSigners: number;
    accountKeys: Address[];
    instructions: CompiledInstructionArgs[];
    addressTableLookups: MessageAddressTableLookupArgs[];
}
export declare function getCompiledInstructionEncoder(): Encoder<CompiledInstructionArgs>;
export declare function getMessageAddressTableLookupEncoder(): Encoder<MessageAddressTableLookupArgs>;
/**
 * Derives smart account PDA and related info from a settings address
 */
export declare function deriveSmartAccountInfo(settingsAddress: Address, accountIndex?: bigint): Promise<{
    smartAccountPda: Address;
    settingsAddress: Address;
    accountIndex: bigint;
    smartAccountPdaBump: number;
}>;
export {};
