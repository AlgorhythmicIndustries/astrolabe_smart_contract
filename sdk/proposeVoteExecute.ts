import {
  type Address,
  createNoopSigner,
  getProgramDerivedAddress,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  pipe,
  address,
  compileTransaction,
  createSolanaRpc,
  getCompiledTransactionMessageDecoder,
  type TransactionSigner,
} from '@solana/kit';
import { Buffer } from 'buffer';
import { fetchSettings } from './clients/js/src/generated/accounts/settings';
import { 
  getCreateTransactionInstruction,
  getCreateProposalInstruction,
  getApproveProposalInstruction,
  getExecuteTransactionInstruction,
} from './clients/js/src/generated/instructions';
import { ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS } from './clients/js/src/generated/programs';
import { getSmartAccountTransactionMessageEncoder } from './clients/js/src/generated/types/smartAccountTransactionMessage';
import bs58 from 'bs58';

type SolanaRpc = ReturnType<typeof createSolanaRpc>;

/**
 * Result of deriving smart account info from settings address
 */
export type SmartAccountInfo = {
  /** The smart account PDA that holds funds */
  smartAccountPda: Address;
  /** The settings address (input) */
  settingsAddress: Address;
  /** The account index used for derivation */
  accountIndex: bigint;
  /** The smart account PDA bump seed */
  smartAccountPdaBump: number;
};

/**
 * Derives smart account PDA and related info from a settings address
 * 
 * @param rpc - The RPC client
 * @param settingsAddress - The smart account settings PDA
 * @param accountIndex - Optional account index to use if settings account doesn't exist
 * @returns Smart account info including the PDA and bump
 */
export async function deriveSmartAccountInfo(
  rpc: SolanaRpc,
  settingsAddress: Address,
  accountIndex?: bigint
): Promise<SmartAccountInfo> {
  // Always use account_index = 0 for the primary smart account
  // The accountIndex parameter is kept for compatibility but ignored
  console.log('🔧 Using account index 0 for primary smart account (ignoring any provided accountIndex)');

  // Derive the smart account PDA using account_index = 0 (primary smart account)
  // This matches the working example and the expected u8 type in the program
  console.log('🔧 Deriving smart account PDA with:', {
    settingsAddress: settingsAddress.toString(),
    accountIndex: '0',
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS.toString()
  });

  const [smartAccountPda, smartAccountPdaBump] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      bs58.decode(settingsAddress),
      new Uint8Array(Buffer.from('smart_account')),
      // Use account_index 0 for the primary smart account (matches working example)
      new Uint8Array([0]),
    ],
  });

  console.log('✅ Derived smart account PDA:', {
    smartAccountPda: smartAccountPda.toString(),
    bump: smartAccountPdaBump
  });

  return {
    smartAccountPda,
    settingsAddress,
    accountIndex: 0n, // Always 0 for primary smart account
    smartAccountPdaBump,
  };
}

/**
 * Parameters for the propose-vote-execute workflow
 */
export type ProposeVoteExecuteParams = {
  /** The RPC client to use for fetching on-chain data. */
  rpc: SolanaRpc;
  /** The smart account settings address (PDA) */
  smartAccountSettings: Address;
  /** The smart account PDA that will sign the inner transaction */
  smartAccountPda: Address;
  /** The smart account PDA bump */
  smartAccountPdaBump: number;
  /** The signer who will create proposal, vote, and execute */
  signer: TransactionSigner;
  /** The inner instructions to execute within the smart account */
  innerInstructions?: any[];
  /** Raw transaction bytes (alternative to innerInstructions) - preserves ALT structure */
  innerTransactionBytes?: Uint8Array;
  /** Optional memo for the transaction */
  memo?: string;
};

/**
 * Result of the propose-vote-execute workflow
 */
export type ProposeVoteExecuteResult = {
  /** The serialized transaction buffer ready to be sent to backend */
  transactionBuffer: Uint8Array;
  /** The transaction PDA that was created */
  transactionPda: Address;
  /** The proposal PDA that was created */
  proposalPda: Address;
  /** The transaction index used */
  transactionIndex: bigint;
};

/**
 * High-level function that combines the smart account propose-vote-execute pattern
 * into a single serialized transaction. This creates a transaction, proposal, approves it,
 * and executes it all in one atomic operation.
 * 
 * @param params - The parameters for the workflow
 * @returns Promise resolving to transaction buffer and metadata
 */
