import {
  pipe,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createKeyPairFromBytes,
  createSignerFromKeyPair,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  getSignatureFromTransaction,
  sendAndConfirmTransactionFactory,
  assertIsTransactionWithinSizeLimit,
  lamports,
  address,
  getProgramDerivedAddress,
  createNoopSigner,
  compileTransaction,
  getCompiledTransactionMessageDecoder,
  getStructEncoder,
  getU8Encoder,
  getBytesEncoder,
  getOptionEncoder,
  addEncoderSizePrefix,
  fixEncoderSize,
  getUtf8Encoder,
  getU32Encoder,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import * as fs from 'fs';
import {
  ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
} from '../clients/js/src/generated/programs';
import { Buffer } from 'buffer';
import { fetchSettings, fetchTransaction } from '../clients/js/src/generated/accounts';
import * as bs58 from 'bs58';
import {
  getCreateProposalInstruction,
  getApproveProposalInstruction,
  getExecuteTransactionInstruction,
} from '../clients/js/src/generated/instructions';
import { VoteOnProposalArgs } from '../clients/js/src/generated/types';
import { AccountRole } from '@solana/kit';
import * as assert from 'assert';
import { getSmartAccountTransactionMessageEncoder } from '../clients/js/src/generated/types/smartAccountTransactionMessage';
import { 
  getCreateTransactionInstruction,
} from '../clients/js/src/generated/instructions';

async function main() {
  // Set up connection
  const rpc = createSolanaRpc('http://localhost:8899');
  const rpcSubscriptions = createSolanaRpcSubscriptions('ws://localhost:8900');
  
  // Use a consistent creator and fee payer
  const feePayerKeypairFile = fs.readFileSync('/Users/algorhythmic/.config/solana/id.json');
  const feePayerKeypairBytes = new Uint8Array(JSON.parse(feePayerKeypairFile.toString()));
  const feePayerKeypair = await createKeyPairFromBytes(feePayerKeypairBytes);
  const feePayer = await createSignerFromKeyPair(feePayerKeypair);

  // The PDA for the smart account that was created in the previous script.
  const smartAccountSettings = address('8A8CYfDTjEUw9hYT12NNjVxvs76qP7ajuXKfnET8AfwS');

  // This is the PDA that will SIGN the inner transaction. It must also hold the funds.
  const [smartAccountPda, smartAccountPdaBump] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
        new Uint8Array(Buffer.from('smart_account')),
        bs58.decode(smartAccountSettings),
        new Uint8Array(Buffer.from('smart_account')),
        new Uint8Array([0]), // account_index as u8
    ]
  });

  const airdropAmount = lamports(BigInt(2_000_000_000)); // 2 SOL

  console.log(
    `Airdropping ${airdropAmount} lamports to smart account signer: ${smartAccountPda}`
  );

  // Airdrop funds to the smart account wallet
  const airdropIx = getTransferSolInstruction({
    source: feePayer,
    destination: smartAccountPda,
    amount: airdropAmount,
  });

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(feePayer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions([airdropIx], tx)
  );

  const signedAirdropTransaction =
    await signTransactionMessageWithSigners(transactionMessage);

  // Validate the transaction
  assertIsTransactionWithinSizeLimit(signedAirdropTransaction);

  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  await sendAndConfirm(signedAirdropTransaction, { commitment: 'confirmed' });

  console.log(
    `Airdrop successful. Signature: ${getSignatureFromTransaction(
      signedAirdropTransaction
    )}`
  );

  // --- Create Proposal ---
  console.log('\n--- Creating transaction proposal ---');

  // 1. Fetch the latest on-chain state for the Settings account
  const settings = await fetchSettings(rpc, smartAccountSettings);
  const transactionIndex = settings.data.transactionIndex + BigInt(1);
  console.log(`Current transaction index: ${settings.data.transactionIndex}, new index: ${transactionIndex}`);

  // 2. Derive the PDA for the new Transaction account
  const [transactionPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
        new Uint8Array(Buffer.from('smart_account')),
        bs58.decode(smartAccountSettings),
        new Uint8Array(Buffer.from('transaction')),
        new Uint8Array(new BigUint64Array([transactionIndex]).buffer),
    ]
  });
  console.log(`Transaction PDA: ${transactionPda}`);

  // 3. Create the instruction that the multisig will execute (1 SOL transfer)
  const transferIx = getTransferSolInstruction({
    source: createNoopSigner(smartAccountPda),
    destination: feePayer.address,
    amount: lamports(BigInt(1_000_000_000)), // 1 SOL
  });

  // 4. Build and ENCODE the inner transaction message
  const { value: latestBlockhashForTransfer } = await rpc.getLatestBlockhash().send();
  const transferMessage = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(createNoopSigner(smartAccountPda), tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhashForTransfer, tx),
    tx => appendTransactionMessageInstructions([transferIx], tx)
  );

  const compiledTransferMessage = compileTransaction(transferMessage);
  const decodedMessage = getCompiledTransactionMessageDecoder().decode(compiledTransferMessage.messageBytes);
  
  console.log('=== DEBUG: Decoded Message ===');
  console.log('numSigners:', decodedMessage.header.numSignerAccounts);
  console.log('numWritableSigners:', decodedMessage.header.numWritableSignerAccounts);
  console.log('numWritableNonSigners:', decodedMessage.header.numWritableNonSignerAccounts);
  console.log('staticAccounts:', decodedMessage.staticAccounts.map(addr => addr.toString()));
  console.log('Smart Account PDA (expected signer):', smartAccountPda);
  console.log('Fee Payer (expected destination):', feePayer.address);
  console.log('Account index 1 (account_index used in createTransaction):', 1);
  console.log('Account bump:', smartAccountPdaBump);
  console.log('==============================');

  // Calculate the correct writable counts from the transaction message
  const numWritableSigners = 1; // Smart account PDA is a signer and writable
  const numWritableNonSigners = 1; // Fee payer is not a signer but is writable (destination)
  
  console.log('=== WRITABLE ACCOUNTS DEBUG ===');
  console.log('numWritableSigners (calculated):', numWritableSigners);
  console.log('numWritableNonSigners (calculated):', numWritableNonSigners);
  console.log('================================');

  // Manually construct the argument for the encoder. This is what the program expects.
  const smartAccountMessage = {
    numSigners: decodedMessage.header.numSignerAccounts,
    numWritableSigners: numWritableSigners,
    numWritableNonSigners: numWritableNonSigners,
    accountKeys: decodedMessage.staticAccounts,
    instructions: decodedMessage.instructions.map(ix => ({
      programIdIndex: ix.programAddressIndex,
      accountIndexes: new Uint8Array(ix.accountIndices ?? []),
      data: ix.data ?? new Uint8Array(),
    })),
    addressTableLookups: [],
  };

  const transactionMessageBytes = getSmartAccountTransactionMessageEncoder().encode(smartAccountMessage);

  // 5. Build the instruction to create the transaction account
  const createTransactionInstruction = getCreateTransactionInstruction({
    settings: smartAccountSettings,
    transaction: transactionPda,
    creator: feePayer,
    rentPayer: feePayer,
    systemProgram: address('11111111111111111111111111111111'),
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
  const createTransactionTx = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(feePayer, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhashForCreateTx, tx),
    tx => appendTransactionMessageInstructions([createTransactionInstruction], tx)
  );

  const signedCreateTransactionTx = await signTransactionMessageWithSigners(createTransactionTx);
  
  // Validate the transaction
  assertIsTransactionWithinSizeLimit(signedCreateTransactionTx);
  
  await sendAndConfirm(signedCreateTransactionTx, { commitment: 'confirmed' });
  console.log(`Transaction account created. Signature: ${getSignatureFromTransaction(signedCreateTransactionTx)}`);


  // --- Create Proposal ---
  console.log('\n--- Creating proposal account ---');

  // 7. Derive the PDA for the Proposal account
  const [proposalPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
        new Uint8Array(Buffer.from('smart_account')),
        bs58.decode(smartAccountSettings),
        new Uint8Array(Buffer.from('transaction')),
        new Uint8Array(new BigUint64Array([transactionIndex]).buffer),
        new Uint8Array(Buffer.from('proposal')),
    ]
  });
  console.log(`Proposal PDA: ${proposalPda}`);

  // 8. Create the instruction to create the proposal account
  const createProposalInstruction = getCreateProposalInstruction({
    settings: smartAccountSettings,
    proposal: proposalPda,
    creator: feePayer,
    rentPayer: feePayer,
    systemProgram: address('11111111111111111111111111111111'),
    transactionIndex: transactionIndex,
    draft: false,
  });

  // 9. Build, sign, and send the proposal creation transaction
  const { value: latestBlockhashForProposal } = await rpc.getLatestBlockhash().send();
  const createProposalTx = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(feePayer, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhashForProposal, tx),
    tx => appendTransactionMessageInstructions([createProposalInstruction], tx)
  );

  const signedCreateProposalTx = await signTransactionMessageWithSigners(createProposalTx);
  
  // Validate the transaction
  assertIsTransactionWithinSizeLimit(signedCreateProposalTx);
  
  console.log('Sending proposal creation transaction...');
  await sendAndConfirm(signedCreateProposalTx, { commitment: 'confirmed' });
  const proposalSignature = getSignatureFromTransaction(signedCreateProposalTx);
  console.log('Proposal created successfully! Signature:', proposalSignature);


  // --- Approve Proposal ---
  console.log('\n--- Approving proposal ---');

  // 10. Create the instruction to approve the proposal
  const approveProposalInstruction = getApproveProposalInstruction({
    settings: smartAccountSettings,
    signer: feePayer,
    proposal: proposalPda,
    systemProgram: address('11111111111111111111111111111111'),
    args: { memo: null },
  });

  // 11. Build, sign, and send the approval transaction
  const { value: latestBlockhashForApproval } = await rpc.getLatestBlockhash().send();
  const approveProposalTx = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(feePayer, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhashForApproval, tx),
    tx => appendTransactionMessageInstructions([approveProposalInstruction], tx)
  );

  const signedApproveProposalTx = await signTransactionMessageWithSigners(approveProposalTx);

  // Validate the transaction
  assertIsTransactionWithinSizeLimit(signedApproveProposalTx);

  console.log('Sending approval transaction...');
  await sendAndConfirm(signedApproveProposalTx, { commitment: 'confirmed' });
  const approvalSignature = getSignatureFromTransaction(signedApproveProposalTx);
  console.log('Proposal approved successfully! Signature:', approvalSignature);


  // --- Execute Transaction ---
  console.log('\n--- Executing transaction ---');

  const initialBalance = await rpc.getBalance(feePayer.address).send();
  console.log(`Fee payer balance before execution: ${initialBalance.value} lamports`);

  // 12. Create the instruction to execute the transaction
  const executeTransactionInstruction = getExecuteTransactionInstruction({
    settings: smartAccountSettings,
    proposal: proposalPda,
    transaction: transactionPda,
    signer: feePayer,
  });

  // Add the remaining accounts in the exact order expected by the program:
  // 1. AddressLookupTable accounts (none in our case)
  // 2. Accounts in the order they appear in message.account_keys
  // From our transaction message, the account_keys are in order: [smartAccountPda, feePayer.address, systemProgram]
  // Note: The smart account PDA is a signer in the message but can't be passed as a signer since it's a PDA
  // The fee payer should NOT be a signer here since it's not signing the outer transaction
  executeTransactionInstruction.accounts.push(
    { address: smartAccountPda, role: AccountRole.WRITABLE },
    { address: feePayer.address, role: AccountRole.WRITABLE },
    { address: address('11111111111111111111111111111111'), role: AccountRole.READONLY },
  );
  // 3. Address table lookup accounts (none in our case)

  // 13. Build, sign, and send the execution transaction
  const { value: latestBlockhashForExecution } = await rpc.getLatestBlockhash().send();
  const executeTransactionTx = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayerSigner(feePayer, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhashForExecution, tx),
    tx => appendTransactionMessageInstructions([executeTransactionInstruction], tx)
  );

  const signedExecuteTransactionTx = await signTransactionMessageWithSigners(executeTransactionTx);

  // Validate the transaction
  assertIsTransactionWithinSizeLimit(signedExecuteTransactionTx);

  console.log('Sending execution transaction...');
  await sendAndConfirm(signedExecuteTransactionTx, { commitment: 'confirmed' });
  const executionSignature = getSignatureFromTransaction(signedExecuteTransactionTx);
  console.log('Transaction executed successfully! Signature:', executionSignature);

  // 14. Verify the transfer
  const finalBalance = await rpc.getBalance(feePayer.address).send();
  console.log(`Fee payer balance after execution: ${finalBalance.value} lamports`);

  assert.ok(finalBalance.value > initialBalance.value, 'Final balance should be greater than initial balance');
  console.log('\n✅ End-to-end test successful!');
}

main().catch(console.error); 