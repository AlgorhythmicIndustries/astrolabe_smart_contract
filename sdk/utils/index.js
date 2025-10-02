"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
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
var kit_1 = require("@solana/kit");
var buffer_1 = require("buffer");
var bs58 = require("bs58");
var settings_1 = require("../clients/js/src/generated/accounts/settings");
var programs_1 = require("../clients/js/src/generated/programs");
/**
 * Derives a transaction PDA from settings address and transaction index
 */
function deriveTransactionPda(settingsAddress, transactionIndex) {
    return __awaiter(this, void 0, void 0, function () {
        var transactionPda;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, kit_1.getProgramDerivedAddress)({
                        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
                        seeds: [
                            new Uint8Array(buffer_1.Buffer.from('smart_account')),
                            bs58.decode(settingsAddress),
                            new Uint8Array(buffer_1.Buffer.from('transaction')),
                            new Uint8Array(new BigUint64Array([transactionIndex]).buffer),
                        ],
                    })];
                case 1:
                    transactionPda = (_a.sent())[0];
                    return [2 /*return*/, transactionPda];
            }
        });
    });
}
/**
 * Derives a proposal PDA from settings address and transaction index
 */
function deriveProposalPda(settingsAddress, transactionIndex) {
    return __awaiter(this, void 0, void 0, function () {
        var proposalPda;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('🔧 deriveProposalPda debug:', {
                        settingsAddress: settingsAddress.toString(),
                        transactionIndex: transactionIndex.toString(),
                    });
                    return [4 /*yield*/, (0, kit_1.getProgramDerivedAddress)({
                            programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
                            seeds: [
                                new Uint8Array(buffer_1.Buffer.from('smart_account')), // SEED_PREFIX
                                bs58.decode(settingsAddress), // settings.key().as_ref() - settings ADDRESS
                                new Uint8Array(buffer_1.Buffer.from('transaction')), // SEED_TRANSACTION
                                new Uint8Array(new BigUint64Array([transactionIndex]).buffer), // transaction_index
                                new Uint8Array(buffer_1.Buffer.from('proposal')), // SEED_PROPOSAL
                            ],
                        })];
                case 1:
                    proposalPda = (_a.sent())[0];
                    console.log('🔧 deriveProposalPda result:', proposalPda.toString());
                    return [2 /*return*/, proposalPda];
            }
        });
    });
}
/**
 Derives the transaction buffer PDA for a given settings address, creator, and buffer index
*/
function deriveBufferPda(settingsAddress, creatorAddress, bufferIndex) {
    return __awaiter(this, void 0, void 0, function () {
        var bufferPda;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, kit_1.getProgramDerivedAddress)({
                        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
                        seeds: [
                            new Uint8Array(buffer_1.Buffer.from('smart_account')),
                            bs58.decode(settingsAddress),
                            new Uint8Array(buffer_1.Buffer.from('transaction_buffer')),
                            bs58.decode(creatorAddress),
                            new Uint8Array([bufferIndex & 0xff]),
                        ],
                    })];
                case 1:
                    bufferPda = (_a.sent())[0];
                    return [2 /*return*/, bufferPda];
            }
        });
    });
}
/**
 * Fetches smart account settings and returns current and next transaction indices
 */
function fetchSmartAccountSettings(rpc, settingsAddress) {
    return __awaiter(this, void 0, void 0, function () {
        var settings;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, settings_1.fetchSettings)(rpc, settingsAddress)];
                case 1:
                    settings = _a.sent();
                    return [2 /*return*/, {
                            currentTransactionIndex: settings.data.transactionIndex,
                            nextTransactionIndex: settings.data.transactionIndex + BigInt(1),
                            threshold: settings.data.threshold
                        }];
            }
        });
    });
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
function deriveSmartAccountInfo(settingsAddress, accountIndex) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, smartAccountPda, smartAccountPdaBump;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    // Always use account_index = 0 for the primary smart account
                    console.log('🔧 Using account index 0 for primary smart account (ignoring any provided accountIndex)');
                    console.log('🔧 Deriving smart account PDA with:', {
                        settingsAddress: settingsAddress.toString(),
                        accountIndex: '0',
                        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS.toString()
                    });
                    return [4 /*yield*/, (0, kit_1.getProgramDerivedAddress)({
                            programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
                            seeds: [
                                new Uint8Array(buffer_1.Buffer.from('smart_account')),
                                bs58.decode(settingsAddress),
                                new Uint8Array(buffer_1.Buffer.from('smart_account')),
                                // Use account_index 0 for the primary smart account
                                new Uint8Array([0]),
                            ],
                        })];
                case 1:
                    _a = _b.sent(), smartAccountPda = _a[0], smartAccountPdaBump = _a[1];
                    console.log('✅ Derived smart account PDA:', {
                        smartAccountPda: smartAccountPda.toString(),
                        smartAccountPdaBump: smartAccountPdaBump,
                        settingsAddress: settingsAddress.toString(),
                        accountIndex: 0
                    });
                    return [2 /*return*/, {
                            smartAccountPda: smartAccountPda,
                            settingsAddress: settingsAddress,
                            accountIndex: BigInt(0),
                            smartAccountPdaBump: smartAccountPdaBump,
                        }];
            }
        });
    });
}