export async function createProposeVoteExecuteTransaction(
  params: ProposeVoteExecuteParams
): Promise<ProposeVoteExecuteResult> {
  console.log('🚀 Starting createProposeVoteExecuteTransaction...');
  console.log('🔍 Raw params object:', params);
  console.log('🔍 innerTransactionBytes exists:', !!params.innerTransactionBytes);
  console.log('🔍 innerInstructions exists:', !!params.innerInstructions);
  try {
    console.log('📋 Input params:', {
      smartAccountSettings: params.smartAccountSettings ? params.smartAccountSettings.toString() : 'undefined',
      smartAccountPda: params.smartAccountPda ? params.smartAccountPda.toString() : 'undefined',
      smartAccountPdaBump: params.smartAccountPdaBump,
      signerAddress: params.signer && params.signer.address ? params.signer.address.toString() : 'undefined',
      innerInstructionCount: params.innerInstructions ? params.innerInstructions.length : 'N/A',
      innerTransactionSize: params.innerTransactionBytes ? params.innerTransactionBytes.length : 'N/A',
      memo: params.memo || 'Smart Account Transaction'
    });
  } catch (logError) {
    console.error('❌ Error in logging params:', logError);
    throw logError;
  }

  const {
    rpc,
    smartAccountSettings,
    smartAccountPda,
    smartAccountPdaBump,
    signer,
    innerInstructions,
    innerTransactionBytes,
    memo = 'Smart Account Transaction',
  } = params;

  // Validate that we have either instructions or transaction bytes
  if (!innerInstructions && !innerTransactionBytes) {
    throw new Error('Either innerInstructions or innerTransactionBytes must be provided');
  }
  if (innerInstructions && innerTransactionBytes) {
    throw new Error('Cannot provide both innerInstructions and innerTransactionBytes');
  }

  console.log('🔧 Step 1: Fetching latest settings state...');
  // 1. Fetch the latest on-chain state for the Settings account
  const settings = await fetchSettings(rpc, smartAccountSettings);
  const transactionIndex = settings.data.transactionIndex + 1n;
  console.log('✅ Settings fetched:', {
    currentTransactionIndex: settings.data.transactionIndex.toString(),
    nextTransactionIndex: transactionIndex.toString(),
    threshold: settings.data.threshold
  });

  console.log('🔧 Step 2: Deriving transaction PDA...');
  // 2. Derive the PDA for the new Transaction account
  const [transactionPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      bs58.decode(smartAccountSettings),
      new Uint8Array(Buffer.from('transaction')),
      new Uint8Array(new BigUint64Array([transactionIndex]).buffer),
    ],
  });
  console.log('✅ Transaction PDA derived:', transactionPda.toString());

  console.log('🔧 Step 3: Deriving proposal PDA...');
  // 3. Derive the PDA for the Proposal account
  const [proposalPda] = await getProgramDerivedAddress({
    programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
    seeds: [
      new Uint8Array(Buffer.from('smart_account')),
      bs58.decode(smartAccountSettings),
      new Uint8Array(Buffer.from('transaction')),
      new Uint8Array(new BigUint64Array([transactionIndex]).buffer),
      new Uint8Array(Buffer.from('proposal')),
    ],
  });
  console.log('✅ Proposal PDA derived:', proposalPda.toString());

  console.log('🔧 Step 4: Building inner transaction message...');
  
  let compiledInnerMessage: any;
  
  if (innerTransactionBytes) {
    console.log('🔧 Using raw transaction bytes (preserving ALT structure)...');
    console.log('🔍 Raw transaction bytes type:', typeof innerTransactionBytes);
    console.log('🔍 Raw transaction bytes length:', innerTransactionBytes ? innerTransactionBytes.length : 'undefined');
    
    // Use the raw transaction bytes directly - this preserves ALT structure
    compiledInnerMessage = {
      messageBytes: innerTransactionBytes
    };
    console.log('✅ Raw transaction bytes used:', {
      messageSize: innerTransactionBytes.length
    });
  } else {
    console.log('🔧 Building transaction from individual instructions...');
    // 4. Build and ENCODE the inner transaction message from instructions
    const { value: latestBlockhashForInner } = await rpc.getLatestBlockhash().send();
    console.log('✅ Latest blockhash fetched for inner transaction:', latestBlockhashForInner.blockhash);
    
    const innerTransactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(createNoopSigner(smartAccountPda), tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhashForInner, tx),
      (tx) => appendTransactionMessageInstructions(innerInstructions || [], tx)
    );

    console.log('🔧 Compiling inner transaction message...');
    compiledInnerMessage = compileTransaction(innerTransactionMessage);
  }

  console.log('🔧 Decoding compiled message...');
  console.log('🔍 compiledInnerMessage:', compiledInnerMessage);
  console.log('🔍 messageBytes type:', typeof compiledInnerMessage.messageBytes);
  console.log('🔍 messageBytes length:', compiledInnerMessage.messageBytes ? compiledInnerMessage.messageBytes.length : 'undefined');
  
  const decodedMessage = getCompiledTransactionMessageDecoder().decode(compiledInnerMessage.messageBytes);
  console.log('✅ Message decoded successfully');
  
  console.log('✅ Inner transaction compiled:', {
    staticAccounts: decodedMessage.staticAccounts ? decodedMessage.staticAccounts.length : 'undefined',
    instructions: decodedMessage.instructions ? decodedMessage.instructions.length : 'undefined',
    messageSize: compiledInnerMessage.messageBytes ? compiledInnerMessage.messageBytes.length : 'undefined'
  });

  console.log('🔧 Creating smart account transaction message...');
  // Manually construct the smart account transaction message
  const smartAccountMessage = {
    numSigners: 1,
    numWritableSigners: 1,
    numWritableNonSigners: decodedMessage.staticAccounts.length - 1,
    accountKeys: decodedMessage.staticAccounts,
    instructions: decodedMessage.instructions.map(ix => ({
      programIdIndex: ix.programAddressIndex,
      accountIndexes: new Uint8Array(ix.accountIndices ?? []),
      data: ix.data ?? new Uint8Array(),
    })),
    addressTableLookups: [],
  };

  const transactionMessageBytes = getSmartAccountTransactionMessageEncoder().encode(smartAccountMessage);
  console.log('✅ Smart account transaction message encoded:', {
    messageSize: transactionMessageBytes.length,
    numSigners: smartAccountMessage.numSigners,
    numAccounts: smartAccountMessage.accountKeys.length,
    numInstructions: smartAccountMessage.instructions.length
  });

  // 5. Create the transaction account instruction
  // IMPORTANT: The accountIndex should be 0 for the primary smart account under each settings account
  // This matches the working example and the expected u8 type in the program
  const createTransactionInstruction = getCreateTransactionInstruction({
    settings: smartAccountSettings,
    transaction: transactionPda,
    creator: signer,
    rentPayer: signer,
    systemProgram: address('11111111111111111111111111111111'),
    args: {
      accountIndex: 0, // Use 0 for the primary smart account (matches working example)
      accountBump: smartAccountPdaBump,
      ephemeralSigners: 0,
      transactionMessage: transactionMessageBytes,
      memo,
    },
  });

  // 6. Create the proposal instruction
  const createProposalInstruction = getCreateProposalInstruction({
    settings: smartAccountSettings,
    proposal: proposalPda,
    creator: signer,
    rentPayer: signer,
    systemProgram: address('11111111111111111111111111111111'),
    transactionIndex: transactionIndex,
    draft: false,
  });

  // 7. Create the approve proposal instruction
  const approveProposalInstruction = getApproveProposalInstruction({
    settings: smartAccountSettings,
    signer: signer,
    proposal: proposalPda,
    systemProgram: address('11111111111111111111111111111111'),
    args: { memo: null },
  });

  // 8. Create the execute transaction instruction
  const executeTransactionInstruction = getExecuteTransactionInstruction({
    settings: smartAccountSettings,
    proposal: proposalPda,
    transaction: transactionPda,
    signer: signer,
  });

  // Add the required accounts for the inner instructions to the execute instruction
  // This is critical - the execute instruction needs to know about ALL accounts used in the inner transaction
  // The validation in executable_transaction_message.rs requires exactly message.num_all_account_keys() accounts
  for (const accountKey of decodedMessage.staticAccounts) {
    executeTransactionInstruction.accounts.push({
      address: accountKey,
      role: 1, // AccountRole.WRITABLE - simplified for now, would need proper role detection
    });
  }

  // 9. Combine all instructions into a single transaction
  const allInstructions = [
    createTransactionInstruction,
    createProposalInstruction,
    approveProposalInstruction,
    executeTransactionInstruction,
  ];

  // 10. Build the final transaction message
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const finalTransactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(signer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions(allInstructions, tx)
  );

  // 11. Compile the transaction to get the buffer
  const compiledTransaction = compileTransaction(finalTransactionMessage);

  return {
    transactionBuffer: new Uint8Array(compiledTransaction.messageBytes),
    transactionPda,
    proposalPda,
    transactionIndex,
  };
} 