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
exports.createComplexTransaction = createComplexTransaction;
const kit_1 = require("@solana/kit");
const buffer_1 = require("buffer");
const bs58 = __importStar(require("bs58"));
const instructions_1 = require("./clients/js/src/generated/instructions");
const smartAccountTransactionMessage_1 = require("./clients/js/src/generated/types/smartAccountTransactionMessage");
const index_1 = require("./utils/index");
/**
 * Creates a complex transaction split into three parts for large transactions like swaps
 * Part 1: propose (contains Jupiter data - medium size)
 * Part 2: vote (minimal size)
 * Part 3: execute (medium size with account references)
 */
async function createComplexTransaction(params) {
    console.log('🚀 Starting createComplexTransaction...');
    console.log('🔍 Params type:', typeof params);
    console.log('🔍 Params is null/undefined:', params == null);
    if (params.innerTransactionBytes) {
        console.log('🔍 innerTransactionBytes exists:', true);
        console.log('🔍 innerTransactionBytes type:', typeof params.innerTransactionBytes);
        console.log('🔍 innerTransactionBytes length:', params.innerTransactionBytes.length);
    }
    else {
        console.log('🔍 innerTransactionBytes exists:', false);
    }
    console.log('📋 Input params:', {
        smartAccountSettings: params.smartAccountSettings.toString(),
        smartAccountPda: params.smartAccountPda.toString(),
        smartAccountPdaBump: params.smartAccountPdaBump,
        signerAddress: params.signer.address.toString(),
        feePayerAddress: params.feePayer.toString(),
        innerTransactionSize: params.innerTransactionBytes ? params.innerTransactionBytes.length : 'N/A',
        addressTableLookupsReceived: !!params.addressTableLookups,
        addressTableLookupsCount: params.addressTableLookups?.length || 0,
        memo: params.memo || 'Complex Smart Account Transaction'
    });
    console.log('🔍 Raw addressTableLookups in complexTransaction:', JSON.stringify(params.addressTableLookups, null, 2));
    console.log('🔧 About to destructure params...');
    const { rpc, smartAccountSettings, smartAccountPda, smartAccountPdaBump, signer, feePayer, innerTransactionBytes, addressTableLookups = [], inputTokenMint, } = params;
    const memo = params.memo || 'Complex Smart Account Transaction';
    console.log('✅ Destructuring completed');
    console.log('🔍 After destructuring - addressTableLookups:', JSON.stringify(addressTableLookups, null, 2));
    console.log('🔍 After destructuring - addressTableLookups.length:', addressTableLookups?.length);
    // Validate that we have transaction bytes
    if (!innerTransactionBytes) {
        throw new Error('innerTransactionBytes is required for complex transactions');
    }
    console.log('🔧 Step 1: Fetching latest settings state...');
    // 1. Fetch the current smart account settings to get the next transaction index
    const settingsAccount = await (0, index_1.fetchSmartAccountSettings)(rpc, smartAccountSettings);
    const transactionIndex = settingsAccount.nextTransactionIndex;
    console.log('✅ Settings fetched:', {
        currentTransactionIndex: settingsAccount.currentTransactionIndex.toString(),
        nextTransactionIndex: transactionIndex.toString(),
        threshold: settingsAccount.threshold,
    });
    console.log('🔧 Step 2: Deriving transaction PDA...');
    // 2. Derive the transaction PDA
    const transactionPda = await (0, index_1.deriveTransactionPda)(smartAccountSettings, transactionIndex);
    console.log('✅ Transaction PDA derived:', transactionPda.toString());
    console.log('🔧 Step 3: Deriving proposal PDA...');
    // 3. Derive the proposal PDA
    const proposalPda = await (0, index_1.deriveProposalPda)(smartAccountSettings, transactionIndex);
    console.log('✅ Proposal PDA derived:', proposalPda.toString());
    console.log('🔧 Step 4: Building inner transaction message...');
    console.log('🔧 Using raw transaction bytes (preserving ALT structure)...');
    console.log('🔍 Raw transaction bytes type:', typeof innerTransactionBytes);
    console.log('🔍 Raw transaction bytes length:', innerTransactionBytes.length);
    console.log('✅ Raw transaction bytes used:', { messageSize: innerTransactionBytes.length });
    // 4. Decode the inner transaction message to extract account info
    console.log('🔧 Decoding compiled message...');
    const compiledInnerMessage = { messageBytes: innerTransactionBytes };
    console.log('🔍 compiledInnerMessage:', { messageBytes: `Uint8Array(${compiledInnerMessage.messageBytes.length})` });
    console.log('🔍 messageBytes type:', typeof compiledInnerMessage.messageBytes);
    console.log('🔍 messageBytes length:', compiledInnerMessage.messageBytes.length);
    console.log('🔍 messageBytes first 16 bytes:', Array.from(compiledInnerMessage.messageBytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('✅ Message decoded successfully');
    const decodedMessage = (0, kit_1.getCompiledTransactionMessageDecoder)().decode(compiledInnerMessage.messageBytes);
    console.log('✅ Inner transaction compiled:', {
        staticAccounts: decodedMessage.staticAccounts.length,
        instructions: decodedMessage.instructions.length,
        messageSize: compiledInnerMessage.messageBytes.length,
    });
    console.log('🔧 Converting Jupiter transaction to smart account format...');
    // Convert from Jupiter's standard Solana format to smart account's custom format
    const numSigners = decodedMessage.header.numSignerAccounts;
    const numReadonlySigners = decodedMessage.header.numReadonlySignerAccounts;
    const numWritableSigners = numSigners - numReadonlySigners;
    const numWritableNonSigners = decodedMessage.staticAccounts.length - numSigners - decodedMessage.header.numReadonlyNonSignerAccounts;
    const smartAccountMessage = {
        numSigners: numSigners,
        numWritableSigners: numWritableSigners,
        numWritableNonSigners: numWritableNonSigners,
        accountKeys: decodedMessage.staticAccounts,
        instructions: decodedMessage.instructions.map(ix => ({
            programIdIndex: ix.programAddressIndex,
            accountIndexes: new Uint8Array(ix.accountIndices ?? []),
            data: ix.data ?? new Uint8Array(),
        })),
        // Use the passed address table lookups (from Jupiter transaction)
        addressTableLookups: addressTableLookups.map(lookup => ({
            accountKey: lookup.accountKey,
            writableIndexes: new Uint8Array(lookup.writableIndexes ?? []),
            readonlyIndexes: new Uint8Array(lookup.readonlyIndexes ?? []),
        })),
    };
    console.log('🔧 Encoding smart account transaction message...');
    const transactionMessageBytes = (0, smartAccountTransactionMessage_1.getSmartAccountTransactionMessageEncoder)().encode(smartAccountMessage);
    console.log('✅ Smart account transaction message encoded:', {
        messageSize: transactionMessageBytes.length,
        numSigners: smartAccountMessage.numSigners,
        numAccounts: smartAccountMessage.accountKeys.length,
        numInstructions: smartAccountMessage.instructions.length,
        innerJupiterSize: transactionMessageBytes.length,
        estimatedProposeSize: transactionMessageBytes.length + 200 // rough estimate
    });
    // ===== PART 1: PROPOSE + VOTE TRANSACTION =====
    console.log('🔧 Building Part 1: Propose Transaction...');
    // 5. Create the transaction account instruction
    console.log('🔧 Creating CreateTransaction instruction with transactionMessage of', transactionMessageBytes.length, 'bytes');
    const createTransactionInstruction = (0, instructions_1.getCreateTransactionInstruction)({
        settings: smartAccountSettings,
        transaction: transactionPda,
        creator: signer,
        rentPayer: (0, kit_1.createNoopSigner)(feePayer), // Backend pays for transaction account rent
        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
        args: {
            accountIndex: 0, // Use 0 for the primary smart account
            accountBump: smartAccountPdaBump,
            ephemeralSigners: 0,
            transactionMessage: transactionMessageBytes,
            memo,
        },
    });
    // 6. Create the proposal instruction
    const createProposalInstruction = (0, instructions_1.getCreateProposalInstruction)({
        settings: smartAccountSettings,
        proposal: proposalPda,
        creator: signer,
        rentPayer: (0, kit_1.createNoopSigner)(feePayer), // Backend pays for proposal account rent
        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
        transactionIndex: transactionIndex,
        draft: false,
    });
    // 7. Create the approve proposal instruction
    const approveProposalInstruction = (0, instructions_1.getApproveProposalInstruction)({
        settings: smartAccountSettings,
        signer: signer,
        proposal: proposalPda,
        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
        args: { memo: null },
    });
    // Build Part 1 transaction (propose only - contains the large Jupiter data)
    const proposeInstructions = [
        createTransactionInstruction,
        createProposalInstruction,
    ];
    const latestBlockhashResponse = await rpc.getLatestBlockhash().send();
    const latestBlockhash = latestBlockhashResponse.value;
    // Create a real signer for the fee payer to ensure it's counted as a required signer
    const feePayerSigner = (0, kit_1.createNoopSigner)(feePayer);
    const proposeTransactionMessage = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), (tx) => (0, kit_1.setTransactionMessageFeePayerSigner)(feePayerSigner, tx), // Use fee payer as real signer for gasless transactions
    (tx) => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx), (tx) => (0, kit_1.appendTransactionMessageInstructions)(proposeInstructions, tx));
    const compiledProposeTransaction = (0, kit_1.compileTransaction)(proposeTransactionMessage);
    console.log('✅ Part 1 (Propose) transaction compiled:', {
        messageSize: compiledProposeTransaction.messageBytes.length
    });
    // ===== PART 2: VOTE TRANSACTION =====
    console.log('🔧 Building Part 2: Vote Transaction...');
    // Start with the approve proposal instruction
    const voteInstructions = [approveProposalInstruction];
    // Add ATA creation instruction if inputTokenMint is provided (for Jupiter swaps with fees)
    if (inputTokenMint && params.inputTokenProgram && params.backendFeeAccount) {
        console.log('🏦 Creating backend fee account instruction for token:', inputTokenMint, 'at address:', params.backendFeeAccount);
        // Constants for ATA creation
        const BACKEND_FEE_PAYER = 'astroi1Rrf6rqtJ1BZg7tDyx1NiUaQkYp3uD8mmTeJQ';
        const WSOL_MINT = 'So11111111111111111111111111111111111111112';
        const SPL_TOKEN_PROGRAM_ID = (0, kit_1.address)('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
        const TOKEN_2022_PROGRAM_ID = (0, kit_1.address)('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
        const ASSOCIATED_TOKEN_PROGRAM_ID = (0, kit_1.address)('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
        const SYSTEM_PROGRAM_ID = (0, kit_1.address)('11111111111111111111111111111111');
        // Convert native to WSOL mint
        const actualMint = inputTokenMint === 'native' ? WSOL_MINT : inputTokenMint;
        // Determine correct token program
        let tokenProgram = SPL_TOKEN_PROGRAM_ID;
        if (params.inputTokenProgram === 'native') {
            tokenProgram = SPL_TOKEN_PROGRAM_ID;
        }
        else if (params.inputTokenProgram === TOKEN_2022_PROGRAM_ID.toString()) {
            tokenProgram = TOKEN_2022_PROGRAM_ID;
        }
        else if (params.inputTokenProgram && params.inputTokenProgram !== SPL_TOKEN_PROGRAM_ID.toString()) {
            tokenProgram = (0, kit_1.address)(params.inputTokenProgram);
        }
        console.log('🔧 Using token program for ATA creation:', tokenProgram.toString());
        // Use the pre-derived ATA address from frontend
        const backendFeePayerAddress = (0, kit_1.address)(BACKEND_FEE_PAYER);
        const mintAddress = (0, kit_1.address)(actualMint);
        if (!params.backendFeeAccount) {
            throw new Error('backendFeeAccount is required for ATA creation');
        }
        const backendFeeAccountAddress = (0, kit_1.address)(params.backendFeeAccount);
        // Create the ATA creation instruction with correct token program and properly derived ATA address
        const createATAInstruction = {
            programAddress: ASSOCIATED_TOKEN_PROGRAM_ID,
            accounts: [
                { address: feePayer, role: kit_1.AccountRole.WRITABLE_SIGNER }, // Payer for account creation
                { address: backendFeeAccountAddress, role: kit_1.AccountRole.WRITABLE }, // Properly derived ATA address
                { address: backendFeePayerAddress, role: kit_1.AccountRole.READONLY }, // Owner of the ATA
                { address: mintAddress, role: kit_1.AccountRole.READONLY }, // Token mint
                { address: SYSTEM_PROGRAM_ID, role: kit_1.AccountRole.READONLY }, // System program
                { address: tokenProgram, role: kit_1.AccountRole.READONLY }, // Correct token program (SPL Token or Token-2022)
            ],
            data: new Uint8Array([1]), // ATA idempotent creation instruction discriminator
        };
        voteInstructions.push(createATAInstruction);
        console.log('✅ Added backend fee account creation to vote transaction for ATA:', params.backendFeeAccount);
    }
    const voteTransactionMessage = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), (tx) => (0, kit_1.setTransactionMessageFeePayerSigner)(feePayerSigner, tx), // Use fee payer as real signer for gasless transactions
    (tx) => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx), (tx) => (0, kit_1.appendTransactionMessageInstructions)(voteInstructions, tx));
    const compiledVoteTransaction = (0, kit_1.compileTransaction)(voteTransactionMessage);
    console.log('✅ Part 2 (Vote) transaction compiled:', {
        messageSize: compiledVoteTransaction.messageBytes.length
    });
    // ===== PART 3: EXECUTE TRANSACTION =====
    console.log('🔧 Building Part 3: Execute Transaction...');
    // Create the execute transaction instruction
    let executeTransactionInstruction = (0, instructions_1.getExecuteTransactionInstruction)({
        settings: smartAccountSettings,
        proposal: proposalPda,
        transaction: transactionPda,
        signer: signer,
    });
    // Create close instruction to reclaim rent back to fee payer
    const closeTransactionInstruction = (0, instructions_1.getCloseTransactionInstruction)({
        settings: smartAccountSettings,
        proposal: proposalPda,
        transaction: transactionPda,
        proposalRentCollector: feePayer, // Rent goes back to backend fee payer
        transactionRentCollector: feePayer, // Rent goes back to backend fee payer
        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
    });
    // The smart contract expects manual ALT resolution via remaining accounts (message_account_infos).
    // We must pass:
    // 1) All static accounts from the inner message in the exact order they appear.
    // 2) All ALT-resolved writable addresses (in order), then readonly addresses (in order) for each ALT.
    // We should NOT include the ALT table account itself.
    console.log('🔧🔧🔧 EXECUTE TRANSACTION ACCOUNT SETUP STARTING 🔧🔧🔧');
    console.log('🔧 Smart contract expects manual ALT resolution');
    console.log('🔍 addressTableLookups exists:', !!addressTableLookups);
    console.log('🔍 addressTableLookups type:', typeof addressTableLookups);
    console.log('🔍 addressTableLookups length:', addressTableLookups?.length || 0);
    console.log('🔍 addressTableLookups:', JSON.stringify(addressTableLookups || [], null, 2));
    console.log('🔍 Static accounts:', decodedMessage.staticAccounts?.length || 0);
    // Build remaining accounts precisely and in-order.
    const explicitParamsCount = 4; // settings, proposal, transaction, signer
    const explicitParams = executeTransactionInstruction.accounts.slice(0, explicitParamsCount);
    const resultAccounts = [];
    // Static accounts writability derived from header
    const hdr = decodedMessage.header;
    const total = decodedMessage.staticAccounts.length;
    const numSignersInner = hdr.numSignerAccounts;
    const numWritableSignersInner = numSignersInner - hdr.numReadonlySignerAccounts;
    const numWritableNonSignersInner = total - numSignersInner - hdr.numReadonlyNonSignerAccounts;
    // 1) ALT table accounts first (if any)
    if (addressTableLookups && addressTableLookups.length > 0) {
        for (const lookup of addressTableLookups) {
            resultAccounts.push({ address: lookup.accountKey, role: kit_1.AccountRole.READONLY });
        }
    }
    // 2) Static accounts in order with correct roles
    decodedMessage.staticAccounts.forEach((addrKey, idx) => {
        let role = kit_1.AccountRole.READONLY;
        if (idx < numSignersInner) {
            role = idx < numWritableSignersInner ? kit_1.AccountRole.WRITABLE : kit_1.AccountRole.READONLY;
        }
        else {
            const j = idx - numSignersInner;
            role = j < numWritableNonSignersInner ? kit_1.AccountRole.WRITABLE : kit_1.AccountRole.READONLY;
        }
        resultAccounts.push({ address: addrKey, role });
    });
    // 3) ALT-resolved: writable indexes then readonly indexes for each table
    if (addressTableLookups && addressTableLookups.length > 0) {
        for (const lookup of addressTableLookups) {
            const altAccountInfo = await rpc.getAccountInfo(lookup.accountKey, {
                encoding: 'base64',
                commitment: 'finalized',
            }).send();
            if (!altAccountInfo.value?.data)
                throw new Error('ALT not found');
            const altDataBase64 = Array.isArray(altAccountInfo.value.data)
                ? altAccountInfo.value.data[0]
                : altAccountInfo.value.data;
            const altData = buffer_1.Buffer.from(altDataBase64, 'base64');
            const HEADER_SIZE = 56;
            const PUBKEY_SIZE = 32;
            const totalAddresses = Math.floor((altData.length - HEADER_SIZE) / PUBKEY_SIZE);
            const getAddressAtIndex = (index) => {
                if (index >= totalAddresses)
                    throw new Error('ALT index OOB');
                const offset = HEADER_SIZE + index * PUBKEY_SIZE;
                const pubkeyBytes = altData.subarray(offset, offset + PUBKEY_SIZE);
                return (0, kit_1.address)(bs58.encode(new Uint8Array(pubkeyBytes)));
            };
            for (const writableIndex of (lookup.writableIndexes || [])) {
                resultAccounts.push({ address: getAddressAtIndex(writableIndex), role: kit_1.AccountRole.WRITABLE });
            }
            for (const readonlyIndex of (lookup.readonlyIndexes || [])) {
                resultAccounts.push({ address: getAddressAtIndex(readonlyIndex), role: kit_1.AccountRole.READONLY });
            }
        }
    }
    // Rebuild execute instruction accounts: explicit params + precise remaining accounts in expected order
    // Create a new instruction object since the original accounts property is readonly
    executeTransactionInstruction = {
        ...executeTransactionInstruction,
        accounts: [...explicitParams, ...resultAccounts],
    };
    console.log('✅ Execute instruction accounts setup completed');
    console.log('🔍 Final execute instruction accounts count:', executeTransactionInstruction.accounts.length);
    console.log('🔍 Account order verification:');
    executeTransactionInstruction.accounts.forEach((account, index) => {
        console.log(`  [${index}] ${account.address} (role: ${account.role})`);
    });
    // Check for duplicate signer accounts
    const signerAddresses = executeTransactionInstruction.accounts
        .filter(account => account.role === 2)
        .map(account => account.address);
    console.log('🔍 Signer accounts found:', signerAddresses);
    const uniqueSigners = new Set(signerAddresses);
    if (signerAddresses.length !== uniqueSigners.size) {
        console.error('❌ DUPLICATE SIGNER ACCOUNTS DETECTED!');
        console.error('Signer addresses:', signerAddresses);
        console.error('Unique signers:', Array.from(uniqueSigners));
    }
    const executeInstructions = [executeTransactionInstruction, closeTransactionInstruction];
    let executeTransactionMessage = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), (tx) => (0, kit_1.setTransactionMessageFeePayerSigner)(feePayerSigner, tx), // Use fee payer as real signer for gasless transactions
    (tx) => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx), (tx) => (0, kit_1.appendTransactionMessageInstructions)(executeInstructions, tx));
    // Compress outer v0 message using ALTs so static keys are reduced.
    if (addressTableLookups && addressTableLookups.length > 0) {
        // Build a map of lookup table address -> addresses[]
        const addressesByLookupTableAddress = {};
        for (const lookup of addressTableLookups) {
            const altInfo = await rpc.getAccountInfo(lookup.accountKey, { encoding: 'base64', commitment: 'finalized' }).send();
            if (!altInfo.value?.data)
                continue;
            const b64 = Array.isArray(altInfo.value.data) ? altInfo.value.data[0] : altInfo.value.data;
            const data = buffer_1.Buffer.from(b64, 'base64');
            const HEADER_SIZE = 56;
            const PUBKEY_SIZE = 32;
            const total = Math.floor((data.length - HEADER_SIZE) / PUBKEY_SIZE);
            const addrs = [];
            for (let i = 0; i < total; i++) {
                const off = HEADER_SIZE + i * PUBKEY_SIZE;
                addrs.push((0, kit_1.address)(bs58.encode(new Uint8Array(data.subarray(off, off + PUBKEY_SIZE)))));
            }
            addressesByLookupTableAddress[lookup.accountKey.toString()] = addrs;
        }
        executeTransactionMessage = (0, kit_1.compressTransactionMessageUsingAddressLookupTables)(executeTransactionMessage, addressesByLookupTableAddress);
    }
    const compiledExecuteTransaction = (0, kit_1.compileTransaction)(executeTransactionMessage);
    console.log('✅ Part 3 (Execute) transaction compiled:', {
        messageSize: compiledExecuteTransaction.messageBytes.length
    });
    console.log('🎉 Complex transaction split completed:', {
        part1Size: compiledProposeTransaction.messageBytes.length,
        part2Size: compiledVoteTransaction.messageBytes.length,
        part3Size: compiledExecuteTransaction.messageBytes.length,
        totalSize: compiledProposeTransaction.messageBytes.length + compiledVoteTransaction.messageBytes.length + compiledExecuteTransaction.messageBytes.length,
        transactionIndex: transactionIndex.toString()
    });
    return {
        proposeTransactionBuffer: new Uint8Array(compiledProposeTransaction.messageBytes),
        voteTransactionBuffer: new Uint8Array(compiledVoteTransaction.messageBytes),
        executeTransactionBuffer: new Uint8Array(compiledExecuteTransaction.messageBytes),
        transactionPda,
        proposalPda,
        transactionIndex,
    };
}
