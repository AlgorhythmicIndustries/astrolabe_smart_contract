import {
  address,
  Address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  compressTransactionMessageUsingAddressLookupTables,
  createSolanaRpc,
  createNoopSigner,
  getProgramDerivedAddress,
  type TransactionSigner,
  getCompiledTransactionMessageDecoder,
  decompileTransactionMessage,
  AccountRole,
  assertIsTransactionWithinSizeLimit,
} from '@solana/kit';
import { getTransactionDecoder } from '@solana/transactions';
import * as bs58 from 'bs58';

type SolanaRpc = ReturnType<typeof createSolanaRpc>;

import {
  getCreateTransactionBufferInstruction,
  getExtendTransactionBufferInstruction,
  getCreateTransactionFromBufferInstruction,
  getCreateProposalInstruction,
  getApproveProposalInstruction,
  getExecuteTransactionInstruction,
  getCloseTransactionBufferInstruction,
} from './clients/js/src/generated/instructions';
import { fetchSettings } from './clients/js/src/generated/accounts/settings';
import { ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS } from './clients/js/src/generated/programs';

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
  bufferIndex?: number; // 0..255
  accountIndex?: number; // usually 0
}

export interface BufferedTransactionResult {
  createBufferTx: Uint8Array[]; // first + extends (multiple tx messages)
  createFromBufferTx: Uint8Array;
  executeTx: Uint8Array;
  transactionPda: Address;
  proposalPda: Address;
}

