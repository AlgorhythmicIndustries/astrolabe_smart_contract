"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const kit_1 = require("@solana/kit");
const system_1 = require("@solana-program/system");
const fs_1 = __importDefault(require("fs"));
const programs_1 = require("../../clients/js/src/generated/programs");
const buffer_1 = require("buffer");
const accounts_1 = require("../../clients/js/src/generated/accounts");
const bs58_1 = __importDefault(require("bs58"));
const instructions_1 = require("../../clients/js/src/generated/instructions");
const kit_2 = require("@solana/kit");
const assert_1 = __importDefault(require("assert"));
const smartAccountTransactionMessage_1 = require("../../clients/js/src/generated/types/smartAccountTransactionMessage");
const instructions_2 = require("../../clients/js/src/generated/instructions");
async function main() {
    // Set up connection
    const rpc = (0, kit_1.createSolanaRpc)('http://localhost:8899');
    const rpcSubscriptions = (0, kit_1.createSolanaRpcSubscriptions)('ws://localhost:8900');
    // Use a consistent creator and fee payer
    const feePayerKeypairFile = fs_1.default.readFileSync('/home/user/.config/solana/id.json');
    const feePayerKeypairBytes = new Uint8Array(JSON.parse(feePayerKeypairFile.toString()));
    const feePayerKeypair = await (0, kit_1.createKeyPairFromBytes)(feePayerKeypairBytes);
    const feePayer = await (0, kit_1.createSignerFromKeyPair)(feePayerKeypair);
    // The PDA for the smart account that was created in the previous script.
    const smartAccountSettings = (0, kit_1.address)('C9yDdexk1gtLRZL4qAWmZPvG9pZMzL3tKRnkQU76SJWL');
    // This is the PDA that will SIGN the inner transaction. It must also hold the funds.
    const [smartAccountPda, smartAccountPdaBump] = await (0, kit_1.getProgramDerivedAddress)({
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            bs58_1.default.decode(smartAccountSettings),
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            new Uint8Array([0]), // account_index
        ]
    });
    const airdropAmount = (0, kit_1.lamports)(2000000000n); // 2 SOL
    console.log(`Airdropping ${airdropAmount} lamports to smart account signer: ${smartAccountPda}`);
    // Airdrop funds to the smart account wallet
    const airdropIx = (0, system_1.getTransferSolInstruction)({
        source: feePayer,
        destination: smartAccountPda,
        amount: airdropAmount,
    });
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const transactionMessage = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), (tx) => (0, kit_1.setTransactionMessageFeePayerSigner)(feePayer, tx), (tx) => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx), (tx) => (0, kit_1.appendTransactionMessageInstructions)([airdropIx], tx));
    const signedAirdropTransaction = await (0, kit_1.signTransactionMessageWithSigners)(transactionMessage);
    const sendAndConfirm = (0, kit_1.sendAndConfirmTransactionFactory)({ rpc, rpcSubscriptions });
    await sendAndConfirm(signedAirdropTransaction, { commitment: 'confirmed' });
    console.log(`Airdrop successful. Signature: ${(0, kit_1.getSignatureFromTransaction)(signedAirdropTransaction)}`);
    // --- Create Proposal ---
    console.log('\n--- Creating transaction proposal ---');
    // 1. Fetch the latest on-chain state for the Settings account
    const settings = await (0, accounts_1.fetchSettings)(rpc, smartAccountSettings);
    const transactionIndex = settings.data.transactionIndex + 1n;
    console.log(`Current transaction index: ${settings.data.transactionIndex}, new index: ${transactionIndex}`);
    // 2. Derive the PDA for the new Transaction account
    const [transactionPda] = await (0, kit_1.getProgramDerivedAddress)({
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            bs58_1.default.decode(smartAccountSettings),
            new Uint8Array(buffer_1.Buffer.from('transaction')),
            new Uint8Array(new BigUint64Array([transactionIndex]).buffer),
        ]
    });
    console.log(`Transaction PDA: ${transactionPda}`);
    // 3. Create the instruction that the multisig will execute (1 SOL transfer)
    const transferIx = (0, system_1.getTransferSolInstruction)({
        source: (0, kit_1.createNoopSigner)(smartAccountPda),
        destination: feePayer.address,
        amount: (0, kit_1.lamports)(1000000000n), // 1 SOL
    });
    // 4. Build and ENCODE the inner transaction message
    const { value: latestBlockhashForTransfer } = await rpc.getLatestBlockhash().send();
    const transferMessage = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), tx => (0, kit_1.setTransactionMessageFeePayerSigner)((0, kit_1.createNoopSigner)(smartAccountPda), tx), tx => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhashForTransfer, tx), tx => (0, kit_1.appendTransactionMessageInstructions)([transferIx], tx));
    const compiledTransferMessage = (0, kit_1.compileTransaction)(transferMessage);
    const decodedMessage = (0, kit_1.getCompiledTransactionMessageDecoder)().decode(compiledTransferMessage.messageBytes);
    // Manually construct the argument for the encoder. This is what the program expects.
    const smartAccountMessage = {
        numSigners: 1,
        numWritableSigners: 1,
        numWritableNonSigners: 1,
        accountKeys: decodedMessage.staticAccounts,
        instructions: decodedMessage.instructions.map(ix => ({
            programIdIndex: ix.programAddressIndex,
            accountIndexes: new Uint8Array(ix.accountIndices ?? []),
            data: ix.data ?? new Uint8Array(),
        })),
        addressTableLookups: [],
    };
    const transactionMessageBytes = (0, smartAccountTransactionMessage_1.getSmartAccountTransactionMessageEncoder)().encode(smartAccountMessage);
    // 5. Build the instruction to create the transaction account
    const createTransactionInstruction = (0, instructions_2.getCreateTransactionInstruction)({
        settings: smartAccountSettings,
        transaction: transactionPda,
        creator: feePayer,
        rentPayer: feePayer,
        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
        args: {
            accountIndex: 0,
            accountBump: smartAccountPdaBump,
            ephemeralSigners: 0,
            transactionMessage: transactionMessageBytes,
            memo: 'Transfer 1 SOL to creator',
        }
    });
    // 6. Build, sign, and send the transaction to create the on-chain transaction data
    console.log('Sending create transaction instruction...');
    const { value: latestBlockhashForCreateTx } = await rpc.getLatestBlockhash().send();
    const createTransactionTx = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), tx => (0, kit_1.setTransactionMessageFeePayerSigner)(feePayer, tx), tx => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhashForCreateTx, tx), tx => (0, kit_1.appendTransactionMessageInstructions)([createTransactionInstruction], tx));
    const signedCreateTransactionTx = await (0, kit_1.signTransactionMessageWithSigners)(createTransactionTx);
    await sendAndConfirm(signedCreateTransactionTx, { commitment: 'confirmed' });
    console.log(`Transaction account created. Signature: ${(0, kit_1.getSignatureFromTransaction)(signedCreateTransactionTx)}`);
    // --- Create Proposal ---
    console.log('\n--- Creating proposal account ---');
    // 7. Derive the PDA for the Proposal account
    const [proposalPda] = await (0, kit_1.getProgramDerivedAddress)({
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            bs58_1.default.decode(smartAccountSettings),
            new Uint8Array(buffer_1.Buffer.from('transaction')),
            new Uint8Array(new BigUint64Array([transactionIndex]).buffer),
            new Uint8Array(buffer_1.Buffer.from('proposal')),
        ]
    });
    console.log(`Proposal PDA: ${proposalPda}`);
    // 8. Create the instruction to create the proposal account
    const createProposalInstruction = (0, instructions_1.getCreateProposalInstruction)({
        settings: smartAccountSettings,
        proposal: proposalPda,
        creator: feePayer,
        rentPayer: feePayer,
        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
        transactionIndex: transactionIndex,
        draft: false,
    });
    // 9. Build, sign, and send the proposal creation transaction
    const { value: latestBlockhashForProposal } = await rpc.getLatestBlockhash().send();
    const createProposalTx = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), tx => (0, kit_1.setTransactionMessageFeePayerSigner)(feePayer, tx), tx => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhashForProposal, tx), tx => (0, kit_1.appendTransactionMessageInstructions)([createProposalInstruction], tx));
    const signedCreateProposalTx = await (0, kit_1.signTransactionMessageWithSigners)(createProposalTx);
    console.log('Sending proposal creation transaction...');
    await sendAndConfirm(signedCreateProposalTx, { commitment: 'confirmed' });
    const proposalSignature = (0, kit_1.getSignatureFromTransaction)(signedCreateProposalTx);
    console.log('Proposal created successfully! Signature:', proposalSignature);
    // --- Approve Proposal ---
    console.log('\n--- Approving proposal ---');
    // 10. Create the instruction to approve the proposal
    const approveProposalInstruction = (0, instructions_1.getApproveProposalInstruction)({
        settings: smartAccountSettings,
        signer: feePayer,
        proposal: proposalPda,
        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
        args: { memo: null },
    });
    // 11. Build, sign, and send the approval transaction
    const { value: latestBlockhashForApproval } = await rpc.getLatestBlockhash().send();
    const approveProposalTx = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), tx => (0, kit_1.setTransactionMessageFeePayerSigner)(feePayer, tx), tx => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhashForApproval, tx), tx => (0, kit_1.appendTransactionMessageInstructions)([approveProposalInstruction], tx));
    const signedApproveProposalTx = await (0, kit_1.signTransactionMessageWithSigners)(approveProposalTx);
    console.log('Sending approval transaction...');
    await sendAndConfirm(signedApproveProposalTx, { commitment: 'confirmed' });
    const approvalSignature = (0, kit_1.getSignatureFromTransaction)(signedApproveProposalTx);
    console.log('Proposal approved successfully! Signature:', approvalSignature);
    // --- Execute Transaction ---
    console.log('\n--- Executing transaction ---');
    const initialBalance = await rpc.getBalance(feePayer.address).send();
    console.log(`Fee payer balance before execution: ${initialBalance.value} lamports`);
    // 12. Create the instruction to execute the transaction
    const executeTransactionInstruction = (0, instructions_1.getExecuteTransactionInstruction)({
        settings: smartAccountSettings,
        proposal: proposalPda,
        transaction: transactionPda,
        signer: feePayer,
    });
    // Manually add the accounts for the inner instruction.
    executeTransactionInstruction.accounts.push({ address: smartAccountPda, role: kit_2.AccountRole.WRITABLE }, { address: feePayer.address, role: kit_2.AccountRole.WRITABLE }, { address: (0, kit_1.address)('11111111111111111111111111111111'), role: kit_2.AccountRole.READONLY });
    // 13. Build, sign, and send the execution transaction
    const { value: latestBlockhashForExecution } = await rpc.getLatestBlockhash().send();
    const executeTransactionTx = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), tx => (0, kit_1.setTransactionMessageFeePayerSigner)(feePayer, tx), tx => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhashForExecution, tx), tx => (0, kit_1.appendTransactionMessageInstructions)([executeTransactionInstruction], tx));
    const signedExecuteTransactionTx = await (0, kit_1.signTransactionMessageWithSigners)(executeTransactionTx);
    console.log('Sending execution transaction...');
    await sendAndConfirm(signedExecuteTransactionTx, { commitment: 'confirmed' });
    const executionSignature = (0, kit_1.getSignatureFromTransaction)(signedExecuteTransactionTx);
    console.log('Transaction executed successfully! Signature:', executionSignature);
    // 14. Verify the transfer
    const finalBalance = await rpc.getBalance(feePayer.address).send();
    console.log(`Fee payer balance after execution: ${finalBalance.value} lamports`);
    (0, assert_1.default)(finalBalance.value > initialBalance.value, 'Final balance should be greater than initial balance');
    console.log('\n✅ End-to-end test successful!');
}
main().catch(console.error);
