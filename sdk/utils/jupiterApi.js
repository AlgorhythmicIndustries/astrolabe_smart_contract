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
exports.getSwapQuote = getSwapQuote;
exports.getSwapTransaction = getSwapTransaction;
var WSOL_MINT = 'So11111111111111111111111111111111111111112';
function getSwapQuote(inputMint, outputMint, amount, slippage, platformFeeBps) {
    return __awaiter(this, void 0, void 0, function () {
        var actualInputMint, actualOutputMint, url, response, data, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    actualInputMint = inputMint === 'native' ? WSOL_MINT : inputMint;
                    actualOutputMint = outputMint === 'native' ? WSOL_MINT : outputMint;
                    console.log('Requesting quote with params:', {
                        inputMint: inputMint,
                        outputMint: outputMint,
                        amount: amount,
                        slippage: slippage,
                        platformFeeBps: platformFeeBps
                    });
                    url = new URL('https://lite-api.jup.ag/swap/v1/quote');
                    url.searchParams.append('inputMint', actualInputMint);
                    url.searchParams.append('outputMint', actualOutputMint);
                    url.searchParams.append('amount', amount.toString());
                    url.searchParams.append('slippageBps', Math.round(slippage * 1000).toString());
                    url.searchParams.append('restrictIntermediateTokens', 'true');
                    // Additional routing restrictions for smaller transactions
                    url.searchParams.append('maxAccounts', '32'); // Limit total accounts
                    url.searchParams.append('onlyDirectRoutes', 'false'); // Allow direct routes when possible
                    url.searchParams.append('asLegacyTransaction', 'false'); // Ensure versioned transactions for ALT support
                    // Add platform fee if provided
                    if (platformFeeBps && platformFeeBps > 0) {
                        url.searchParams.append('platformFeeBps', platformFeeBps.toString());
                        console.log('💰 Adding platform fee:', platformFeeBps, 'basis points');
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, fetch(url)];
                case 2:
                    response = _a.sent();
                    return [4 /*yield*/, response.json()];
                case 3:
                    data = _a.sent();
                    if (!response.ok) {
                        console.error('Quote error:', data);
                        throw new Error(data.error || 'Failed to get quote');
                    }
                    console.log('Quote response:', data);
                    return [2 /*return*/, data];
                case 4:
                    error_1 = _a.sent();
                    console.error('Failed to fetch quote:', error_1);
                    throw error_1;
                case 5: return [2 /*return*/];
            }
        });
    });
}
function getSwapTransaction(quote_1, userPublicKey_1) {
    return __awaiter(this, arguments, void 0, function (quote, userPublicKey, wrapAndUnwrapSol, dynamicComputeUnitLimit, prioritizationFeeLamports) {
        var response, data, error_2;
        var _a;
        if (wrapAndUnwrapSol === void 0) { wrapAndUnwrapSol = true; }
        if (dynamicComputeUnitLimit === void 0) { dynamicComputeUnitLimit = true; }
        if (prioritizationFeeLamports === void 0) { prioritizationFeeLamports = 'auto'; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log('Requesting swap transaction for user:', userPublicKey);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, fetch('https://lite-api.jup.ag/swap/v1/swap', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                quoteResponse: quote,
                                userPublicKey: userPublicKey,
                                wrapAndUnwrapSol: wrapAndUnwrapSol,
                                dynamicComputeUnitLimit: dynamicComputeUnitLimit,
                                prioritizationFeeLamports: prioritizationFeeLamports,
                            }),
                        })];
                case 2:
                    response = _b.sent();
                    return [4 /*yield*/, response.json()];
                case 3:
                    data = _b.sent();
                    if (!response.ok) {
                        console.error('Swap transaction error:', data);
                        throw new Error(data.error || 'Failed to get swap transaction');
                    }
                    console.log('Swap transaction response received, size:', ((_a = data.swapTransaction) === null || _a === void 0 ? void 0 : _a.length) || 0, 'chars');
                    return [2 /*return*/, data];
                case 4:
                    error_2 = _b.sent();
                    console.error('Failed to fetch swap transaction:', error_2);
                    throw error_2;
                case 5: return [2 /*return*/];
            }
        });
    });
}