export async function createComplexBufferedTransaction(params: BufferedTransactionParams): Promise<BufferedTransactionResult> {
  const {
    rpc,
    smartAccountSettings,
    smartAccountPda,
    smartAccountPdaBump,
    signer,
    feePayer,
    innerTransactionBytes,
    addressTableLookups = [],
    memo = 'Buffered Smart Account Transaction',
    bufferIndex = 0,
    accountIndex = 0,
  } = params;

  // Derive PDAs and fetch settings
  const settings = await fetchSettings(rpc, smartAccountSettings);
  const nextIndex = settings.data.transactionIndex + BigInt(1);
  // Derive Transaction PDA: ["smart_account", settings, "transaction", u64 index]
  const [transactionPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      bs58.decode(smartAccountSettings),
      new Uint8Array(Buffer.from('transaction')),
      new Uint8Array(new BigUint64Array([nextIndex]).buffer),
    ],
  });
  // Derive Proposal PDA: ["smart_account", settings, "transaction", u64 index, "proposal"]
  const [proposalPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      bs58.decode(smartAccountSettings),
      new Uint8Array(Buffer.from('transaction')),
      new Uint8Array(new BigUint64Array([nextIndex]).buffer),
      new Uint8Array(Buffer.from('proposal')),
    ],
  });

  // Convert the raw Jupiter transaction to the TransactionMessage format expected by smart contract
  const decoded = getCompiledTransactionMessageDecoder().decode(innerTransactionBytes) as any;
  const transactionMessage = {
    numSigners: decoded.header?.numSignerAccounts || 1,
    numWritableSigners: (decoded.header?.numSignerAccounts || 1) - (decoded.header?.numReadonlySignerAccounts || 0),
    numWritableNonSigners: Math.max(0, (decoded.staticAccounts?.length || 0) - (decoded.header?.numSignerAccounts || 1) - (decoded.header?.numReadonlyNonSignerAccounts || 0)),
    accountKeys: decoded.staticAccounts || [],
    instructions: (decoded.instructions || []).map((ix: any) => ({
      programIdIndex: ix.programAddressIndex,
      accountIndexes: new Uint8Array(ix.accountIndices ?? []),
      data: ix.data ?? new Uint8Array(),
    })),
    addressTableLookups: (addressTableLookups || []).map((l: any) => ({
      accountKey: l.accountKey,
      writableIndexes: new Uint8Array(l.writableIndexes ?? []),
      readonlyIndexes: new Uint8Array(l.readonlyIndexes ?? []),
    })),
  };

  // Encode as the TransactionMessage format expected by smart contract
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getSmartAccountTransactionMessageEncoder } = require('./clients/js/src/generated/types/smartAccountTransactionMessage');
  const smartAccountMessageBytes = getSmartAccountTransactionMessageEncoder().encode(transactionMessage);

  // Final buffer hash/size
  const finalBuffer = new Uint8Array(smartAccountMessageBytes);
  const finalBufferSize = finalBuffer.length;
  const hashBuf = await crypto.subtle.digest('SHA-256', finalBuffer as unknown as ArrayBuffer);
  const finalBufferHash = new Uint8Array(hashBuf);
  
  console.log(`📊 Raw transaction message size: ${finalBufferSize} bytes`);

  const feePayerSigner = createNoopSigner(feePayer);
  const latestBlockhash = (await rpc.getLatestBlockhash().send()).value;

  // Chunk the buffer (e.g., 900 bytes per tx to be safe)
  const CHUNK = 900;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < finalBuffer.length; i += CHUNK) {
    chunks.push(finalBuffer.subarray(i, Math.min(i + CHUNK, finalBuffer.length)));
  }

  // Pick an unused buffer index to avoid "already in use" allocation errors.
  async function deriveBufferPda(idx: number) {
    const [pda] = await getProgramDerivedAddress({
      programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
      seeds: [
        new Uint8Array(Buffer.from('smart_account')),
        bs58.decode(smartAccountSettings),
        new Uint8Array(Buffer.from('transaction_buffer')),
        bs58.decode(signer.address.toString()),
        new Uint8Array([idx & 0xff]),
      ],
    });
    return pda;
  }
  let chosenBufferIndex = bufferIndex & 0xff;
  let transactionBufferPda = await deriveBufferPda(chosenBufferIndex);
  // Probe and find a free buffer index if current exists.
  for (let attempts = 0; attempts < 256; attempts++) {
    const info = await rpc.getAccountInfo(transactionBufferPda, { commitment: 'processed' as any }).send();
    if (!info.value) break; // free
    chosenBufferIndex = (chosenBufferIndex + 1) & 0xff;
    transactionBufferPda = await deriveBufferPda(chosenBufferIndex);
  }

  // 1) create_transaction_buffer with first slice
  const createBufferIx = getCreateTransactionBufferInstruction({
    settings: smartAccountSettings,
    transactionBuffer: transactionBufferPda,
    bufferCreator: signer,
    rentPayer: feePayerSigner,
    systemProgram: address('11111111111111111111111111111111'),
    bufferIndex: chosenBufferIndex,
    accountIndex,
    finalBufferHash,
    finalBufferSize,
    buffer: chunks[0],
  });

  const createBufferMessage = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(feePayerSigner, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx => appendTransactionMessageInstructions([createBufferIx], tx)
  );
  const compiledCreateBuffer = compileTransaction(createBufferMessage);
  assertIsTransactionWithinSizeLimit(compiledCreateBuffer);
  const createBufferTx = new Uint8Array(compiledCreateBuffer.messageBytes);

  // 2) extend_transaction_buffer for remaining slices
  const extendTxs: Uint8Array[] = [];
  for (let i = 1; i < chunks.length; i++) {
    const extendIx = getExtendTransactionBufferInstruction({
      settings: smartAccountSettings,
      transactionBuffer: transactionBufferPda,
      creator: signer,
      buffer: chunks[i],
    });
    const msg = pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageFeePayerSigner(feePayerSigner, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      tx => appendTransactionMessageInstructions([extendIx], tx)
    );
    const compiledExtend = compileTransaction(msg);
    assertIsTransactionWithinSizeLimit(compiledExtend);
    extendTxs.push(new Uint8Array(compiledExtend.messageBytes));
  }

  // 3) create_transaction_from_buffer + create_proposal + approve
  const createFromBufferIx = getCreateTransactionFromBufferInstruction({
    settings: smartAccountSettings,
    transaction: transactionPda,
    creator: signer,
    rentPayer: feePayerSigner,
    systemProgram: address('11111111111111111111111111111111'),
    transactionBuffer: transactionBufferPda,
    fromBufferCreator: signer,
    args: {
      accountIndex,
      accountBump: smartAccountPdaBump,
      ephemeralSigners: 0,
      transactionMessage: new Uint8Array([0, 0, 0, 0, 0, 0]),
      memo,
    },
  });

  const createProposalIx = getCreateProposalInstruction({
    settings: smartAccountSettings,
    proposal: proposalPda,
    creator: signer,
    rentPayer: feePayerSigner,
    systemProgram: address('11111111111111111111111111111111'),
    transactionIndex: nextIndex,
    draft: false,
  });

  const approveIx = getApproveProposalInstruction({
    settings: smartAccountSettings,
    signer,
    proposal: proposalPda,
    systemProgram: address('11111111111111111111111111111111'),
    args: { memo: null },
  });

  const createFromBufferMsg = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(feePayerSigner, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx => appendTransactionMessageInstructions([createFromBufferIx, createProposalIx, approveIx], tx)
  );
  const compiledCreateFromBuffer = compileTransaction(createFromBufferMsg);
  assertIsTransactionWithinSizeLimit(compiledCreateFromBuffer);
  const createFromBufferTx = new Uint8Array(compiledCreateFromBuffer.messageBytes);

  // 4) execute + close buffer in same tx, compress outer with ALTs
  const executeIx = getExecuteTransactionInstruction({
    settings: smartAccountSettings,
    proposal: proposalPda,
    transaction: transactionPda,
    signer,
  });
  const closeBufferIx = getCloseTransactionBufferInstruction({
    settings: smartAccountSettings,
    transactionBuffer: transactionBufferPda,
    creator: signer,
  });
  let executeMsg = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(feePayerSigner, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx => appendTransactionMessageInstructions([executeIx, closeBufferIx], tx)
  );
  if (addressTableLookups.length > 0) {
    const addressesByLookupTableAddress: Record<string, Address[]> = {};
    for (const lookup of addressTableLookups) {
      const info = await rpc
        .getAccountInfo(lookup.accountKey, { encoding: 'base64', commitment: 'finalized' })
        .send();
      if (!info.value?.data) continue;
      const b64 = Array.isArray(info.value.data) ? info.value.data[0] : (info.value.data as string);
      const dataBuf = Buffer.from(b64, 'base64');
      const data = new Uint8Array(dataBuf.buffer, dataBuf.byteOffset, dataBuf.byteLength);
      const HEADER_SIZE = 56;
      const PUBKEY_SIZE = 32;
      const total = Math.floor((data.length - HEADER_SIZE) / PUBKEY_SIZE);
      const addrs: Address[] = [];
      for (let i = 0; i < total; i++) {
        const off = HEADER_SIZE + i * PUBKEY_SIZE;
        const keyBytes = data.subarray(off, off + PUBKEY_SIZE);
        addrs.push(address(bs58.encode(keyBytes)));
      }
      addressesByLookupTableAddress[lookup.accountKey.toString()] = addrs;
    }
    executeMsg = compressTransactionMessageUsingAddressLookupTables(
      executeMsg as any,
      addressesByLookupTableAddress as any
    ) as any;
  }
  const compiledExecute = compileTransaction(executeMsg);
  assertIsTransactionWithinSizeLimit(compiledExecute);
  const executeTx = new Uint8Array(compiledExecute.messageBytes);

  return {
    createBufferTx: [createBufferTx, ...extendTxs],
    createFromBufferTx,
    executeTx,
    transactionPda,
    proposalPda,
  };
}


