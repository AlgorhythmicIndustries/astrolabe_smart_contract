"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createComplexBufferedTransaction = createComplexBufferedTransaction;
const kit_1 = require("@solana/kit");
const transactions_1 = require("@solana/transactions");
const bs58 = __importStar(require("bs58"));
const instructions_1 = require("./clients/js/src/generated/instructions");
const settings_1 = require("./clients/js/src/generated/accounts/settings");
const index_1 = require("./utils/index");
async function createComplexBufferedTransaction(params) {
    const { rpc, smartAccountSettings, smartAccountPda, smartAccountPdaBump, signer, feePayer, innerTransactionBytes, addressTableLookups, memo = 'Buffered Smart Account Transaction', bufferIndex = 0, accountIndex = 0, } = params;
    // Derive PDAs and fetch settings
    const settings = await (0, settings_1.fetchSettings)(rpc, smartAccountSettings);
    const nextIndex = settings.data.transactionIndex + BigInt(1);
    // Derive Transaction PDA: ["smart_account", settings, "transaction", u64 index]
    const transactionPda = await (0, index_1.deriveTransactionPda)(smartAccountSettings, nextIndex);
    // Derive Proposal PDA: ["smart_account", settings, "transaction", u64 index, "proposal"]
    const proposalPda = await (0, index_1.deriveProposalPda)(smartAccountSettings, nextIndex);
    // Jupiter base64 provides a full versioned transaction. Decode to message bytes first.
    const versioned = (0, transactions_1.getTransactionDecoder)().decode(innerTransactionBytes);
    const compiled = (0, index_1.decodeTransactionMessage)(versioned.messageBytes);
    // Normalize addresses possibly coming as bytes/strings
    const toAddress = (k) => {
        if (!k)
            throw new Error('Invalid account key (undefined)');
        if (typeof k === 'string')
            return (0, kit_1.address)(k);
        if (k instanceof Uint8Array)
            return (0, kit_1.address)(bs58.encode(k));
        // Some kits wrap Address-like with .toString()
        const s = k.toString?.();
        if (typeof s === 'string')
            return (0, kit_1.address)(s);
        throw new Error('Unsupported account key type');
    };
    const header = (compiled.header || {});
    const numSignerAccounts = header?.numSignerAccounts ?? 1;
    const numReadonlySignerAccounts = header?.numReadonlySignerAccounts ?? 0;
    const numReadonlyNonSignerAccounts = header?.numReadonlyNonSignerAccounts ?? 0;
    const staticAccountsLen = (compiled.staticAccounts?.length || 0);
    const safeStaticAccounts = (compiled.staticAccounts || []);
    if (!safeStaticAccounts.length || safeStaticAccounts.some((k) => !k)) {
        throw new Error('Decoded message has missing static account keys');
    }
    // DEBUG: Check what account[0] is (should be smart account PDA for Jupiter swaps)
    console.log('🔍 Jupiter transaction account[0]:', toAddress(safeStaticAccounts[0]));
    console.log('🔍 Expected smart account PDA:', smartAccountPda);
    console.log('🔍 Account[0] matches smart account PDA:', toAddress(safeStaticAccounts[0]) === smartAccountPda);
    const safeInstructions = (compiled.instructions || []).filter((ix) => !!ix);
    // Check for and modify ComputeBudget instructions
    // ComputeBudgetProgram address
    const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';
    const computeBudgetProgramIndex = safeStaticAccounts.findIndex((addr) => toAddress(addr) === COMPUTE_BUDGET_PROGRAM);
    // Find existing SetComputeUnitLimit instruction (discriminator: 2)
    let hasComputeUnitLimit = false;
    const modifiedInstructions = safeInstructions.map((ix) => {
        if (ix.programAddressIndex === computeBudgetProgramIndex && ix.data && ix.data[0] === 2) {
            hasComputeUnitLimit = true;
            // SetComputeUnitLimit instruction found - increase it to 600K
            // Format: [2, u32 units (little endian)]
            const newLimit = 400_000;
            const newData = new Uint8Array(5);
            newData[0] = 2; // SetComputeUnitLimit discriminator
            newData[1] = newLimit & 0xff;
            newData[2] = (newLimit >> 8) & 0xff;
            newData[3] = (newLimit >> 16) & 0xff;
            newData[4] = (newLimit >> 24) & 0xff;
            console.log(`🔧 Increased existing compute unit limit to ${newLimit}`);
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
    // If no compute unit limit instruction exists, we need to add one
    // For now, log a warning - we'd need to add ComputeBudget program to accounts
    if (!hasComputeUnitLimit) {
        console.log('⚠️  No compute unit limit instruction found - transaction may fail with default 200K limit');
        console.log('💡 Consider adding a SetComputeUnitLimit instruction before buffering');
    }
    const transactionMessage = {
        numSigners: numSignerAccounts,
        numWritableSigners: Math.max(0, numSignerAccounts - numReadonlySignerAccounts),
        numWritableNonSigners: Math.max(0, (staticAccountsLen - numSignerAccounts) - numReadonlyNonSignerAccounts),
        accountKeys: safeStaticAccounts,
        instructions: modifiedInstructions,
        addressTableLookups: (addressTableLookups || []).map(lookup => ({
            accountKey: lookup.accountKey,
            writableIndexes: new Uint8Array(lookup.writableIndexes ?? []),
            readonlyIndexes: new Uint8Array(lookup.readonlyIndexes ?? []),
        })),
    };
    // Encode as the TransactionMessage format expected by smart contract
    const transactionMessageBytes = (0, index_1.getTransactionMessageEncoder)().encode(transactionMessage);
    // Final buffer hash/size
    const finalBuffer = new Uint8Array(transactionMessageBytes);
    const finalBufferSize = finalBuffer.length;
    // Debug header/lookups/indices
    const lookups = (compiled.addressTableLookups || []);
    const totalLookupIndexes = lookups.reduce((sum, l) => sum + (l?.writableIndexes?.length || 0) + (l?.readonlyIndexes?.length || 0), 0);
    let maxProgramIndex = 0;
    let maxAccountIndex = 0;
    for (const ix of (compiled.instructions || [])) {
        if (typeof ix.programAddressIndex === 'number') {
            maxProgramIndex = Math.max(maxProgramIndex, ix.programAddressIndex);
        }
        if (Array.isArray(ix.accountIndices)) {
            for (const ai of ix.accountIndices) {
                if (typeof ai === 'number')
                    maxAccountIndex = Math.max(maxAccountIndex, ai);
            }
        }
    }
    console.log('🧩 TxMessage header:', { numSignerAccounts, numReadonlySignerAccounts, numReadonlyNonSignerAccounts, staticAccountsLen });
    console.log('🧩 Lookups:', { count: lookups.length, totalLookupIndexes });
    console.log('🧩 Indices:', { maxProgramIndex, maxAccountIndex, bound: staticAccountsLen + totalLookupIndexes - 1 });
    const hashBuf = await crypto.subtle.digest('SHA-256', finalBuffer);
    const finalBufferHash = new Uint8Array(hashBuf);
    console.log(`📊 Raw TransactionMessage size (to buffer): ${finalBufferSize} bytes`);
    const feePayerSigner = (0, kit_1.createNoopSigner)(feePayer);
    const latestBlockhash = (await rpc.getLatestBlockhash().send()).value;
    // Chunk the buffer. 800 bytes per tx keeps the outer message under 1232 bytes.
    const CHUNK = 600; // Reduced from 800 to ensure buffer creation tx stays under 1232 byte limit
    const chunks = [];
    for (let i = 0; i < finalBuffer.length; i += CHUNK) {
        chunks.push(finalBuffer.subarray(i, Math.min(i + CHUNK, finalBuffer.length)));
    }
    console.log('📦 Buffer chunks:', chunks.map((c, i) => `#${i + 1}=${c.length}`).join(', '));
    let chosenBufferIndex = bufferIndex & 0xff;
    let transactionBufferPda = await (0, index_1.deriveBufferPda)(smartAccountSettings, signer.address, chosenBufferIndex);
    // Probe and find a free buffer index if current exists.
    for (let attempts = 0; attempts < 256; attempts++) {
        const info = await rpc.getAccountInfo(transactionBufferPda, { commitment: 'processed' }).send();
        if (!info.value)
            break; // free
        chosenBufferIndex = (chosenBufferIndex + 1) & 0xff;
        transactionBufferPda = await (0, index_1.deriveBufferPda)(smartAccountSettings, signer.address, chosenBufferIndex);
    }
    // 1) create_transaction_buffer with first slice
    const createBufferIx = (0, instructions_1.getCreateTransactionBufferInstruction)({
        settings: smartAccountSettings,
        transactionBuffer: transactionBufferPda,
        bufferCreator: signer,
        rentPayer: feePayerSigner,
        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
        bufferIndex: chosenBufferIndex,
        accountIndex,
        finalBufferHash,
        finalBufferSize,
        buffer: chunks[0],
    });
    const createBufferMessage = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), tx => (0, kit_1.setTransactionMessageFeePayerSigner)(feePayerSigner, tx), tx => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx), tx => (0, kit_1.appendTransactionMessageInstructions)([createBufferIx], tx));
    const compiledCreateBuffer = (0, kit_1.compileTransaction)(createBufferMessage);
    (0, kit_1.assertIsTransactionWithinSizeLimit)(compiledCreateBuffer);
    const createBufferTx = new Uint8Array(compiledCreateBuffer.messageBytes);
    // 2) extend_transaction_buffer for remaining slices
    const extendTxs = [];
    for (let i = 1; i < chunks.length; i++) {
        const extendIx = (0, instructions_1.getExtendTransactionBufferInstruction)({
            settings: smartAccountSettings,
            transactionBuffer: transactionBufferPda,
            creator: signer,
            buffer: chunks[i],
        });
        const msg = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), tx => (0, kit_1.setTransactionMessageFeePayerSigner)(feePayerSigner, tx), tx => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx), tx => (0, kit_1.appendTransactionMessageInstructions)([extendIx], tx));
        const compiledExtend = (0, kit_1.compileTransaction)(msg);
        (0, kit_1.assertIsTransactionWithinSizeLimit)(compiledExtend);
        extendTxs.push(new Uint8Array(compiledExtend.messageBytes));
    }
    // 3) create_transaction_from_buffer + create_proposal + approve
    const createFromBufferIx = (0, instructions_1.getCreateTransactionFromBufferInstruction)({
        settings: smartAccountSettings,
        transaction: transactionPda,
        creator: signer,
        rentPayer: feePayerSigner,
        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
        transactionBuffer: transactionBufferPda,
        fromBufferCreator: signer,
        args: {
            accountIndex,
            accountBump: smartAccountPdaBump,
            ephemeralSigners: 0,
            transactionMessage: new Uint8Array(finalBufferSize),
            memo: undefined,
        },
    });
    const createProposalIx = (0, instructions_1.getCreateProposalInstruction)({
        settings: smartAccountSettings,
        proposal: proposalPda,
        creator: signer,
        rentPayer: feePayerSigner,
        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
        transactionIndex: nextIndex,
        draft: false,
    });
    const approveIx = (0, instructions_1.getApproveProposalInstruction)({
        settings: smartAccountSettings,
        signer,
        proposal: proposalPda,
        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
        args: { memo: undefined },
    });
    // Split into two transactions if createFromBufferIx is too large
    // First: createFromBuffer only
    const createFromBufferMsg = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), tx => (0, kit_1.setTransactionMessageFeePayerSigner)(feePayerSigner, tx), tx => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx), tx => (0, kit_1.appendTransactionMessageInstructions)([createFromBufferIx], tx));
    const compiledCreateFromBuffer = (0, kit_1.compileTransaction)(createFromBufferMsg);
    (0, kit_1.assertIsTransactionWithinSizeLimit)(compiledCreateFromBuffer);
    const createFromBufferTx = new Uint8Array(compiledCreateFromBuffer.messageBytes);
    // Second: createProposal + approve
    const proposeAndApproveMsg = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), tx => (0, kit_1.setTransactionMessageFeePayerSigner)(feePayerSigner, tx), tx => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx), tx => (0, kit_1.appendTransactionMessageInstructions)([createProposalIx, approveIx], tx));
    const compiledProposeAndApprove = (0, kit_1.compileTransaction)(proposeAndApproveMsg);
    (0, kit_1.assertIsTransactionWithinSizeLimit)(compiledProposeAndApprove);
    const proposeAndApproveTx = new Uint8Array(compiledProposeAndApprove.messageBytes);
    // 4) execute + close buffer in same tx, compress outer with ALTs
    const executeIx = (0, instructions_1.getExecuteTransactionInstruction)({
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
        const resultAccounts = [];
        // 1) ALT table accounts first (readonly), in the order of address_table_lookups
        // Use the addressTableLookups from params (the inner Jupiter transaction), not from compiled (outer wrapper)
        const execLookups = (addressTableLookups || []).filter((l) => l && l.accountKey);
        for (const lookup of execLookups) {
            resultAccounts.push({ address: toAddress(lookup.accountKey), role: kit_1.AccountRole.READONLY });
        }
        // 2) Static accounts with correct roles
        const totalStatic = safeStaticAccounts.length;
        const numSignersInner = numSignerAccounts;
        const numWritableSignersInner = Math.max(0, numSignersInner - numReadonlySignerAccounts);
        const numWritableNonSignersInner = Math.max(0, totalStatic - numSignersInner - numReadonlyNonSignerAccounts);
        safeStaticAccounts.forEach((addrKey, idx) => {
            let role = kit_1.AccountRole.READONLY;
            if (idx < numSignersInner) {
                role = idx < numWritableSignersInner ? kit_1.AccountRole.WRITABLE : kit_1.AccountRole.READONLY;
            }
            else {
                const j = idx - numSignersInner;
                role = j < numWritableNonSignersInner ? kit_1.AccountRole.WRITABLE : kit_1.AccountRole.READONLY;
            }
            resultAccounts.push({ address: toAddress(addrKey), role });
        });
        // 3) ALT-resolved: writable then readonly for each table (in order)
        if (execLookups.length > 0) {
            for (const lookup of execLookups) {
                const info = await rpc
                    .getAccountInfo(toAddress(lookup.accountKey), { encoding: 'base64', commitment: 'finalized' })
                    .send();
                if (!info.value?.data)
                    continue;
                const b64 = Array.isArray(info.value.data) ? info.value.data[0] : info.value.data;
                const dataBuf = Buffer.from(b64, 'base64');
                const data = new Uint8Array(dataBuf.buffer, dataBuf.byteOffset, dataBuf.byteLength);
                const HEADER_SIZE = 56;
                const PUBKEY_SIZE = 32;
                const total = Math.floor((data.length - HEADER_SIZE) / PUBKEY_SIZE);
                const getAddr = (i) => {
                    if (i < 0 || i >= total)
                        return null;
                    const off = HEADER_SIZE + i * PUBKEY_SIZE;
                    const keyBytes = data.subarray(off, off + PUBKEY_SIZE);
                    return (0, kit_1.address)(bs58.encode(keyBytes));
                };
                const writableIdxs = Array.from(lookup.writableIndexes ?? []);
                const readonlyIdxs = Array.from(lookup.readonlyIndexes ?? []);
                for (const wi of writableIdxs) {
                    const a = getAddr(wi);
                    if (a)
                        resultAccounts.push({ address: a, role: kit_1.AccountRole.WRITABLE });
                }
                for (const ri of readonlyIdxs) {
                    const a = getAddr(ri);
                    if (a)
                        resultAccounts.push({ address: a, role: kit_1.AccountRole.READONLY });
                }
            }
        }
        // Rebuild execute instruction with remaining accounts
        const executeIxWithAccounts = {
            ...executeIx,
            accounts: [...explicitParams, ...resultAccounts],
        };
        // Build message with updated execute instruction
        // NOTE: We set fee payer and blockhash here for compilation, but caller should refresh before signing
        // IMPORTANT: We MUST compress with ALTs to keep under the 1232 byte limit
        let executeMsgLocal = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), tx => (0, kit_1.setTransactionMessageFeePayerSigner)(feePayerSigner, tx), tx => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx), tx => (0, kit_1.appendTransactionMessageInstructions)([executeIxWithAccounts], tx));
        // Compress with ALTs if they exist
        if (execLookups.length > 0) {
            const addressesByLookupTableAddress = {};
            for (const lookup of execLookups) {
                const info = await rpc
                    .getAccountInfo(toAddress(lookup.accountKey), { encoding: 'base64', commitment: 'finalized' })
                    .send();
                if (!info.value?.data)
                    continue;
                const b64 = Array.isArray(info.value.data) ? info.value.data[0] : info.value.data;
                const dataBuf = Buffer.from(b64, 'base64');
                const data = new Uint8Array(dataBuf.buffer, dataBuf.byteOffset, dataBuf.byteLength);
                const HEADER_SIZE = 56;
                const PUBKEY_SIZE = 32;
                const total = Math.floor((data.length - HEADER_SIZE) / PUBKEY_SIZE);
                const addrs = [];
                for (let i = 0; i < total; i++) {
                    const off = HEADER_SIZE + i * PUBKEY_SIZE;
                    const keyBytes = data.subarray(off, off + PUBKEY_SIZE);
                    addrs.push((0, kit_1.address)(bs58.encode(keyBytes)));
                }
                addressesByLookupTableAddress[lookup.accountKey.toString()] = addrs;
            }
            executeMsgLocal = (0, kit_1.compressTransactionMessageUsingAddressLookupTables)(executeMsgLocal, addressesByLookupTableAddress);
        }
        const compiledExecuteLocal = (0, kit_1.compileTransaction)(executeMsgLocal);
        (0, kit_1.assertIsTransactionWithinSizeLimit)(compiledExecuteLocal);
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
