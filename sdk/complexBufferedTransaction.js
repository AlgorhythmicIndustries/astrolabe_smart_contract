"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createComplexBufferedTransaction = createComplexBufferedTransaction;
var kit_1 = require("@solana/kit");
var transactions_1 = require("@solana/transactions");
var bs58 = require("bs58");
var instructions_1 = require("./clients/js/src/generated/instructions");
var settings_1 = require("./clients/js/src/generated/accounts/settings");
var index_1 = require("./utils/index");
function createComplexBufferedTransaction(params) {
    return __awaiter(this, void 0, void 0, function () {
        var rpc, smartAccountSettings, smartAccountPda, smartAccountPdaBump, signer, feePayer, innerTransactionBytes, addressTableLookups, _a, memo, _b, bufferIndex, _c, accountIndex, settings, nextIndex, transactionPda, proposalPda, versioned, compiled, toAddress, header, numSignerAccounts, numReadonlySignerAccounts, numReadonlyNonSignerAccounts, staticAccountsLen, safeStaticAccounts, safeInstructions, COMPUTE_BUDGET_PROGRAM, computeBudgetProgramIndex, hasComputeUnitLimit, modifiedInstructions, transactionMessage, transactionMessageBytes, finalBuffer, finalBufferSize, lookups, totalLookupIndexes, maxProgramIndex, maxAccountIndex, _i, _d, ix, _e, _f, ai, hashBuf, finalBufferHash, feePayerSigner, latestBlockhash, CHUNK, chunks, i, chosenBufferIndex, transactionBufferPda, attempts, info, createBufferIx, createBufferMessage, compiledCreateBuffer, createBufferTx, extendTxs, _loop_1, i, createFromBufferIx, createProposalIx, approveIx, createFromBufferMsg, compiledCreateFromBuffer, createFromBufferTx, proposeAndApproveMsg, compiledProposeAndApprove, proposeAndApproveTx, executeIx, explicitParamsCount, explicitParams, resultAccounts_1, execLookups, _g, execLookups_1, lookup, totalStatic, numSignersInner_1, numWritableSignersInner_1, numWritableNonSignersInner_1, _loop_2, _h, execLookups_2, lookup, executeIxWithAccounts_1, executeMsgLocal, addressesByLookupTableAddress, _j, execLookups_3, lookup, info, b64, dataBuf, data, HEADER_SIZE, PUBKEY_SIZE, total, addrs, i, off, keyBytes, compiledExecuteLocal, executeTxLocal;
        var _k, _l, _m, _o, _p, _q, _r, _s;
        return __generator(this, function (_t) {
            switch (_t.label) {
                case 0:
                    rpc = params.rpc, smartAccountSettings = params.smartAccountSettings, smartAccountPda = params.smartAccountPda, smartAccountPdaBump = params.smartAccountPdaBump, signer = params.signer, feePayer = params.feePayer, innerTransactionBytes = params.innerTransactionBytes, addressTableLookups = params.addressTableLookups, _a = params.memo, memo = _a === void 0 ? 'Buffered Smart Account Transaction' : _a, _b = params.bufferIndex, bufferIndex = _b === void 0 ? 0 : _b, _c = params.accountIndex, accountIndex = _c === void 0 ? 0 : _c;
                    return [4 /*yield*/, (0, settings_1.fetchSettings)(rpc, smartAccountSettings)];
                case 1:
                    settings = _t.sent();
                    nextIndex = settings.data.transactionIndex + BigInt(1);
                    return [4 /*yield*/, (0, index_1.deriveTransactionPda)(smartAccountSettings, nextIndex)];
                case 2:
                    transactionPda = _t.sent();
                    return [4 /*yield*/, (0, index_1.deriveProposalPda)(smartAccountSettings, nextIndex)];
                case 3:
                    proposalPda = _t.sent();
                    versioned = (0, transactions_1.getTransactionDecoder)().decode(innerTransactionBytes);
                    compiled = (0, index_1.decodeTransactionMessage)(versioned.messageBytes);
                    toAddress = function (k) {
                        var _a;
                        if (!k)
                            throw new Error('Invalid account key (undefined)');
                        if (typeof k === 'string')
                            return (0, kit_1.address)(k);
                        if (k instanceof Uint8Array)
                            return (0, kit_1.address)(bs58.encode(k));
                        // Some kits wrap Address-like with .toString()
                        var s = (_a = k.toString) === null || _a === void 0 ? void 0 : _a.call(k);
                        if (typeof s === 'string')
                            return (0, kit_1.address)(s);
                        throw new Error('Unsupported account key type');
                    };
                    header = (compiled.header || {});
                    numSignerAccounts = (_k = header === null || header === void 0 ? void 0 : header.numSignerAccounts) !== null && _k !== void 0 ? _k : 1;
                    numReadonlySignerAccounts = (_l = header === null || header === void 0 ? void 0 : header.numReadonlySignerAccounts) !== null && _l !== void 0 ? _l : 0;
                    numReadonlyNonSignerAccounts = (_m = header === null || header === void 0 ? void 0 : header.numReadonlyNonSignerAccounts) !== null && _m !== void 0 ? _m : 0;
                    staticAccountsLen = (((_o = compiled.staticAccounts) === null || _o === void 0 ? void 0 : _o.length) || 0);
                    safeStaticAccounts = (compiled.staticAccounts || []);
                    if (!safeStaticAccounts.length || safeStaticAccounts.some(function (k) { return !k; })) {
                        throw new Error('Decoded message has missing static account keys');
                    }
                    // DEBUG: Check what account[0] is (should be smart account PDA for Jupiter swaps)
                    console.log('🔍 Jupiter transaction account[0]:', toAddress(safeStaticAccounts[0]));
                    console.log('🔍 Expected smart account PDA:', smartAccountPda);
                    console.log('🔍 Account[0] matches smart account PDA:', toAddress(safeStaticAccounts[0]) === smartAccountPda);
                    safeInstructions = (compiled.instructions || []).filter(function (ix) { return !!ix; });
                    COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';
                    computeBudgetProgramIndex = safeStaticAccounts.findIndex(function (addr) { return toAddress(addr) === COMPUTE_BUDGET_PROGRAM; });
                    hasComputeUnitLimit = false;
                    modifiedInstructions = safeInstructions.map(function (ix) {
                        var _a, _b, _c;
                        if (ix.programAddressIndex === computeBudgetProgramIndex && ix.data && ix.data[0] === 2) {
                            hasComputeUnitLimit = true;
                            // SetComputeUnitLimit instruction found - increase it to 600K
                            // Format: [2, u32 units (little endian)]
                            var newLimit = 400000;
                            var newData = new Uint8Array(5);
                            newData[0] = 2; // SetComputeUnitLimit discriminator
                            newData[1] = newLimit & 0xff;
                            newData[2] = (newLimit >> 8) & 0xff;
                            newData[3] = (newLimit >> 16) & 0xff;
                            newData[4] = (newLimit >> 24) & 0xff;
                            console.log("\uD83D\uDD27 Increased existing compute unit limit to ".concat(newLimit));
                            return {
                                programIdIndex: ix.programAddressIndex,
                                accountIndexes: new Uint8Array((_a = ix.accountIndices) !== null && _a !== void 0 ? _a : []),
                                data: newData,
                            };
                        }
                        return {
                            programIdIndex: ix.programAddressIndex,
                            accountIndexes: new Uint8Array((_b = ix.accountIndices) !== null && _b !== void 0 ? _b : []),
                            data: (_c = ix.data) !== null && _c !== void 0 ? _c : new Uint8Array(),
                        };
                    });
                    // If no compute unit limit instruction exists, we need to add one
                    // For now, log a warning - we'd need to add ComputeBudget program to accounts
                    if (!hasComputeUnitLimit) {
                        console.log('⚠️  No compute unit limit instruction found - transaction may fail with default 200K limit');
                        console.log('💡 Consider adding a SetComputeUnitLimit instruction before buffering');
                    }
                    transactionMessage = {
                        numSigners: numSignerAccounts,
                        numWritableSigners: Math.max(0, numSignerAccounts - numReadonlySignerAccounts),
                        numWritableNonSigners: Math.max(0, (staticAccountsLen - numSignerAccounts) - numReadonlyNonSignerAccounts),
                        accountKeys: safeStaticAccounts,
                        instructions: modifiedInstructions,
                        addressTableLookups: (addressTableLookups || []).map(function (lookup) {
                            var _a, _b;
                            return ({
                                accountKey: lookup.accountKey,
                                writableIndexes: new Uint8Array((_a = lookup.writableIndexes) !== null && _a !== void 0 ? _a : []),
                                readonlyIndexes: new Uint8Array((_b = lookup.readonlyIndexes) !== null && _b !== void 0 ? _b : []),
                            });
                        }),
                    };
                    transactionMessageBytes = (0, index_1.getTransactionMessageEncoder)().encode(transactionMessage);
                    finalBuffer = new Uint8Array(transactionMessageBytes);
                    finalBufferSize = finalBuffer.length;
                    lookups = (compiled.addressTableLookups || []);
                    totalLookupIndexes = lookups.reduce(function (sum, l) { var _a, _b; return sum + (((_a = l === null || l === void 0 ? void 0 : l.writableIndexes) === null || _a === void 0 ? void 0 : _a.length) || 0) + (((_b = l === null || l === void 0 ? void 0 : l.readonlyIndexes) === null || _b === void 0 ? void 0 : _b.length) || 0); }, 0);
                    maxProgramIndex = 0;
                    maxAccountIndex = 0;
                    for (_i = 0, _d = (compiled.instructions || []); _i < _d.length; _i++) {
                        ix = _d[_i];
                        if (typeof ix.programAddressIndex === 'number') {
                            maxProgramIndex = Math.max(maxProgramIndex, ix.programAddressIndex);
                        }
                        if (Array.isArray(ix.accountIndices)) {
                            for (_e = 0, _f = ix.accountIndices; _e < _f.length; _e++) {
                                ai = _f[_e];
                                if (typeof ai === 'number')
                                    maxAccountIndex = Math.max(maxAccountIndex, ai);
                            }
                        }
                    }
                    console.log('🧩 TxMessage header:', { numSignerAccounts: numSignerAccounts, numReadonlySignerAccounts: numReadonlySignerAccounts, numReadonlyNonSignerAccounts: numReadonlyNonSignerAccounts, staticAccountsLen: staticAccountsLen });
                    console.log('🧩 Lookups:', { count: lookups.length, totalLookupIndexes: totalLookupIndexes });
                    console.log('🧩 Indices:', { maxProgramIndex: maxProgramIndex, maxAccountIndex: maxAccountIndex, bound: staticAccountsLen + totalLookupIndexes - 1 });
                    return [4 /*yield*/, crypto.subtle.digest('SHA-256', finalBuffer)];
                case 4:
                    hashBuf = _t.sent();
                    finalBufferHash = new Uint8Array(hashBuf);
                    console.log("\uD83D\uDCCA Raw TransactionMessage size (to buffer): ".concat(finalBufferSize, " bytes"));
                    feePayerSigner = (0, kit_1.createNoopSigner)(feePayer);
                    return [4 /*yield*/, rpc.getLatestBlockhash().send()];
                case 5:
                    latestBlockhash = (_t.sent()).value;
                    CHUNK = 600;
                    chunks = [];
                    for (i = 0; i < finalBuffer.length; i += CHUNK) {
                        chunks.push(finalBuffer.subarray(i, Math.min(i + CHUNK, finalBuffer.length)));
                    }
                    console.log('📦 Buffer chunks:', chunks.map(function (c, i) { return "#".concat(i + 1, "=").concat(c.length); }).join(', '));
                    chosenBufferIndex = bufferIndex & 0xff;
                    return [4 /*yield*/, (0, index_1.deriveBufferPda)(smartAccountSettings, signer.address, chosenBufferIndex)];
                case 6:
                    transactionBufferPda = _t.sent();
                    attempts = 0;
                    _t.label = 7;
                case 7:
                    if (!(attempts < 256)) return [3 /*break*/, 11];
                    return [4 /*yield*/, rpc.getAccountInfo(transactionBufferPda, { encoding: 'base64', commitment: 'processed' }).send()];
                case 8:
                    info = _t.sent();
                    if (!info.value)
                        return [3 /*break*/, 11]; // free
                    chosenBufferIndex = (chosenBufferIndex + 1) & 0xff;
                    return [4 /*yield*/, (0, index_1.deriveBufferPda)(smartAccountSettings, signer.address, chosenBufferIndex)];
                case 9:
                    transactionBufferPda = _t.sent();
                    _t.label = 10;
                case 10:
                    attempts++;
                    return [3 /*break*/, 7];
                case 11:
                    createBufferIx = (0, instructions_1.getCreateTransactionBufferInstruction)({
                        settings: smartAccountSettings,
                        transactionBuffer: transactionBufferPda,
                        bufferCreator: signer,
                        feePayer: feePayerSigner,
                        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
                        bufferIndex: chosenBufferIndex,
                        accountIndex: accountIndex,
                        finalBufferHash: finalBufferHash,
                        finalBufferSize: finalBufferSize,
                        buffer: chunks[0],
                    });
                    createBufferMessage = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), function (tx) { return (0, kit_1.setTransactionMessageFeePayerSigner)(feePayerSigner, tx); }, function (tx) { return (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx); }, function (tx) { return (0, kit_1.appendTransactionMessageInstructions)([createBufferIx], tx); });
                    compiledCreateBuffer = (0, kit_1.compileTransaction)(createBufferMessage);
                    (0, kit_1.assertIsTransactionWithinSizeLimit)(compiledCreateBuffer);
                    createBufferTx = new Uint8Array(compiledCreateBuffer.messageBytes);
                    extendTxs = [];
                    _loop_1 = function (i) {
                        var extendIx = (0, instructions_1.getExtendTransactionBufferInstruction)({
                            settings: smartAccountSettings,
                            transactionBuffer: transactionBufferPda,
                            creator: signer,
                            buffer: chunks[i],
                        });
                        var msg = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), function (tx) { return (0, kit_1.setTransactionMessageFeePayerSigner)(feePayerSigner, tx); }, function (tx) { return (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx); }, function (tx) { return (0, kit_1.appendTransactionMessageInstructions)([extendIx], tx); });
                        var compiledExtend = (0, kit_1.compileTransaction)(msg);
                        (0, kit_1.assertIsTransactionWithinSizeLimit)(compiledExtend);
                        extendTxs.push(new Uint8Array(compiledExtend.messageBytes));
                    };
                    for (i = 1; i < chunks.length; i++) {
                        _loop_1(i);
                    }
                    createFromBufferIx = (0, instructions_1.getCreateTransactionFromBufferInstruction)({
                        settings: smartAccountSettings,
                        transaction: transactionPda,
                        creator: signer,
                        feePayer: feePayerSigner,
                        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
                        transactionBuffer: transactionBufferPda,
                        fromBufferCreator: signer,
                        args: {
                            accountIndex: accountIndex,
                            accountBump: smartAccountPdaBump,
                            ephemeralSigners: 0,
                            transactionMessage: new Uint8Array(finalBufferSize),
                            memo: undefined,
                        },
                    });
                    createProposalIx = (0, instructions_1.getCreateProposalInstruction)({
                        settings: smartAccountSettings,
                        proposal: proposalPda,
                        creator: signer,
                        feePayer: feePayerSigner,
                        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
                        transactionIndex: nextIndex,
                        draft: false,
                    });
                    approveIx = (0, instructions_1.getApproveProposalInstruction)({
                        settings: smartAccountSettings,
                        signer: signer,
                        proposal: proposalPda,
                        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
                        args: { memo: undefined },
                    });
                    createFromBufferMsg = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), function (tx) { return (0, kit_1.setTransactionMessageFeePayerSigner)(feePayerSigner, tx); }, function (tx) { return (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx); }, function (tx) { return (0, kit_1.appendTransactionMessageInstructions)([createFromBufferIx], tx); });
                    compiledCreateFromBuffer = (0, kit_1.compileTransaction)(createFromBufferMsg);
                    (0, kit_1.assertIsTransactionWithinSizeLimit)(compiledCreateFromBuffer);
                    createFromBufferTx = new Uint8Array(compiledCreateFromBuffer.messageBytes);
                    proposeAndApproveMsg = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), function (tx) { return (0, kit_1.setTransactionMessageFeePayerSigner)(feePayerSigner, tx); }, function (tx) { return (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx); }, function (tx) { return (0, kit_1.appendTransactionMessageInstructions)([createProposalIx, approveIx], tx); });
                    compiledProposeAndApprove = (0, kit_1.compileTransaction)(proposeAndApproveMsg);
                    (0, kit_1.assertIsTransactionWithinSizeLimit)(compiledProposeAndApprove);
                    proposeAndApproveTx = new Uint8Array(compiledProposeAndApprove.messageBytes);
                    executeIx = (0, instructions_1.getExecuteTransactionInstruction)({
                        settings: smartAccountSettings,
                        proposal: proposalPda,
                        transaction: transactionPda,
                        signer: signer,
                    });
                    explicitParamsCount = 4;
                    explicitParams = executeIx.accounts.slice(0, explicitParamsCount);
                    resultAccounts_1 = [];
                    execLookups = (addressTableLookups || []).filter(function (l) { return l && l.accountKey; });
                    for (_g = 0, execLookups_1 = execLookups; _g < execLookups_1.length; _g++) {
                        lookup = execLookups_1[_g];
                        resultAccounts_1.push({ address: toAddress(lookup.accountKey), role: kit_1.AccountRole.READONLY });
                    }
                    totalStatic = safeStaticAccounts.length;
                    numSignersInner_1 = numSignerAccounts;
                    numWritableSignersInner_1 = Math.max(0, numSignersInner_1 - numReadonlySignerAccounts);
                    numWritableNonSignersInner_1 = Math.max(0, totalStatic - numSignersInner_1 - numReadonlyNonSignerAccounts);
                    safeStaticAccounts.forEach(function (addrKey, idx) {
                        var role = kit_1.AccountRole.READONLY;
                        if (idx < numSignersInner_1) {
                            role = idx < numWritableSignersInner_1 ? kit_1.AccountRole.WRITABLE : kit_1.AccountRole.READONLY;
                        }
                        else {
                            var j = idx - numSignersInner_1;
                            role = j < numWritableNonSignersInner_1 ? kit_1.AccountRole.WRITABLE : kit_1.AccountRole.READONLY;
                        }
                        resultAccounts_1.push({ address: toAddress(addrKey), role: role });
                    });
                    if (!(execLookups.length > 0)) return [3 /*break*/, 15];
                    _loop_2 = function (lookup) {
                        var info, b64, dataBuf, data, HEADER_SIZE, PUBKEY_SIZE, total, getAddr, writableIdxs, readonlyIdxs, _u, writableIdxs_1, wi, a, _v, readonlyIdxs_1, ri, a;
                        return __generator(this, function (_w) {
                            switch (_w.label) {
                                case 0: return [4 /*yield*/, rpc
                                        .getAccountInfo(toAddress(lookup.accountKey), { encoding: 'base64', commitment: 'finalized' })
                                        .send()];
                                case 1:
                                    info = _w.sent();
                                    if (!((_p = info.value) === null || _p === void 0 ? void 0 : _p.data))
                                        return [2 /*return*/, "continue"];
                                    b64 = Array.isArray(info.value.data) ? info.value.data[0] : info.value.data;
                                    dataBuf = Buffer.from(b64, 'base64');
                                    data = new Uint8Array(dataBuf.buffer, dataBuf.byteOffset, dataBuf.byteLength);
                                    HEADER_SIZE = 56;
                                    PUBKEY_SIZE = 32;
                                    total = Math.floor((data.length - HEADER_SIZE) / PUBKEY_SIZE);
                                    getAddr = function (i) {
                                        if (i < 0 || i >= total)
                                            return null;
                                        var off = HEADER_SIZE + i * PUBKEY_SIZE;
                                        var keyBytes = data.subarray(off, off + PUBKEY_SIZE);
                                        return (0, kit_1.address)(bs58.encode(keyBytes));
                                    };
                                    writableIdxs = Array.from((_q = lookup.writableIndexes) !== null && _q !== void 0 ? _q : []);
                                    readonlyIdxs = Array.from((_r = lookup.readonlyIndexes) !== null && _r !== void 0 ? _r : []);
                                    for (_u = 0, writableIdxs_1 = writableIdxs; _u < writableIdxs_1.length; _u++) {
                                        wi = writableIdxs_1[_u];
                                        a = getAddr(wi);
                                        if (a)
                                            resultAccounts_1.push({ address: a, role: kit_1.AccountRole.WRITABLE });
                                    }
                                    for (_v = 0, readonlyIdxs_1 = readonlyIdxs; _v < readonlyIdxs_1.length; _v++) {
                                        ri = readonlyIdxs_1[_v];
                                        a = getAddr(ri);
                                        if (a)
                                            resultAccounts_1.push({ address: a, role: kit_1.AccountRole.READONLY });
                                    }
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _h = 0, execLookups_2 = execLookups;
                    _t.label = 12;
                case 12:
                    if (!(_h < execLookups_2.length)) return [3 /*break*/, 15];
                    lookup = execLookups_2[_h];
                    return [5 /*yield**/, _loop_2(lookup)];
                case 13:
                    _t.sent();
                    _t.label = 14;
                case 14:
                    _h++;
                    return [3 /*break*/, 12];
                case 15:
                    executeIxWithAccounts_1 = __assign(__assign({}, executeIx), { accounts: __spreadArray(__spreadArray([], explicitParams, true), resultAccounts_1, true) });
                    executeMsgLocal = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), function (tx) { return (0, kit_1.setTransactionMessageFeePayerSigner)(feePayerSigner, tx); }, function (tx) { return (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx); }, function (tx) { return (0, kit_1.appendTransactionMessageInstructions)([executeIxWithAccounts_1], tx); });
                    if (!(execLookups.length > 0)) return [3 /*break*/, 20];
                    addressesByLookupTableAddress = {};
                    _j = 0, execLookups_3 = execLookups;
                    _t.label = 16;
                case 16:
                    if (!(_j < execLookups_3.length)) return [3 /*break*/, 19];
                    lookup = execLookups_3[_j];
                    return [4 /*yield*/, rpc
                            .getAccountInfo(toAddress(lookup.accountKey), { encoding: 'base64', commitment: 'finalized' })
                            .send()];
                case 17:
                    info = _t.sent();
                    if (!((_s = info.value) === null || _s === void 0 ? void 0 : _s.data))
                        return [3 /*break*/, 18];
                    b64 = Array.isArray(info.value.data) ? info.value.data[0] : info.value.data;
                    dataBuf = Buffer.from(b64, 'base64');
                    data = new Uint8Array(dataBuf.buffer, dataBuf.byteOffset, dataBuf.byteLength);
                    HEADER_SIZE = 56;
                    PUBKEY_SIZE = 32;
                    total = Math.floor((data.length - HEADER_SIZE) / PUBKEY_SIZE);
                    addrs = [];
                    for (i = 0; i < total; i++) {
                        off = HEADER_SIZE + i * PUBKEY_SIZE;
                        keyBytes = data.subarray(off, off + PUBKEY_SIZE);
                        addrs.push((0, kit_1.address)(bs58.encode(keyBytes)));
                    }
                    addressesByLookupTableAddress[lookup.accountKey.toString()] = addrs;
                    _t.label = 18;
                case 18:
                    _j++;
                    return [3 /*break*/, 16];
                case 19:
                    executeMsgLocal = (0, kit_1.compressTransactionMessageUsingAddressLookupTables)(executeMsgLocal, addressesByLookupTableAddress);
                    _t.label = 20;
                case 20:
                    compiledExecuteLocal = (0, kit_1.compileTransaction)(executeMsgLocal);
                    (0, kit_1.assertIsTransactionWithinSizeLimit)(compiledExecuteLocal);
                    executeTxLocal = new Uint8Array(compiledExecuteLocal.messageBytes);
                    // Replace previous executeTx with local one including remaining accounts
                    return [2 /*return*/, {
                            createBufferTx: __spreadArray([createBufferTx], extendTxs, true),
                            createFromBufferTx: createFromBufferTx,
                            proposeAndApproveTx: proposeAndApproveTx,
                            executeTx: executeTxLocal,
                            transactionPda: transactionPda,
                            proposalPda: proposalPda,
                            transactionBufferPda: transactionBufferPda,
                            bufferIndex: chosenBufferIndex,
                            finalBufferSize: finalBufferSize,
                        }];
            }
        });
    });
}
