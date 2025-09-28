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
var kit_1 = require("@solana/kit");
var fs_1 = require("fs");
var instructions_1 = require("../clients/js/src/generated/instructions");
var programs_1 = require("../clients/js/src/generated/programs");
var compute_budget_1 = require("@solana-program/compute-budget");
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var rpc, rpcSubscriptions, keypairFile, keypairBytes, initializerKeypairFile, initializerKeypairBytes, authorityKeypair, authoritySigner, initializerKeypair, initializerSigner, airdrop, balance, programConfigPda, treasuryPda, instruction, latestBlockhash, transactionMessage, signedTransaction, sendAndConfirm, signature;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    rpc = (0, kit_1.createSolanaRpc)('http://localhost:8899');
                    rpcSubscriptions = (0, kit_1.createSolanaRpcSubscriptions)('ws://localhost:8900');
                    keypairFile = fs_1.default.readFileSync('/home/ubuntu/.config/solana/id.json');
                    keypairBytes = new Uint8Array(JSON.parse(keypairFile.toString()));
                    initializerKeypairFile = fs_1.default.readFileSync('/home/ubuntu/astrolabe_smart_contract/test-program-config-initializer-keypair.json');
                    initializerKeypairBytes = new Uint8Array(JSON.parse(initializerKeypairFile.toString()));
                    return [4 /*yield*/, (0, kit_1.createKeyPairFromBytes)(keypairBytes)];
                case 1:
                    authorityKeypair = _a.sent();
                    return [4 /*yield*/, (0, kit_1.createSignerFromKeyPair)(authorityKeypair)];
                case 2:
                    authoritySigner = _a.sent();
                    return [4 /*yield*/, (0, kit_1.createKeyPairFromBytes)(initializerKeypairBytes)];
                case 3:
                    initializerKeypair = _a.sent();
                    return [4 /*yield*/, (0, kit_1.createSignerFromKeyPair)(initializerKeypair)];
                case 4:
                    initializerSigner = _a.sent();
                    console.log('Authority:', authoritySigner.address);
                    console.log('Initializer:', initializerSigner.address);
                    airdrop = (0, kit_1.airdropFactory)({ rpc: rpc, rpcSubscriptions: rpcSubscriptions });
                    return [4 /*yield*/, airdrop({
                            commitment: 'confirmed',
                            recipientAddress: authoritySigner.address,
                            lamports: (0, kit_1.lamports)(10000000n)
                        })];
                case 5:
                    _a.sent(); // 10 SOL
                    return [4 /*yield*/, airdrop({
                            commitment: 'confirmed',
                            recipientAddress: initializerSigner.address,
                            lamports: (0, kit_1.lamports)(10000000n)
                        })];
                case 6:
                    _a.sent(); // 10 SOL
                    return [4 /*yield*/, rpc.getBalance(initializerSigner.address).send()];
                case 7:
                    balance = (_a.sent()).value;
                    console.log("Initializer balance: ".concat(balance, " lamports"));
                    if (balance === 0n) {
                        console.error('Initializer has no balance. Airdrop may have failed.');
                        return [2 /*return*/];
                    }
                    console.log('Astrolabe Smart Account Program Address:', programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS);
                    return [4 /*yield*/, (0, kit_1.getProgramDerivedAddress)({
                            programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
                            seeds: [
                                new Uint8Array(Buffer.from('smart_account')),
                                new Uint8Array(Buffer.from('program_config')),
                            ],
                        })];
                case 8:
                    programConfigPda = (_a.sent())[0];
                    console.log('Program config PDA:', programConfigPda);
                    return [4 /*yield*/, (0, kit_1.getProgramDerivedAddress)({
                            programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
                            seeds: [
                                new Uint8Array(Buffer.from('smart_account')),
                                new Uint8Array(Buffer.from('treasury')),
                            ],
                        })];
                case 9:
                    treasuryPda = (_a.sent())[0];
                    console.log('Treasury PDA:', treasuryPda);
                    return [4 /*yield*/, (0, instructions_1.getInitializeProgramConfigInstruction)({
                            programConfig: programConfigPda,
                            initializer: initializerSigner,
                            systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
                            authority: authoritySigner.address,
                            smartAccountCreationFee: (0, kit_1.lamports)(10000000n),
                            treasury: treasuryPda,
                        })];
                case 10:
                    instruction = _a.sent();
                    return [4 /*yield*/, rpc.getLatestBlockhash().send()];
                case 11:
                    latestBlockhash = (_a.sent()).value;
                    transactionMessage = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), function (tx) { return (0, kit_1.setTransactionMessageFeePayerSigner)(initializerSigner, tx); }, function (tx) { return (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx); }, function (tx) { return (0, kit_1.appendTransactionMessageInstructions)([
                        (0, compute_budget_1.getSetComputeUnitLimitInstruction)({ units: 200000 }),
                        (0, compute_budget_1.getSetComputeUnitPriceInstruction)({ microLamports: 1 }),
                        instruction
                    ], tx); });
                    return [4 /*yield*/, (0, kit_1.signTransactionMessageWithSigners)(transactionMessage)];
                case 12:
                    signedTransaction = _a.sent();
                    sendAndConfirm = (0, kit_1.sendAndConfirmTransactionFactory)({ rpc: rpc, rpcSubscriptions: rpcSubscriptions });
                    return [4 /*yield*/, sendAndConfirm(signedTransaction, { commitment: 'confirmed' })];
                case 13:
                    signature = _a.sent();
                    console.log('Program config initialized! Signature:', signature);
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(console.error);
