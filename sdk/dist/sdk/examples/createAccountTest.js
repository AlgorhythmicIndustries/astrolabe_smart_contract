"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const kit_1 = require("@solana/kit");
const fs_1 = __importDefault(require("fs"));
const instructions_1 = require("../../clients/js/src/generated/instructions");
const programConfig_1 = require("../../clients/js/src/generated/accounts/programConfig");
const programs_1 = require("../../clients/js/src/generated/programs");
const buffer_1 = require("buffer");
const compute_budget_1 = require("@solana-program/compute-budget");
const bs58_1 = __importDefault(require("bs58"));
async function main() {
    // Set up connection
    const rpc = (0, kit_1.createSolanaRpc)('http://localhost:8899');
    const rpcSubscriptions = (0, kit_1.createSolanaRpcSubscriptions)('ws://localhost:8900');
    // Use a consistent creator and fee payer
    const creatorKeypairFile = fs_1.default.readFileSync('/home/user/.config/solana/id.json');
    const creatorKeypairBytes = new Uint8Array(JSON.parse(creatorKeypairFile.toString()));
    const creatorKeypair = await (0, kit_1.createKeyPairFromBytes)(creatorKeypairBytes);
    const creatorSigner = await (0, kit_1.createSignerFromKeyPair)(creatorKeypair);
    // Airdrop to the creator/fee payer
    const airdrop = (0, kit_1.airdropFactory)({ rpc: rpc, rpcSubscriptions: rpcSubscriptions });
    await airdrop({
        commitment: 'confirmed',
        recipientAddress: creatorSigner.address,
        lamports: (0, kit_1.lamports)(10000000n)
    });
    // Fetch program config PDA and treasury from on-chain (assume already initialized)
    const [programConfigPda] = await (0, kit_1.getProgramDerivedAddress)({
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            new Uint8Array(buffer_1.Buffer.from('program_config')),
        ],
    });
    const programConfig = await (0, programConfig_1.fetchProgramConfig)(rpc, (0, kit_1.address)(programConfigPda));
    const treasury = programConfig.data.treasury;
    const restrictedSignerKeypairFile = fs_1.default.readFileSync('/home/user/.config/solana/restricted_signer.json');
    const restrictedSignerKeypairBytes = new Uint8Array(JSON.parse(restrictedSignerKeypairFile.toString()));
    const restrictedSignerKeypair = await (0, kit_1.createKeyPairFromBytes)(restrictedSignerKeypairBytes);
    const restrictedSignerSigner = await (0, kit_1.createSignerFromKeyPair)(restrictedSignerKeypair);
    // 1. Fetch the current index and compute the seed
    const currentIndex = Number(programConfig.data.smartAccountIndex);
    const nextIndex = currentIndex + 1;
    const settingsSeedLE = new Uint8Array(16); // u128 is 16 bytes
    const view = new DataView(settingsSeedLE.buffer);
    view.setBigUint64(0, BigInt(nextIndex), true); // low 64 bits
    view.setBigUint64(8, 0n, true); // high 64 bits
    // 2. Derive the settings PDA
    const [smartAccountSettingsPda] = await (0, kit_1.getProgramDerivedAddress)({
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            new Uint8Array(buffer_1.Buffer.from('settings')),
            settingsSeedLE,
        ],
    });
    console.log('smartAccountSettingsPda:', smartAccountSettingsPda);
    const brandedSettingsPda = (0, kit_1.address)(smartAccountSettingsPda);
    // 3. Derive the smart account's own treasury/wallet PDA
    const [smartAccountWalletPda] = await (0, kit_1.getProgramDerivedAddress)({
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            bs58_1.default.decode(brandedSettingsPda),
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]), // account_index as u64 LE
        ],
    });
    console.log('Smart Account Wallet PDA:', smartAccountWalletPda);
    // 4. Build the create smart account instruction
    const createSmartAccountInstruction = await (0, instructions_1.getCreateSmartAccountInstructionAsync)({
        programConfig: (0, kit_1.address)(programConfigPda),
        settings: brandedSettingsPda,
        treasury: (0, kit_1.address)(treasury),
        creator: creatorSigner,
        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
        program: (0, kit_1.address)(programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS),
        settingsAuthority: null,
        threshold: 1,
        signers: [{ key: creatorSigner.address, permissions: { mask: 7 } }],
        restrictedSigners: [{ key: restrictedSignerSigner.address, restrictedPermissions: { mask: 1 } }],
        timeLock: 0,
        rentCollector: null,
        memo: null,
    });
    // 5. Build the transaction message without compute budget instructions
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const baseTransactionMessage = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), (tx) => (0, kit_1.setTransactionMessageFeePayerSigner)(creatorSigner, tx), (tx) => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx), (tx) => (0, kit_1.appendTransactionMessageInstructions)([createSmartAccountInstruction], tx));
    // 6. Estimate compute units
    const getComputeUnitEstimate = (0, kit_1.getComputeUnitEstimateForTransactionMessageFactory)({ rpc });
    const estimatedComputeUnits = await getComputeUnitEstimate(baseTransactionMessage);
    const computeUnitLimit = Math.floor(estimatedComputeUnits * 1.2); // Add 20% buffer
    console.log(`Estimated compute units: ${estimatedComputeUnits}, setting limit to ${computeUnitLimit}`);
    // 7. Build the final transaction with compute budget instructions
    const finalTransactionMessage = (0, kit_1.prependTransactionMessageInstructions)([
        (0, compute_budget_1.getSetComputeUnitPriceInstruction)({ microLamports: 10000n }),
        (0, compute_budget_1.getSetComputeUnitLimitInstruction)({ units: computeUnitLimit }),
    ], baseTransactionMessage);
    const signedCreateTransaction = await (0, kit_1.signTransactionMessageWithSigners)(finalTransactionMessage);
    const signature = (0, kit_1.getSignatureFromTransaction)(signedCreateTransaction);
    console.log('--- Inspecting Signatures ---');
    console.log('Fee Payer / Creator (and signer):', creatorSigner.address);
    console.log('Transaction Signature:', signature);
    console.log('--- End Inspecting Signatures ---');
    const sendAndConfirm = (0, kit_1.sendAndConfirmTransactionFactory)({ rpc, rpcSubscriptions });
    await sendAndConfirm(signedCreateTransaction, { commitment: 'confirmed' });
    console.log('Smart account created!');
}
main().catch(console.error);
