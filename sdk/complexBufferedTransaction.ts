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
  assertIsTransactionWithinSizeLimit,
  AccountRole,
} from '@solana/kit';
import { getTransactionDecoder } from '@solana/transactions';
import { getSetComputeUnitLimitInstruction } from '@solana-program/compute-budget';
import * as bs58 from 'bs58';

type SolanaRpc = ReturnType<typeof createSolanaRpc>;

import {
  getCreateTransactionBufferInstruction,
  getExtendTransactionBufferInstruction,
  getCreateTransactionFromBufferInstruction,
  getCreateProposalInstruction,
  getApproveProposalInstruction,
  getExecuteTransactionInstruction,
} from './clients/js/src/generated/instructions';
import { fetchSettings } from './clients/js/src/generated/accounts/settings';
import { ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS } from './clients/js/src/generated/programs';
import {
  deriveTransactionPda,
  deriveProposalPda,
  deriveBufferPda,
  decodeTransactionMessage,
  getTransactionMessageEncoder,
} from './utils/index';

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
  transactionIndexOffset?: number; // Offset to add to nextIndex (e.g., +1 if phase0 will execute first)
}

export interface BufferedTransactionResult {
  createBufferTx: Uint8Array[]; // first + extends (multiple tx messages)
  createFromBufferTx: Uint8Array;
  proposeAndApproveTx: Uint8Array; // createProposal + approve (separate from createFromBuffer for large transactions)
  executeTx: Uint8Array;
  transactionPda: Address;
  proposalPda: Address;
  transactionBufferPda: Address;
  bufferIndex: number;
  finalBufferSize: number;
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
    addressTableLookups,
    memo = 'Buffered Smart Account Transaction',
    bufferIndex = 0,
    accountIndex = 0,
    transactionIndexOffset = 0,
  } = params;

  // Derive PDAs and fetch settings
  const settings = await fetchSettings(rpc, smartAccountSettings);
  const nextIndex = settings.data.transactionIndex + BigInt(1) + BigInt(transactionIndexOffset);
  console.log(`🔧 complexBufferedTransaction: Using transaction index ${nextIndex} (current: ${settings.data.transactionIndex}, offset: ${transactionIndexOffset})`);
  // Derive Transaction PDA: ["smart_account", settings, "transaction", u64 index]
  const transactionPda = await deriveTransactionPda(smartAccountSettings, nextIndex);
  // Derive Proposal PDA: ["smart_account", settings, "transaction", u64 index, "proposal"]
  const proposalPda = await deriveProposalPda(smartAccountSettings, nextIndex);

  // Jupiter base64 provides a full versioned transaction. Decode to message bytes first.
  const versioned = getTransactionDecoder().decode(innerTransactionBytes) as any;
  const compiled = decodeTransactionMessage(versioned.messageBytes) as any;
  // Normalize addresses possibly coming as bytes/strings
  const toAddress = (k: any): Address => {
    if (!k) throw new Error('Invalid account key (undefined)');
    if (typeof k === 'string') return address(k);
    if (k instanceof Uint8Array) return address(bs58.encode(k));
    // Some kits wrap Address-like with .toString()
    const s = k.toString?.();
    if (typeof s === 'string') return address(s);
    throw new Error('Unsupported account key type');
  };

  const header = (compiled.header || {}) as any;
  const numSignerAccounts: number = header?.numSignerAccounts ?? 1;
  const numReadonlySignerAccounts: number = header?.numReadonlySignerAccounts ?? 0;
  const numReadonlyNonSignerAccounts: number = header?.numReadonlyNonSignerAccounts ?? 0;
  const staticAccountsLen: number = (compiled.staticAccounts?.length || 0);

  const safeStaticAccounts = (compiled.staticAccounts || []);
  if (!safeStaticAccounts.length || safeStaticAccounts.some((k: any) => !k)) {
    throw new Error('Decoded message has missing static account keys');
  }
  
  // DEBUG: Check what account[0] is (should be smart account PDA for Jupiter swaps)
  console.log('🔍 Jupiter transaction account[0]:', toAddress(safeStaticAccounts[0]));
  console.log('🔍 Expected smart account PDA:', smartAccountPda);
  console.log('🔍 Account[0] matches smart account PDA:', toAddress(safeStaticAccounts[0]) === smartAccountPda);
  
  const safeInstructions = (compiled.instructions || []).filter((ix: any) => !!ix);

  // Check for and modify ComputeBudget instructions
  // ComputeBudgetProgram address
  const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';
  const computeBudgetProgramIndex = safeStaticAccounts.findIndex(
    (addr: any) => toAddress(addr) === COMPUTE_BUDGET_PROGRAM
  );
  
  // Find existing SetComputeUnitLimit instruction (discriminator: 2)
  let hasComputeUnitLimit = false;
  const modifiedInstructions = safeInstructions.map((ix: any) => {
    if (ix.programAddressIndex === computeBudgetProgramIndex && ix.data && ix.data[0] === 2) {
      hasComputeUnitLimit = true;
      // SetComputeUnitLimit instruction found - read Jupiter's calculated limit and add smart account overhead
      // Format: [2, u32 units (little endian)]
      const jupiterLimit = ix.data[1] | (ix.data[2] << 8) | (ix.data[3] << 16) | (ix.data[4] << 24);
      
      // Add smart account overhead (ExecuteTransaction instruction + account validations)
      // Increased to 600k for complex swaps with multiple hops and Token-2022 interactions
      const SMART_ACCOUNT_OVERHEAD = 400_000;
      const newLimit = Math.min(jupiterLimit + SMART_ACCOUNT_OVERHEAD, 1_400_000); // Cap at 1.4M (Solana max)
      
      const newData = new Uint8Array(5);
      newData[0] = 2; // SetComputeUnitLimit discriminator
      newData[1] = newLimit & 0xff;
      newData[2] = (newLimit >> 8) & 0xff;
      newData[3] = (newLimit >> 16) & 0xff;
      newData[4] = (newLimit >> 24) & 0xff;
      console.log(`🔧 Increased compute unit limit: Jupiter=${jupiterLimit} + Overhead=${SMART_ACCOUNT_OVERHEAD} = ${newLimit}`);
      return {
        programIdIndex: ix.programAddressIndex,
        accountIndexes: new Uint8Array(ix.accountIndices ?? []),
        data: newData,
      };
    }
    return {
      programIdIndex: ix.programAddressIndex,
      accountIndexes: new Uint8Array(ix.accountIndices ?? []),
      data: ix.data ?? new Uint8Array(),
    };
  });

  // If no compute unit limit instruction exists, ADD one
  let finalInstructions = modifiedInstructions;
  let finalStaticAccounts = safeStaticAccounts;
  let finalComputeBudgetProgramIndex = computeBudgetProgramIndex;
  let finalNumReadonlyNonSignerAccounts = numReadonlyNonSignerAccounts;
  
  if (!hasComputeUnitLimit) {
    console.log('⚠️  No compute unit limit instruction found - adding one with 1.2M CU for smart account swap');
    
    // Add ComputeBudget program to accounts if not already there
    if (computeBudgetProgramIndex === -1) {
      // Need to add ComputeBudget program to static accounts
      finalStaticAccounts = [...safeStaticAccounts, COMPUTE_BUDGET_PROGRAM];
      finalComputeBudgetProgramIndex = finalStaticAccounts.length - 1;
      // ComputeBudget program is readonly and not a signer, so increment readonly non-signer count
      finalNumReadonlyNonSignerAccounts = numReadonlyNonSignerAccounts + 1;
      console.log(`🔧 Added ComputeBudget program at index ${finalComputeBudgetProgramIndex}`);
    } else {
      finalComputeBudgetProgramIndex = computeBudgetProgramIndex;
    }
    
    // Create SetComputeUnitLimit instruction (1.2M CU for complex swaps with smart account overhead)
    const CU_LIMIT = 600_000;
    const cuLimitData = new Uint8Array(5);
    cuLimitData[0] = 2; // SetComputeUnitLimit discriminator
    cuLimitData[1] = CU_LIMIT & 0xff;
    cuLimitData[2] = (CU_LIMIT >> 8) & 0xff;
    cuLimitData[3] = (CU_LIMIT >> 16) & 0xff;
    cuLimitData[4] = (CU_LIMIT >> 24) & 0xff;
    
    const cuLimitInstruction = {
      programIdIndex: finalComputeBudgetProgramIndex,
      accountIndexes: new Uint8Array(0), // No accounts needed
      data: cuLimitData,
    };
    
    // Insert at the beginning of instructions array (compute budget instructions should come first)
    finalInstructions = [cuLimitInstruction, ...modifiedInstructions];
    console.log(`✅ Added SetComputeUnitLimit instruction with ${CU_LIMIT} CU`);
  }
  
  const finalStaticAccountsLen = finalStaticAccounts.length;

  const transactionMessage = {
    numSigners: numSignerAccounts,
    numWritableSigners: Math.max(0, numSignerAccounts - numReadonlySignerAccounts),
    numWritableNonSigners: Math.max(0, (finalStaticAccountsLen - numSignerAccounts) - finalNumReadonlyNonSignerAccounts),
    accountKeys: finalStaticAccounts,
    instructions: finalInstructions,
    addressTableLookups: (addressTableLookups || []).map(lookup => ({
      accountKey: lookup.accountKey,
      writableIndexes: new Uint8Array(lookup.writableIndexes ?? []),
      readonlyIndexes: new Uint8Array(lookup.readonlyIndexes ?? []),
    })),
  };

  // Encode as the TransactionMessage format expected by smart contract
  const transactionMessageBytes = getTransactionMessageEncoder().encode(transactionMessage);

  // Final buffer hash/size
  const finalBuffer = new Uint8Array(transactionMessageBytes);
  const finalBufferSize = finalBuffer.length;
  // Debug header/lookups/indices
  const lookups = (compiled.addressTableLookups || []) as any[];
  const totalLookupIndexes = lookups.reduce(
    (sum, l) => sum + (l?.writableIndexes?.length || 0) + (l?.readonlyIndexes?.length || 0),
    0
  );
  let maxProgramIndex = 0;
  let maxAccountIndex = 0;
  for (const ix of (compiled.instructions || [])) {
    if (typeof ix.programAddressIndex === 'number') {
      maxProgramIndex = Math.max(maxProgramIndex, ix.programAddressIndex);
    }
    if (Array.isArray(ix.accountIndices)) {
      for (const ai of ix.accountIndices) {
        if (typeof ai === 'number') maxAccountIndex = Math.max(maxAccountIndex, ai);
      }
    }
  }
  console.log('🧩 TxMessage header:', { numSignerAccounts, numReadonlySignerAccounts, numReadonlyNonSignerAccounts, staticAccountsLen });
  console.log('🧩 Lookups:', { count: lookups.length, totalLookupIndexes });
  console.log('🧩 Indices:', { maxProgramIndex, maxAccountIndex, bound: staticAccountsLen + totalLookupIndexes - 1 });
  const hashBuf = await crypto.subtle.digest('SHA-256', finalBuffer as unknown as ArrayBuffer);
  const finalBufferHash = new Uint8Array(hashBuf);
  
  console.log(`📊 Raw TransactionMessage size (to buffer): ${finalBufferSize} bytes`);

  const feePayerSigner = createNoopSigner(feePayer);
  const latestBlockhash = (await rpc.getLatestBlockhash().send()).value;

  // Dynamic chunk sizing: Calculate optimal chunk size based on transaction size limits
  // CreateFromBuffer transaction breakdown:
  // - Transaction overhead (headers, accounts, etc.): ~400 bytes
  // - Instruction data (discriminator + args + transactionMessage): ~20 bytes + buffer_size
  // - Total: ~420 + buffer_size must be < 1232 bytes (Solana limit)
  const CREATEFROMBUFFER_OVERHEAD = 420; // Conservative estimate
  const TX_SIZE_LIMIT = 1232;
  const MAX_SINGLE_CHUNK = TX_SIZE_LIMIT - CREATEFROMBUFFER_OVERHEAD; // ~812 bytes
  
  // If buffer fits in single chunk, use it all. Otherwise, use safe 600-byte chunks.
  const CHUNK = finalBufferSize <= MAX_SINGLE_CHUNK ? finalBufferSize : 600;
  
  console.log(`📦 Dynamic chunk sizing: buffer=${finalBufferSize}B, chunk=${CHUNK}B, chunks=${Math.ceil(finalBufferSize / CHUNK)}`);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < finalBuffer.length; i += CHUNK) {
    chunks.push(finalBuffer.subarray(i, Math.min(i + CHUNK, finalBuffer.length)));
  }
  console.log('📦 Buffer chunks:', chunks.map((c, i) => `#${i + 1}=${c.length}`).join(', '));

  let chosenBufferIndex = bufferIndex & 0xff;
  let transactionBufferPda = await deriveBufferPda(smartAccountSettings, signer.address, chosenBufferIndex);
  // Probe and find a free buffer index if current exists.
  for (let attempts = 0; attempts < 256; attempts++) {
    const info = await rpc.getAccountInfo(transactionBufferPda, { commitment: 'processed' as any }).send();
    if (!info.value) break; // free
    chosenBufferIndex = (chosenBufferIndex + 1) & 0xff;
    transactionBufferPda = await deriveBufferPda(smartAccountSettings, signer.address, chosenBufferIndex);
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
      // Must pass full buffer size - Anchor needs this for account reallocation
      transactionMessage: new Uint8Array(finalBufferSize),
      memo: undefined,
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
    args: { memo: undefined },
  });

  // Split into two transactions if createFromBufferIx is too large
  // First: createFromBuffer only
  const createFromBufferMsg = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(feePayerSigner, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx => appendTransactionMessageInstructions([createFromBufferIx], tx)
  );
  const compiledCreateFromBuffer = compileTransaction(createFromBufferMsg);
  assertIsTransactionWithinSizeLimit(compiledCreateFromBuffer);
  const createFromBufferTx = new Uint8Array(compiledCreateFromBuffer.messageBytes);
  
  // Second: createProposal + approve
  const proposeAndApproveMsg = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(feePayerSigner, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx => appendTransactionMessageInstructions([createProposalIx, approveIx], tx)
  );
  const compiledProposeAndApprove = compileTransaction(proposeAndApproveMsg);
  assertIsTransactionWithinSizeLimit(compiledProposeAndApprove);
  const proposeAndApproveTx = new Uint8Array(compiledProposeAndApprove.messageBytes);

  // 4) execute + close buffer in same tx, compress outer with ALTs
  const executeIx = getExecuteTransactionInstruction({
    settings: smartAccountSettings,
    proposal: proposalPda,
    transaction: transactionPda,
    signer,
  });
  // Note: We don't need to close the buffer - CreateTransactionFromBuffer already does that
  // with `close = from_buffer_creator` in the Rust code
  
  // Build remaining accounts for execute instruction (match complexTransaction.ts)
  {
    const explicitParamsCount = 4; // settings, proposal, transaction, signer
    const explicitParams = executeIx.accounts.slice(0, explicitParamsCount);
    const resultAccounts: { address: Address; role: AccountRole }[] = [];

    // 1) ALT table accounts first (readonly), in the order of address_table_lookups
    // Use the addressTableLookups from params (the inner Jupiter transaction), not from compiled (outer wrapper)
    const execLookups = ((addressTableLookups || []) as any[]).filter((l: any) => l && l.accountKey);
    for (const lookup of execLookups) {
      resultAccounts.push({ address: toAddress(lookup.accountKey), role: AccountRole.READONLY });
    }

    // 2) Static accounts with correct roles
    const totalStatic = safeStaticAccounts.length;
    const numSignersInner = numSignerAccounts;
    const numWritableSignersInner = Math.max(0, numSignersInner - numReadonlySignerAccounts);
    const numWritableNonSignersInner = Math.max(
      0,
      totalStatic - numSignersInner - numReadonlyNonSignerAccounts
    );
    safeStaticAccounts.forEach((addrKey: any, idx: number) => {
      let role = AccountRole.READONLY;
      if (idx < numSignersInner) {
        role = idx < numWritableSignersInner ? AccountRole.WRITABLE : AccountRole.READONLY;
      } else {
        const j = idx - numSignersInner;
        role = j < numWritableNonSignersInner ? AccountRole.WRITABLE : AccountRole.READONLY;
      }
      resultAccounts.push({ address: toAddress(addrKey), role });
    });

    // 3) ALT-resolved: writable then readonly for each table (in order)
    if (execLookups.length > 0) {
      for (const lookup of execLookups) {
        const info = await rpc
          .getAccountInfo(toAddress(lookup.accountKey), { encoding: 'base64', commitment: 'finalized' })
          .send();
        if (!info.value?.data) continue;
        const b64 = Array.isArray(info.value.data) ? info.value.data[0] : (info.value.data as string);
        const dataBuf = Buffer.from(b64, 'base64');
        const data = new Uint8Array(dataBuf.buffer, dataBuf.byteOffset, dataBuf.byteLength);
        const HEADER_SIZE = 56;
        const PUBKEY_SIZE = 32;
        const total = Math.floor((data.length - HEADER_SIZE) / PUBKEY_SIZE);
        const getAddr = (i: number): Address | null => {
          if (i < 0 || i >= total) return null;
          const off = HEADER_SIZE + i * PUBKEY_SIZE;
          const keyBytes = data.subarray(off, off + PUBKEY_SIZE);
          return address(bs58.encode(keyBytes));
        };
        const writableIdxs: number[] = Array.from(lookup.writableIndexes ?? []);
        const readonlyIdxs: number[] = Array.from(lookup.readonlyIndexes ?? []);
        for (const wi of writableIdxs) {
          const a = getAddr(wi);
          if (a) resultAccounts.push({ address: a, role: AccountRole.WRITABLE });
        }
        for (const ri of readonlyIdxs) {
          const a = getAddr(ri);
          if (a) resultAccounts.push({ address: a, role: AccountRole.READONLY });
        }
      }
    }

    // Rebuild execute instruction with remaining accounts
    const executeIxWithAccounts = {
      ...executeIx,
      accounts: [...explicitParams, ...resultAccounts] as any,
    } as any;

    // Build message with updated execute instruction
    // NOTE: We set fee payer and blockhash here for compilation, but caller should refresh before signing
    // IMPORTANT: We MUST compress with ALTs to keep under the 1232 byte limit
    
    // CRITICAL: Simulate transaction first to determine optimal CU limit (Helius best practice)
    // Step 1: Create a test transaction with max CU limit to ensure simulation succeeds
    const testCULimitIx = getSetComputeUnitLimitInstruction({ units: 1_400_000 });
    const testMessage = pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageFeePayerSigner(feePayerSigner, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      tx => appendTransactionMessageInstructions([testCULimitIx, executeIxWithAccounts], tx)
    );
    
    // Compress test transaction if needed
    let testMessageCompressed = testMessage;
    if (execLookups.length > 0) {
      const addressesByLookupTableAddress: Record<string, Address[]> = {};
      for (const lookup of execLookups) {
        const info = await rpc
          .getAccountInfo(toAddress(lookup.accountKey), { encoding: 'base64', commitment: 'finalized' })
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
      testMessageCompressed = compressTransactionMessageUsingAddressLookupTables(
        testMessage as any,
        addressesByLookupTableAddress as any
      ) as any;
    }
    
    // Step 2: Simulate to get actual CU consumption
    const compiledTest = compileTransaction(testMessageCompressed);
    const testTx = new Uint8Array(compiledTest.messageBytes);
    
    // DEBUG: Log base64 transaction for manual testing
    const base64Tx = Buffer.from(testTx).toString('base64');
    console.log('🧪 Test transaction for simulation (base64):', base64Tx);
    console.log('🧪 Curl command:');
    console.log(`curl -X POST https://api.dev.astrolabefinance.com/surfpool -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"simulateTransaction","params":["${base64Tx}",{"encoding":"base64","replaceRecentBlockhash":true,"sigVerify":false}]}'`);
    
    // Fallback based on real-world data: ExecuteTransaction typically uses 200-250K CU for complex swaps
    // Using 400K provides ~80% safety margin and avoids overpaying for CUs
    let optimalCULimit = 400_000; 
    
    try {
      // Use simulateTransaction RPC method (may fail due to CORS on some endpoints)
      const base64Tx = Buffer.from(testTx).toString('base64') as any; // Cast to any to work with branded type
      const simulationResult = await rpc
        .simulateTransaction(base64Tx, {
          replaceRecentBlockhash: true,
          sigVerify: false,
          encoding: 'base64',
        })
        .send();
      
      if (simulationResult.value.unitsConsumed) {
        // Convert bigint to number and add 30% margin for smart account overhead + safety buffer
        // (Helius recommends 10%, we need more for smart accounts)
        const consumedCU = Number(simulationResult.value.unitsConsumed);
        optimalCULimit = Math.ceil(consumedCU * 1.3);
        console.log(`🔧 Simulated CU consumption: ${consumedCU}, setting limit to ${optimalCULimit} (30% margin)`);
      } else {
        console.log('⚠️  Simulation did not return CU consumption, using data-driven fallback: 400K CU');
      }
    } catch (error) {
      console.log(`⚠️  Transaction simulation failed (likely CORS), using data-driven fallback: 400K CU`);
      // Don't log full error as it's expected to fail on some RPC endpoints due to CORS
    }
    
    // Step 3: Create execute transaction with optimal CU limit
    const setCULimitIx = getSetComputeUnitLimitInstruction({ units: optimalCULimit });
    
    let executeMsgLocal = pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageFeePayerSigner(feePayerSigner, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      tx => appendTransactionMessageInstructions([setCULimitIx, executeIxWithAccounts], tx)
    );
    
    // Compress with ALTs if they exist
    if (execLookups.length > 0) {
      const addressesByLookupTableAddress: Record<string, Address[]> = {};
      for (const lookup of execLookups) {
        const info = await rpc
          .getAccountInfo(toAddress(lookup.accountKey), { encoding: 'base64', commitment: 'finalized' })
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
      executeMsgLocal = compressTransactionMessageUsingAddressLookupTables(
        executeMsgLocal as any,
        addressesByLookupTableAddress as any
      ) as any;
    }
    
    const compiledExecuteLocal = compileTransaction(executeMsgLocal);
    assertIsTransactionWithinSizeLimit(compiledExecuteLocal);
    const executeTxLocal = new Uint8Array(compiledExecuteLocal.messageBytes);

    // Replace previous executeTx with local one including remaining accounts
    return {
      createBufferTx: [createBufferTx, ...extendTxs],
      createFromBufferTx,
      proposeAndApproveTx,
      executeTx: executeTxLocal,
      transactionPda,
      proposalPda,
      transactionBufferPda,
      bufferIndex: chosenBufferIndex,
      finalBufferSize,
    };
  }
}