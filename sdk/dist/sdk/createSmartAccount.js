"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSmartAccountTransaction = createSmartAccountTransaction;
const kit_1 = require("@solana/kit");
const compute_budget_1 = require("@solana-program/compute-budget");
const buffer_1 = require("buffer");
const programConfig_1 = require("../clients/js/src/generated/accounts/programConfig");
const instructions_1 = require("../clients/js/src/generated/instructions");
const programs_1 = require("../clients/js/src/generated/programs");
/**
 * Creates an unsigned, compiled transaction buffer to deploy a new smart account.
 * This function fetches the necessary on-chain data, derives the required PDAs,
 * and constructs the transaction. The resulting buffer is intended to be sent to a backend
 * where it will be signed by the `creator` account and submitted to the network.
 *
 * @param params - The parameters for creating the smart account.
 * @returns A promise that resolves to the transaction buffer and the new settings account address.
 */
async function createSmartAccountTransaction(params) {
    const { rpc, creator, threshold, signers, restrictedSigners = [], settingsAuthority = null, timeLock = 0, rentCollector = null, memo = null, computeUnitPrice = 10000n, } = params;
    // 1. Fetch program config PDA and treasury from on-chain, as seen in createAccountTest.ts
    const [programConfigPda] = await (0, kit_1.getProgramDerivedAddress)({
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            new Uint8Array(buffer_1.Buffer.from('program_config')),
        ],
    });
    const programConfig = await (0, programConfig_1.fetchProgramConfig)(rpc, programConfigPda);
    const { treasury, smartAccountIndex } = programConfig.data;
    // 2. Compute the seed for the new settings account using the current index.
    const settingsSeed = new Uint8Array(16); // u128 is 16 bytes
    const view = new DataView(settingsSeed.buffer);
    view.setBigUint64(0, smartAccountIndex, true); // low 64 bits
    view.setBigUint64(8, 0n, true); // high 64 bits
    // 3. Derive the settings PDA
    const [settingsAddress] = await (0, kit_1.getProgramDerivedAddress)({
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            new Uint8Array(buffer_1.Buffer.from('settings')),
            settingsSeed,
        ],
    });
    // 4. Build the create smart account instruction.
    // The creator is represented as a NoopSigner because the transaction
    // will be signed later by a backend.
    const createSmartAccountInstruction = await (0, instructions_1.getCreateSmartAccountInstructionAsync)({
        programConfig: programConfigPda,
        settings: settingsAddress,
        treasury,
        creator: (0, kit_1.createNoopSigner)(creator),
        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
        program: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        settingsAuthority,
        threshold,
        signers,
        restrictedSigners,
        timeLock,
        rentCollector,
        memo,
    });
    // 5. Build the base transaction message. The fee payer is the creator,
    // also represented as a NoopSigner.
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const baseTransactionMessage = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), (tx) => (0, kit_1.setTransactionMessageFeePayerSigner)((0, kit_1.createNoopSigner)(creator), tx), (tx) => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx), (tx) => (0, kit_1.appendTransactionMessageInstructions)([createSmartAccountInstruction], tx));
    // 6. Estimate compute units and build the final transaction message
    const getComputeUnitEstimate = (0, kit_1.getComputeUnitEstimateForTransactionMessageFactory)({ rpc });
    const estimatedComputeUnits = await getComputeUnitEstimate(baseTransactionMessage);
    const computeUnitLimit = Math.floor(Number(estimatedComputeUnits) * 1.2);
    const transactionMessage = (0, kit_1.prependTransactionMessageInstructions)([
        (0, compute_budget_1.getSetComputeUnitPriceInstruction)({ microLamports: computeUnitPrice }),
        (0, compute_budget_1.getSetComputeUnitLimitInstruction)({ units: computeUnitLimit }),
    ], baseTransactionMessage);
    // 7. Compile the transaction to get the buffer to be sent to the backend
    const compiledTransaction = (0, kit_1.compileTransaction)(transactionMessage);
    return {
        transactionBuffer: new Uint8Array(compiledTransaction.messageBytes),
        settingsAddress: (0, kit_1.address)(settingsAddress),
    };
}
