"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveSmartAccountInfo = deriveSmartAccountInfo;
exports.createProposeVoteExecuteTransaction = createProposeVoteExecuteTransaction;
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
    console.log('📋 Input params:', {
        smartAccountSettings: params.smartAccountSettings.toString(),
        smartAccountPda: params.smartAccountPda.toString(),
        smartAccountPdaBump: params.smartAccountPdaBump,
        signerAddress: params.signer.address.toString(),
        innerInstructionCount: params.innerInstructions.length,
        memo: params.memo
    });
    const { rpc, smartAccountSettings, smartAccountPda, smartAccountPdaBump, signer, innerInstructions, memo = 'Smart Account Transaction', } = params;
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
    // 4. Build and ENCODE the inner transaction message
    const { value: latestBlockhashForInner } = await rpc.getLatestBlockhash().send();
    console.log('✅ Latest blockhash fetched for inner transaction:', latestBlockhashForInner.blockhash);
    const innerTransactionMessage = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), (tx) => (0, kit_1.setTransactionMessageFeePayerSigner)((0, kit_1.createNoopSigner)(smartAccountPda), tx), (tx) => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhashForInner, tx), (tx) => (0, kit_1.appendTransactionMessageInstructions)(innerInstructions, tx));
    console.log('🔧 Compiling inner transaction message...');
    const compiledInnerMessage = (0, kit_1.compileTransaction)(innerTransactionMessage);
    const decodedMessage = (0, kit_1.getCompiledTransactionMessageDecoder)().decode(compiledInnerMessage.messageBytes);
    console.log('✅ Inner transaction compiled:', {
        staticAccounts: decodedMessage.staticAccounts.length,
        instructions: decodedMessage.instructions.length,
        messageSize: compiledInnerMessage.messageBytes.length
    });
    console.log('🔧 Creating smart account transaction message...');
    // Manually construct the smart account transaction message
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
        addressTableLookups: [],
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
    // The validation in executable_transaction_message.rs requires exactly message.num_all_account_keys() accounts
    for (const accountKey of decodedMessage.staticAccounts) {
        executeTransactionInstruction.accounts.push({
            address: accountKey,
            role: 1, // AccountRole.WRITABLE - simplified for now, would need proper role detection
        });
    }
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
