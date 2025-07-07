"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const kit_1 = require("@solana/kit");
const fs_1 = __importDefault(require("fs"));
const instructions_1 = require("../../clients/js/src/generated/instructions");
const programs_1 = require("../../clients/js/src/generated/programs");
const compute_budget_1 = require("@solana-program/compute-budget");
async function main() {
    // Set up connection and payer
    const rpc = (0, kit_1.createSolanaRpc)('http://localhost:8899');
    const rpcSubscriptions = (0, kit_1.createSolanaRpcSubscriptions)('ws://localhost:8900');
    // Get bytes from local keypair file.
    const keypairFile = fs_1.default.readFileSync('/home/user/.config/solana/id.json');
    const keypairBytes = new Uint8Array(JSON.parse(keypairFile.toString()));
    const initializerKeypairFile = fs_1.default.readFileSync('../../test-program-config-initializer-keypair.json');
    const initializerKeypairBytes = new Uint8Array(JSON.parse(initializerKeypairFile.toString()));
    // Create authority and initializer signers
    const authorityKeypair = await (0, kit_1.createKeyPairFromBytes)(keypairBytes);
    const authoritySigner = await (0, kit_1.createSignerFromKeyPair)(authorityKeypair);
    const initializerKeypair = await (0, kit_1.createKeyPairFromBytes)(initializerKeypairBytes);
    const initializerSigner = await (0, kit_1.createSignerFromKeyPair)(initializerKeypair);
    console.log('Authority:', authoritySigner.address);
    console.log('Initializer:', initializerSigner.address);
    // Airdrop SOL to authority and initializer
    const airdrop = (0, kit_1.airdropFactory)({ rpc: rpc, rpcSubscriptions: rpcSubscriptions });
    await airdrop({
        commitment: 'confirmed',
        recipientAddress: authoritySigner.address,
        lamports: (0, kit_1.lamports)(10000000n)
    }); // 10 SOL
    await airdrop({
        commitment: 'confirmed',
        recipientAddress: initializerSigner.address,
        lamports: (0, kit_1.lamports)(10000000n)
    }); // 10 SOL
    // --- Start Balance Check ---
    const { value: balance } = await rpc.getBalance(initializerSigner.address).send();
    console.log(`Initializer balance: ${balance} lamports`);
    if (balance === 0n) {
        console.error('Initializer has no balance. Airdrop may have failed.');
        return;
    }
    console.log('Astrolabe Smart Account Program Address:', programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS);
    // --- End Balance Check ---
    // Derive program config PDA
    const [programConfigPda] = await (0, kit_1.getProgramDerivedAddress)({
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
            new Uint8Array(Buffer.from('smart_account')),
            new Uint8Array(Buffer.from('program_config')),
        ],
    });
    console.log('Program config PDA:', programConfigPda);
    // Derive treasury PDA
    const [treasuryPda] = await (0, kit_1.getProgramDerivedAddress)({
        programAddress: programs_1.ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
        seeds: [
            new Uint8Array(Buffer.from('smart_account')),
            new Uint8Array(Buffer.from('treasury')),
        ],
    });
    console.log('Treasury PDA:', treasuryPda);
    // Build initialize program config instruction
    const instruction = await (0, instructions_1.getInitializeProgramConfigInstruction)({
        programConfig: programConfigPda,
        initializer: initializerSigner,
        systemProgram: (0, kit_1.address)('11111111111111111111111111111111'),
        authority: authoritySigner.address,
        smartAccountCreationFee: (0, kit_1.lamports)(10000000n),
        treasury: treasuryPda,
    });
    // Get latest blockhash
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    // Build and send transaction
    const transactionMessage = (0, kit_1.pipe)((0, kit_1.createTransactionMessage)({ version: 0 }), (tx) => (0, kit_1.setTransactionMessageFeePayerSigner)(initializerSigner, tx), (tx) => (0, kit_1.setTransactionMessageLifetimeUsingBlockhash)(latestBlockhash, tx), (tx) => (0, kit_1.appendTransactionMessageInstructions)([
        (0, compute_budget_1.getSetComputeUnitLimitInstruction)({ units: 200000 }),
        (0, compute_budget_1.getSetComputeUnitPriceInstruction)({ microLamports: 1 }),
        instruction
    ], tx));
    const signedTransaction = await (0, kit_1.signTransactionMessageWithSigners)(transactionMessage);
    /*
    // --- Start Debugging ---
    try {
      const base64Transaction = getBase64EncodedWireTransaction(signedTransaction);
  
      console.log('Sending transaction via raw fetch to inspect response...');
  
      const response = await fetch('http://localhost:8899', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'sendTransaction',
          params: [
            base64Transaction,
            {
              encoding: 'base64',
              preflightCommitment: 'confirmed',
            },
          ],
        }),
      });
  
      const responseBody = await response.json();
  
      console.log('--- Raw RPC Response from test validator ---');
      console.log(JSON.stringify(responseBody, null, 2));
      console.log('--- End Raw RPC Response ---');
  
      if (responseBody.error) {
        console.error('Transaction failed. RPC Error from Surfpool:', responseBody.error);
      } else {
        console.log('Transaction sent successfully! Signature:', responseBody.result);
      }
    } catch (e) {
        console.error('Caught an exception while sending the transaction:', e);
    }
    // --- End Debugging ---
    */
    const sendAndConfirm = (0, kit_1.sendAndConfirmTransactionFactory)({ rpc, rpcSubscriptions });
    const signature = await sendAndConfirm(signedTransaction, { commitment: 'confirmed' });
    console.log('Program config initialized! Signature:', signature);
}
main().catch(console.error);
