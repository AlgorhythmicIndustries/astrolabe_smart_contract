"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProposeVoteExecuteTransaction = exports.deriveSmartAccountInfo = void 0;
const kit_1 = require("@solana/kit");
const buffer_1 = require("buffer");
const settings_1 = require("./clients/js/src/generated/accounts/settings");
const instructions_1 = require("./clients/js/src/generated/instructions");
const programs_1 = require("./clients/js/src/generated/programs");
const smartAccountTransactionMessage_1 = require("./clients/js/src/generated/types/smartAccountTransactionMessage");
const bs58_1 = __importDefault(require("bs58"));
/**
 * Derives smart account PDA and related info from a settings address
 *
 * @param rpc - The RPC client
 * @param settingsAddress - The smart account settings PDA
 * @param accountIndex - Optional account index to use if settings account doesn't exist
 * @returns Smart account info including the PDA and bump
 */
async function deriveSmartAccountInfo(rpc, settingsAddress, accountIndex) {
    // Always use account_index = 0 for the primary smart account
    // The accountIndex parameter is kept for compatibility but ignored
    console.log('🔧 Using account index 0 for primary smart account (ignoring any provided accountIndex)');
    // Derive the smart account PDA using account_index = 0 (primary smart account)
    // This matches the working example and the expected u8 type in the program
    console.log('🔧 Deriving smart account PDA with:', {
        settingsAddress: settingsAddress.toString(),
        accountIndex: '0',
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS.toString()
    });
    const [smartAccountPda, smartAccountPdaBump] = await (0, kit_1.getProgramDerivedAddress)({
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            bs58_1.default.decode(settingsAddress),
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            // Use account_index 0 for the primary smart account (matches working example)
            new Uint8Array([0]),
        ],
    });
    console.log('✅ Derived smart account PDA:', {
        smartAccountPda: smartAccountPda.toString(),
        bump: smartAccountPdaBump
    });
    return {
        smartAccountPda,
        settingsAddress,
        accountIndex: 0n, // Always 0 for primary smart account
        smartAccountPdaBump,
    };
}
exports.deriveSmartAccountInfo = deriveSmartAccountInfo;
/**
 * High-level function that combines the smart account propose-vote-execute pattern
 * into a single serialized transaction. This creates a transaction, proposal, approves it,
 * and executes it all in one atomic operation.
 *
 * @param params - The parameters for the workflow
 * @returns Promise resolving to transaction buffer and metadata
 */
