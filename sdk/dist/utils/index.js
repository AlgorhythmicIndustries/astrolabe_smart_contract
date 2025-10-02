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
exports.deriveTransactionPda = deriveTransactionPda;
exports.deriveProposalPda = deriveProposalPda;
exports.deriveBufferPda = deriveBufferPda;
exports.fetchSmartAccountSettings = fetchSmartAccountSettings;
exports.decodeTransactionMessage = decodeTransactionMessage;
exports.getTransactionMessageEncoder = getTransactionMessageEncoder;
exports.getCompiledInstructionEncoder = getCompiledInstructionEncoder;
exports.getMessageAddressTableLookupEncoder = getMessageAddressTableLookupEncoder;
exports.deriveSmartAccountInfo = deriveSmartAccountInfo;
const kit_1 = require("@solana/kit");
const buffer_1 = require("buffer");
const bs58 = __importStar(require("bs58"));
const settings_1 = require("../clients/js/src/generated/accounts/settings");
const programs_1 = require("../clients/js/src/generated/programs");
/**
 * Derives a transaction PDA from settings address and transaction index
 */
async function deriveTransactionPda(settingsAddress, transactionIndex) {
    const [transactionPda] = await (0, kit_1.getProgramDerivedAddress)({
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            bs58.decode(settingsAddress),
            new Uint8Array(buffer_1.Buffer.from('transaction')),
            new Uint8Array(new BigUint64Array([transactionIndex]).buffer),
        ],
    });
    return transactionPda;
}
/**
 * Derives a proposal PDA from settings address and transaction index
 */
async function deriveProposalPda(settingsAddress, transactionIndex) {
    console.log('🔧 deriveProposalPda debug:', {
        settingsAddress: settingsAddress.toString(),
        transactionIndex: transactionIndex.toString(),
    });
    const [proposalPda] = await (0, kit_1.getProgramDerivedAddress)({
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
            new Uint8Array(buffer_1.Buffer.from('smart_account')), // SEED_PREFIX
            bs58.decode(settingsAddress), // settings.key().as_ref() - settings ADDRESS
            new Uint8Array(buffer_1.Buffer.from('transaction')), // SEED_TRANSACTION
            new Uint8Array(new BigUint64Array([transactionIndex]).buffer), // transaction_index
            new Uint8Array(buffer_1.Buffer.from('proposal')), // SEED_PROPOSAL
        ],
    });
    console.log('🔧 deriveProposalPda result:', proposalPda.toString());
    return proposalPda;
}
/**
 Derives the transaction buffer PDA for a given settings address, creator, and buffer index
*/
async function deriveBufferPda(settingsAddress, creatorAddress, bufferIndex) {
    const [bufferPda] = await (0, kit_1.getProgramDerivedAddress)({
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            bs58.decode(settingsAddress),
            new Uint8Array(buffer_1.Buffer.from('transaction_buffer')),
            bs58.decode(creatorAddress),
            new Uint8Array([bufferIndex & 0xff]),
        ],
    });
    return bufferPda;
}
/**
 * Fetches smart account settings and returns current and next transaction indices
 */
async function fetchSmartAccountSettings(rpc, settingsAddress) {
    const settings = await (0, settings_1.fetchSettings)(rpc, settingsAddress);
    return {
        currentTransactionIndex: settings.data.transactionIndex,
        nextTransactionIndex: settings.data.transactionIndex + BigInt(1),
        threshold: settings.data.threshold
    };
}
/**
 * Decodes a compiled transaction message to extract accounts and instructions
 */
function decodeTransactionMessage(messageBytes) {
    return (0, kit_1.getCompiledTransactionMessageDecoder)().decode(messageBytes);
}
// Manual encoder for TransactionMessage struct from transaction_create.rs
// This matches the Rust struct exactly:
// pub struct TransactionMessage {
//     pub num_signers: u8,
//     pub num_writable_signers: u8,
//     pub num_writable_non_signers: u8,
//     pub account_keys: Vec<Pubkey>,
//     pub instructions: Vec<CompiledInstruction>,
//     pub address_table_lookups: Vec<MessageAddressTableLookup>,
// }
function getTransactionMessageEncoder() {
    return (0, kit_1.getStructEncoder)([
        ['numSigners', (0, kit_1.getU8Encoder)()],
        ['numWritableSigners', (0, kit_1.getU8Encoder)()],
        ['numWritableNonSigners', (0, kit_1.getU8Encoder)()],
        ['accountKeys', (0, kit_1.getArrayEncoder)((0, kit_1.getAddressEncoder)())],
        ['instructions', (0, kit_1.getArrayEncoder)(getCompiledInstructionEncoder())],
        ['addressTableLookups', (0, kit_1.getArrayEncoder)(getMessageAddressTableLookupEncoder())],
    ]);
}
// Encoder for CompiledInstruction
function getCompiledInstructionEncoder() {
    return (0, kit_1.getStructEncoder)([
        ['programIdIndex', (0, kit_1.getU8Encoder)()],
        ['accountIndexes', (0, kit_1.addEncoderSizePrefix)((0, kit_1.getBytesEncoder)(), (0, kit_1.getU32Encoder)())],
        ['data', (0, kit_1.addEncoderSizePrefix)((0, kit_1.getBytesEncoder)(), (0, kit_1.getU32Encoder)())],
    ]);
}
// Encoder for MessageAddressTableLookup
function getMessageAddressTableLookupEncoder() {
    return (0, kit_1.getStructEncoder)([
        ['accountKey', (0, kit_1.getAddressEncoder)()],
        ['writableIndexes', (0, kit_1.addEncoderSizePrefix)((0, kit_1.getBytesEncoder)(), (0, kit_1.getU32Encoder)())],
        ['readonlyIndexes', (0, kit_1.addEncoderSizePrefix)((0, kit_1.getBytesEncoder)(), (0, kit_1.getU32Encoder)())],
    ]);
}
/**
 * Derives smart account PDA and related info from a settings address
 */
async function deriveSmartAccountInfo(settingsAddress, accountIndex) {
    // Always use account_index = 0 for the primary smart account
    console.log('🔧 Using account index 0 for primary smart account (ignoring any provided accountIndex)');
    console.log('🔧 Deriving smart account PDA with:', {
        settingsAddress: settingsAddress.toString(),
        accountIndex: '0',
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS.toString()
    });
    const [smartAccountPda, smartAccountPdaBump] = await (0, kit_1.getProgramDerivedAddress)({
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            bs58.decode(settingsAddress),
            new Uint8Array(buffer_1.Buffer.from('smart_account')),
            // Use account_index 0 for the primary smart account
            new Uint8Array([0]),
        ],
    });
    console.log('✅ Derived smart account PDA:', {
        smartAccountPda: smartAccountPda.toString(),
        smartAccountPdaBump,
        settingsAddress: settingsAddress.toString(),
        accountIndex: 0
    });
    return {
        smartAccountPda,
        settingsAddress,
        accountIndex: BigInt(0),
        smartAccountPdaBump,
    };
}
