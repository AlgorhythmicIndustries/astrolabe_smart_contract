import { Address, createSolanaRpc, type TransactionSigner } from '@solana/kit';
type SolanaRpc = ReturnType<typeof createSolanaRpc>;
export interface BufferedTransactionParams {
    rpc: SolanaRpc;
    smartAccountSettings: Address;
    smartAccountPda: Address;
    smartAccountPdaBump: number;
    signer: TransactionSigner;
    feePayer: Address;
    innerTransactionBytes: Uint8Array;
    addressTableLookups?: any[];
    memo?: string;
    bufferIndex?: number;
    accountIndex?: number;
}
export interface BufferedTransactionResult {
    createBufferTx: Uint8Array[];
    createFromBufferTx: Uint8Array;
    proposeAndApproveTx: Uint8Array;
    executeTx: Uint8Array;
    transactionPda: Address;
    proposalPda: Address;
    transactionBufferPda: Address;
    bufferIndex: number;
    finalBufferSize: number;
}
export declare function createComplexBufferedTransaction(params: BufferedTransactionParams): Promise<BufferedTransactionResult>;
export {};