async function createProposeVoteExecuteTransaction(params) {
    console.log('🚀 Starting createProposeVoteExecuteTransaction...');
    console.log('🔍 Params type:', typeof params);
    console.log('🔍 Params is null/undefined:', params == null);
    if (params) {
        console.log('🔍 innerTransactionBytes exists:', !!params.innerTransactionBytes);
        console.log('🔍 innerInstructions exists:', !!params.innerInstructions);
        console.log('🔍 innerTransactionBytes type:', typeof params.innerTransactionBytes);
        if (params.innerTransactionBytes) {
            console.log('🔍 innerTransactionBytes length:', params.innerTransactionBytes.length);
        }
    }
    else {
        console.log('❌ Params is null or undefined!');
    }
    try {
        console.log('📋 Input params:', {
            smartAccountSettings: params.smartAccountSettings ? params.smartAccountSettings.toString() : 'undefined',
            smartAccountPda: params.smartAccountPda ? params.smartAccountPda.toString() : 'undefined',
            smartAccountPdaBump: params.smartAccountPdaBump,
            signerAddress: params.signer && params.signer.address ? params.signer.address.toString() : 'undefined',
            innerInstructionCount: params.innerInstructions ? params.innerInstructions.length : 'N/A',
            innerTransactionSize: params.innerTransactionBytes ? params.innerTransactionBytes.length : 'N/A',
            memo: params.memo || 'Smart Account Transaction'
        });
    }
    catch (logError) {
        console.error('❌ Error in logging params:', logError);
        throw logError;
    }
    console.log('🔧 About to destructure params...');
    // Destructure safely
    const rpc = params.rpc;
    const smartAccountSettings = params.smartAccountSettings;
    const smartAccountPda = params.smartAccountPda;
    const smartAccountPdaBump = params.smartAccountPdaBump;
    const signer = params.signer;
    const innerInstructions = params.innerInstructions;
    const innerTransactionBytes = params.innerTransactionBytes;
    const addressTableLookups = params.addressTableLookups || [];
    const memo = params.memo || 'Smart Account Transaction';
    console.log('✅ Destructuring completed');
    // Validate that we have either instructions or transaction bytes
    if (!innerInstructions && !innerTransactionBytes) {
        throw new Error('Either innerInstructions or innerTransactionBytes must be provided');
    }
    if (innerInstructions && innerTransactionBytes) {
        throw new Error('Cannot provide both innerInstructions and innerTransactionBytes');
    }
    console.log('🔧 Step 1: Fetching latest settings state...');
    // 1. Fetch the latest on-chain state for the Settings account
    const settings = await (0, settings_1.fetchSettings)(rpc, smartAccountSettings);
    const transactionIndex = settings.data.transactionIndex + 1n;
    console.log('✅ Settings fetched:', {
        currentTransactionIndex: settings.data.transactionIndex.toString(),
        nextTransactionIndex: transactionIndex.toString(),
        threshold: settings.data.threshold
    });
    console.log('🔧 Step 2: Deriving transaction PDA...');
    // 2. Derive the PDA for the new Transaction account
    const [transactionPda] = await (0, kit_1.getProgramDerivedAddress)({
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            bs58_1.default.decode(smartAccountSettings),
            new Uint8Array(buffer_1.Buffer.from('transaction')),
            new Uint8Array(new BigUint64Array([transactionIndex]).buffer),
        ],
    });
    console.log('✅ Transaction PDA derived:', transactionPda.toString());
    console.log('🔧 Step 3: Deriving proposal PDA...');
    // 3. Derive the PDA for the Proposal account
    const [proposalPda] = await (0, kit_1.getProgramDerivedAddress)({
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            bs58_1.default.decode(smartAccountSettings),
            new Uint8Array(buffer_1.Buffer.from('transaction')),
            new Uint8Array(new BigUint64Array([transactionIndex]).buffer),
            new Uint8Array(buffer_1.Buffer.from('proposal')),
        ],
    });
    console.log('✅ Proposal PDA derived:', proposalPda.toString());
    console.log('🔧 Step 4: Building inner transaction message...');
    let compiledInnerMessage;
    if (innerTransactionBytes) {
        console.log('🔧 Using raw transaction bytes (preserving ALT structure)...');
        console.log('🔍 Raw transaction bytes type:', typeof innerTransactionBytes);
        console.log('🔍 Raw transaction bytes length:', innerTransactionBytes ? innerTransactionBytes.length : 'undefined');
        // Use the raw transaction bytes directly - this preserves ALT structure
        compiledInnerMessage = {
            messageBytes: innerTransactionBytes
        };
        console.log('✅ Raw transaction bytes used:', {
            messageSize: innerTransactionBytes.length
        });
    }
    else {
        console.log('🔧 Building transaction from individual instructions...');
        // 4. Build and ENCODE the inner transaction message from instructions
        const { value: latestBlockhashForInner } = await rpc.getLatestBlockhash().send();
        console.log('✅ Latest blockhash fetched for inner transaction:', latestBlockhashForInner.blockhash);
        const innerTransactionMessage = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), (tx) => (0, kit_1.setTransactionMessageFeePayerSigner)((0, kit_1.createNoopSigner)(smartAccountPda), tx), (tx) => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhashForInner, tx), (tx) => (0, kit_1.appendTransactionMessageInstructions)(innerInstructions || [], tx));
        console.log('🔧 Compiling inner transaction message...');
        compiledInnerMessage = (0, kit_1.compileTransaction)(innerTransactionMessage);
    }
    console.log('🔧 Decoding compiled message...');
    console.log('🔍 compiledInnerMessage:', compiledInnerMessage);
    console.log('🔍 messageBytes type:', typeof compiledInnerMessage.messageBytes);
    console.log('🔍 messageBytes length:', compiledInnerMessage.messageBytes ? compiledInnerMessage.messageBytes.length : 'undefined');
    const decodedMessage = (0, kit_1.getCompiledTransactionMessageDecoder)().decode(compiledInnerMessage.messageBytes);
    console.log('✅ Message decoded successfully');
    console.log('✅ Inner transaction compiled:', {
        staticAccounts: decodedMessage.staticAccounts ? decodedMessage.staticAccounts.length : 'undefined',
        instructions: decodedMessage.instructions ? decodedMessage.instructions.length : 'undefined',
        messageSize: compiledInnerMessage.messageBytes ? compiledInnerMessage.messageBytes.length : 'undefined'
    });
    console.log('🔧 Creating smart account transaction message...');
    // Manually construct the smart account transaction message with proper ALT handling
    const smartAccountMessage = {
        numSigners: 1,
        numWritableSigners: 1,
        numWritableNonSigners: decodedMessage.staticAccounts.length - 1,
        accountKeys: decodedMessage.staticAccounts,
        instructions: decodedMessage.instructions.map(ix => ({
            programIdIndex: ix.programAddressIndex,
            accountIndexes: new Uint8Array(ix.accountIndices ?? []),
            data: ix.data ?? new Uint8Array(),
        })),
        addressTableLookups: addressTableLookups.map(lookup => ({
            accountKey: lookup.accountKey,
            writableIndexes: lookup.writableIndexes ? new Uint8Array(lookup.writableIndexes) : new Uint8Array(),
            readonlyIndexes: lookup.readonlyIndexes ? new Uint8Array(lookup.readonlyIndexes) : new Uint8Array(),
        })),
    };
    const transactionMessageBytes = (0, smartAccountTransactionMessage_1.getSmartAccountTransactionMessageEncoder)().encode(smartAccountMessage);
    console.log('✅ Smart account transaction message encoded:', {
        messageSize: transactionMessageBytes.length,
        numSigners: smartAccountMessage.numSigners,
        numAccounts: smartAccountMessage.accountKeys.length,
        numInstructions: smartAccountMessage.instructions.length
    });
    // 5. Create the transaction account instruction
    // IMPORTANT: The accountIndex should be 0 for the primary smart account under each settings account
    // This matches the working example and the expected u8 type in the program
    const createTransactionInstruction = (0, instructions_1.getCreateTransactionInstruction)({
        settings: smartAccountSettings,
        transaction: transactionPda,
        creator: signer,
        rentPayer: signer,
        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
        args: {
            accountIndex: 0, // Use 0 for the primary smart account (matches working example)
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
        rentPayer: signer,
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
    // 8. Create the execute transaction instruction
    const executeTransactionInstruction = (0, instructions_1.getExecuteTransactionInstruction)({
        settings: smartAccountSettings,
        proposal: proposalPda,
        transaction: transactionPda,
        signer: signer,
    });
    // Add the required accounts for the inner instructions to the execute instruction
    // This is critical - the execute instruction needs to know about ALL accounts used in the inner transaction
    // The validation in executable_transaction_message.rs expects accounts in this order:
    // 1. First: all message_account_infos (static accounts + loaded ALT accounts)
    // 2. Second: address_lookup_table_account_infos (the ALT accounts themselves)
    console.log('🔧 Adding transaction accounts to ExecuteTransaction instruction...');
    // First, add all static accounts
    for (const accountKey of decodedMessage.staticAccounts) {
        executeTransactionInstruction.accounts.push({
            address: accountKey,
            role: 1, // AccountRole.WRITABLE - simplified for now, would need proper role detection
        });
    }
    // For ALT transactions, we would also need to add the loaded accounts from ALTs
    // This is a simplified version - in a full implementation, you'd need to fetch
    // the ALT contents and add the loaded accounts here
    // Finally, add the Address Lookup Table accounts themselves
    // These are the accounts that must be owned by the Address Lookup Table program
    for (const lookup of addressTableLookups) {
        executeTransactionInstruction.accounts.push({
            address: lookup.accountKey,
            role: 0, // AccountRole.READONLY - ALT accounts are typically readonly
        });
    }
    console.log('✅ Added accounts to ExecuteTransaction:', {
        staticAccounts: decodedMessage.staticAccounts.length,
        altAccounts: addressTableLookups.length,
        totalAccounts: executeTransactionInstruction.accounts.length
    });
    // 9. Combine all instructions into a single transaction
    const allInstructions = [
        createTransactionInstruction,
        createProposalInstruction,
        approveProposalInstruction,
        executeTransactionInstruction,
    ];
    // 10. Build the final transaction message
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const finalTransactionMessage = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), (tx) => (0, kit_1.setTransactionMessageFeePayerSigner)(signer, tx), (tx) => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx), (tx) => (0, kit_1.appendTransactionMessageInstructions)(allInstructions, tx));
    // 11. Compile the transaction to get the buffer
    const compiledTransaction = (0, kit_1.compileTransaction)(finalTransactionMessage);
    return {
        transactionBuffer: new Uint8Array(compiledTransaction.messageBytes),
        transactionPda,
        proposalPda,
        transactionIndex,
    };
}
exports.createProposeVoteExecuteTransaction = createProposeVoteExecuteTransaction;
