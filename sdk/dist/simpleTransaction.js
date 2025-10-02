"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSimpleTransaction = createSimpleTransaction;
const kit_1 = require("@solana/kit");
const instructions_1 = require("./clients/js/src/generated/instructions");
const smartAccountTransactionMessage_1 = require("./clients/js/src/generated/types/smartAccountTransactionMessage");
const index_1 = require("./utils/index");
/**
 * High-level function that combines the smart account propose-vote-execute pattern
 * into a single serialized transaction. This creates a transaction, proposal, approves it,
 * and executes it all in one atomic operation.
 *
 * @param params - The parameters for the workflow
 * @returns Promise resolving to transaction buffer and metadata
 */
async function createSimpleTransaction(params) {
    console.log('🚀 Starting createSimpleTransaction...');
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
    const feePayer = params.feePayer;
    const innerInstructions = params.innerInstructions;
    const innerTransactionBytes = params.innerTransactionBytes;
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
    const settingsData = await (0, index_1.fetchSmartAccountSettings)(rpc, smartAccountSettings);
    const transactionIndex = settingsData.nextTransactionIndex;
    console.log('✅ Settings fetched:', {
        currentTransactionIndex: settingsData.currentTransactionIndex.toString(),
        nextTransactionIndex: transactionIndex.toString(),
        threshold: settingsData.threshold
    });
    console.log('🔧 Step 2: Deriving transaction PDA...');
    // 2. Derive the PDA for the new Transaction account
    const transactionPda = await (0, index_1.deriveTransactionPda)(smartAccountSettings, transactionIndex);
    console.log('✅ Transaction PDA derived:', transactionPda.toString());
    console.log('🔧 Step 3: Deriving proposal PDA...');
    // 3. Derive the PDA for the new Proposal account
    const proposalPda = await (0, index_1.deriveProposalPda)(smartAccountSettings, transactionIndex);
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
        const innerTransactionMessage = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), (tx) => (0, kit_1.setTransactionMessageFeePayerSigner)((0, kit_1.createNoopSigner)(smartAccountPda), tx), // Inner transaction uses smart account PDA
        (tx) => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhashForInner, tx), (tx) => (0, kit_1.appendTransactionMessageInstructions)(innerInstructions || [], tx));
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
    // Manually construct the smart account transaction message
    const smartAccountMessage = {
        numSigners: 1,
        numWritableSigners: 1,
        numWritableNonSigners: decodedMessage.staticAccounts.length - 1,
        accountKeys: decodedMessage.staticAccounts,
        instructions: decodedMessage.instructions.map((ix) => ({
            programIdIndex: ix.programAddressIndex,
            accountIndexes: new Uint8Array(ix.accountIndices ?? []),
            data: ix.data ?? new Uint8Array(),
        })),
        addressTableLookups: [],
    };
    // 🔍 DETAILED DEBUG LOGGING FOR COMPARISON
    console.log('📊 DETAILED SmartAccountMessage structure:');
    console.log('  numSigners:', smartAccountMessage.numSigners);
    console.log('  numWritableSigners:', smartAccountMessage.numWritableSigners);
    console.log('  numWritableNonSigners:', smartAccountMessage.numWritableNonSigners);
    console.log('  accountKeys.length:', smartAccountMessage.accountKeys.length);
    console.log('  accountKeys:', smartAccountMessage.accountKeys.map(key => key.toString()));
    console.log('  instructions.length:', smartAccountMessage.instructions.length);
    smartAccountMessage.instructions.forEach((ix, i) => {
        console.log(`  instruction[${i}]:`, {
            programIdIndex: ix.programIdIndex,
            accountIndexes: Array.from(ix.accountIndexes),
            data: Array.from(ix.data)
        });
    });
    console.log('  addressTableLookups.length:', smartAccountMessage.addressTableLookups.length);
    const transactionMessageBytes = (0, smartAccountTransactionMessage_1.getSmartAccountTransactionMessageEncoder)().encode(smartAccountMessage);
    console.log('✅ Smart account transaction message encoded:', {
        messageSize: transactionMessageBytes.length,
        numSigners: smartAccountMessage.numSigners,
        numAccounts: smartAccountMessage.accountKeys.length,
        numInstructions: smartAccountMessage.instructions.length
    });
    // 🔍 LOG THE EXACT BYTES FOR COMPARISON
    console.log('📊 Encoded bytes (first 50):', Array.from(transactionMessageBytes.slice(0, 50)));
    console.log('📊 Encoded hex (first 100 chars):', Array.from(transactionMessageBytes.slice(0, 50)).map(b => b.toString(16).padStart(2, '0')).join(''));
    // 5. Create the transaction account instruction
    // IMPORTANT: The accountIndex should match the index used when creating the smart account
    // This matches the working example and the expected u8 type in the program
    const createTransactionInstruction = (0, instructions_1.getCreateTransactionInstruction)({
        settings: smartAccountSettings,
        transaction: transactionPda,
        creator: signer,
        rentPayer: (0, kit_1.createNoopSigner)(feePayer), // Backend pays for transaction account rent
        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
        args: {
            accountIndex: 0, // Use 0 for the primary smart account (default)
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
    // 8. Create the execute transaction instruction
    const executeTransactionInstruction = (0, instructions_1.getExecuteTransactionInstruction)({
        settings: smartAccountSettings,
        proposal: proposalPda,
        transaction: transactionPda,
        signer: signer,
    });
    // Add the required accounts for the inner instructions to the execute instruction
    // This is critical - the execute instruction needs to know about ALL accounts used in the inner transaction
    // The validation in executable_transaction_message.rs requires exactly message.num_all_account_keys() accounts
    for (const accountKey of decodedMessage.staticAccounts) {
        executeTransactionInstruction.accounts.push({
            address: accountKey,
            role: kit_1.AccountRole.WRITABLE, // Use proper AccountRole enum
        });
    }
    // 9. Create close instruction to reclaim rent back to fee payer
    const closeTransactionInstruction = (0, instructions_1.getCloseTransactionInstruction)({
        settings: smartAccountSettings,
        proposal: proposalPda,
        transaction: transactionPda,
        proposalRentCollector: feePayer, // Rent goes back to backend fee payer
        transactionRentCollector: feePayer, // Rent goes back to backend fee payer
        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
    });
    // 10. Combine all instructions into a single transaction
    const allInstructions = [
        createTransactionInstruction,
        createProposalInstruction,
        approveProposalInstruction,
        executeTransactionInstruction,
        closeTransactionInstruction, // Close accounts and reclaim rent
    ];
    // 11. Build the final transaction message
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const finalTransactionMessage = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), (tx) => (0, kit_1.setTransactionMessageFeePayerSigner)((0, kit_1.createNoopSigner)(feePayer), tx), // Use feePayer for gasless transactions
    (tx) => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx), (tx) => (0, kit_1.appendTransactionMessageInstructions)(allInstructions, tx));
    // 12. Compile the transaction to get the buffer
    const compiledTransaction = (0, kit_1.compileTransaction)(finalTransactionMessage);
    // 13. Validate transaction size
    (0, kit_1.assertIsTransactionWithinSizeLimit)(compiledTransaction);
    return {
        transactionBuffer: new Uint8Array(compiledTransaction.messageBytes),
        transactionPda,
        proposalPda,
        transactionIndex,
    };
}
