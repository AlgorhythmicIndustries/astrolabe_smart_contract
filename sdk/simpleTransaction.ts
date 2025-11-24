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
    AccountRole,
    assertIsTransactionWithinSizeLimit,
  } from '@solana/kit';
  import { Buffer } from 'buffer';
  import { fetchSettings } from './clients/js/src/generated/accounts/settings';
  import { 
    getCreateTransactionInstruction,
    getCreateProposalInstruction,
    getApproveProposalInstruction,
    getExecuteTransactionInstruction,
    getCloseTransactionInstruction,
  } from './clients/js/src/generated/instructions';
  import { ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS } from './clients/js/src/generated/programs';
  import { getSmartAccountTransactionMessageEncoder } from './clients/js/src/generated/types/smartAccountTransactionMessage';
  import * as bs58 from 'bs58';
  import { deriveSmartAccountInfo, deriveProposalPda, deriveTransactionPda, fetchSmartAccountSettings } from './utils/index';
  
  type SolanaRpc = ReturnType<typeof createSolanaRpc>;



  /**
   * Parameters for the propose-vote-execute workflow
   */
  export type SimpleTransactionParams = {
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
    /** The fee payer for the inner transaction (will be replaced by backend) */
    feePayer: Address;
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
  export type SimpleTransactionResult = {
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
  export async function createSimpleTransaction(
    params: SimpleTransactionParams
  ): Promise<SimpleTransactionResult> {
    console.log('🚀 Starting createSimpleTransaction...');
    console.log('🔍 Params type:', typeof params);
    console.log('🔍 Params is null/undefined:', params == null);
    
    if (params) {
      console.log('🔍 innerTransactionBytes exists:', !!params.innerTransactionBytes);
      console.log('🔍 innerInstructions exists:', !!params.innerInstructions);
      console.log('🔍 innerTransactionBytes type:', typeof params.innerTransactionBytes);
      if (params.innerTransactionBytes) {
        console.log('🔍 innerTransactionBytes length:', params.innerTransactionBytes.length);
      }
    } else {
      console.log('❌ Params is null or undefined!');
    }
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
  
    console.log('🔧 About to destructure params...');
    
    // Destructure safely
    const rpc = params.rpc;
    const smartAccountSettings = params.smartAccountSettings;
    const smartAccountPda = params.smartAccountPda;
    const smartAccountPdaBump = params.smartAccountPdaBump;
    const signer = params.signer;
    const feePayer = params.feePayer;
    const innerInstructions = params.innerInstructions;
    const innerTransactionBytes = params.innerTransactionBytes;
    const memo = params.memo || 'Smart Account Transaction';
    
    console.log('✅ Destructuring completed');
  
    // Validate that we have either instructions or transaction bytes
    if (!innerInstructions && !innerTransactionBytes) {
      throw new Error('Either innerInstructions or innerTransactionBytes must be provided');
    }
    if (innerInstructions && innerTransactionBytes) {
      throw new Error('Cannot provide both innerInstructions and innerTransactionBytes');
    }
  
    console.log('🔧 Step 1: Fetching latest settings state...');
    // 1. Fetch the latest on-chain state for the Settings account
    const settingsData = await fetchSmartAccountSettings(rpc, smartAccountSettings);
    const transactionIndex = settingsData.nextTransactionIndex;
    console.log('✅ Settings fetched:', {
      currentTransactionIndex: settingsData.currentTransactionIndex.toString(),
      nextTransactionIndex: transactionIndex.toString(),
      threshold: settingsData.threshold
    });
  
    console.log('🔧 Step 2: Deriving transaction PDA...');
    // 2. Derive the PDA for the new Transaction account
    const transactionPda = await deriveTransactionPda(smartAccountSettings, transactionIndex);
    console.log('✅ Transaction PDA derived:', transactionPda.toString());
  
    console.log('🔧 Step 3: Deriving proposal PDA...');
    // 3. Derive the PDA for the new Proposal account
    const proposalPda = await deriveProposalPda(smartAccountSettings, transactionIndex);
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
        (tx) => setTransactionMessageFeePayerSigner(createNoopSigner(smartAccountPda), tx), // Inner transaction uses smart account PDA
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
      instructions: decodedMessage.instructions.map((ix: any) => ({
        programIdIndex: ix.programAddressIndex,
        accountIndexes: new Uint8Array(ix.accountIndices ?? []),
        data: ix.data ?? new Uint8Array(),
      })),
      addressTableLookups: [],
    };

    // 🔍 DETAILED DEBUG LOGGING FOR COMPARISON
    console.log('📊 DETAILED SmartAccountMessage structure:');
    console.log('  numSigners:', smartAccountMessage.numSigners);
    console.log('  numWritableSigners:', smartAccountMessage.numWritableSigners);
    console.log('  numWritableNonSigners:', smartAccountMessage.numWritableNonSigners);
    console.log('  accountKeys.length:', smartAccountMessage.accountKeys.length);
    console.log('  accountKeys:', smartAccountMessage.accountKeys.map(key => key.toString()));
    console.log('  instructions.length:', smartAccountMessage.instructions.length);
    smartAccountMessage.instructions.forEach((ix, i) => {
      console.log(`  instruction[${i}]:`, {
        programIdIndex: ix.programIdIndex,
        accountIndexes: Array.from(ix.accountIndexes),
        data: Array.from(ix.data)
      });
    });
    console.log('  addressTableLookups.length:', smartAccountMessage.addressTableLookups.length);

    const transactionMessageBytes = getSmartAccountTransactionMessageEncoder().encode(smartAccountMessage);
    console.log('✅ Smart account transaction message encoded:', {
      messageSize: transactionMessageBytes.length,
      numSigners: smartAccountMessage.numSigners,
      numAccounts: smartAccountMessage.accountKeys.length,
      numInstructions: smartAccountMessage.instructions.length
    });
    
    // 🔍 LOG THE EXACT BYTES FOR COMPARISON
    console.log('📊 Encoded bytes (first 50):', Array.from(transactionMessageBytes.slice(0, 50)));
    console.log('📊 Encoded hex (first 100 chars):', Array.from(transactionMessageBytes.slice(0, 50)).map(b => b.toString(16).padStart(2, '0')).join(''));
  
    // 5. Create the transaction account instruction
    // IMPORTANT: The accountIndex should match the index used when creating the smart account
    // This matches the working example and the expected u8 type in the program
    const createTransactionInstruction = getCreateTransactionInstruction({
      settings: smartAccountSettings,
      transaction: transactionPda,
      creator: signer,
      rentPayer: createNoopSigner(feePayer), // Backend pays for transaction account rent
      systemProgram: address('11111111111111111111111111111111'),
      args: {
        accountIndex: 0, // Use 0 for the primary smart account (default)
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
      rentPayer: createNoopSigner(feePayer), // Backend pays for proposal account rent
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
  
    // 9. Add the required accounts for the inner instructions to the execute instruction
    // This is critical - the execute instruction needs to know about ALL accounts used in the inner transaction
    // The validation in executable_transaction_message.rs requires exactly message.num_all_account_keys() accounts
    
    // We need to identify which accounts in the inner transaction are signers.
    // The decoded message doesn't give us isSigner for static accounts easily without parsing the header byte,
    // but we know for a fact that the feePayer (backend) and the signer (user) MUST be signers if they appear.
    // Failure to mark them as signers in the ExecuteTransaction instruction will cause "Privilege Escalation" errors
    // during CPI if the inner instruction requires them to sign (like CreateAssociatedTokenAccount).
    
    const feePayerStr = feePayer.toString();
    const signerStr = signer.address.toString();

    for (const accountKey of decodedMessage.staticAccounts) {
      const accountKeyStr = accountKey.toString();
      // Default to regular WRITABLE if not a signer
      let role = AccountRole.WRITABLE; 

      // Check if this account should be a signer
      if (accountKeyStr === feePayerStr) {
        // Fee payer is always WRITABLE_SIGNER
        role = AccountRole.WRITABLE_SIGNER;
      } else if (accountKeyStr === signerStr) {
        // User signer is typically WRITABLE_SIGNER (unless read-only signer, but usually writable)
        role = AccountRole.WRITABLE_SIGNER;
      } else {
         // For other accounts, we blindly mark them as WRITABLE for now as the safest bet for remaining accounts
         // (Readonly accounts passed as writable usually works fine, but not vice versa)
         role = AccountRole.WRITABLE;
      }

      executeTransactionInstruction.accounts.push({
        address: accountKey,
        role: role as any, 
      });
    }
  
    // 9. Create close instruction to reclaim rent back to fee payer
    const closeTransactionInstruction = getCloseTransactionInstruction({
      settings: smartAccountSettings,
      proposal: proposalPda,
      transaction: transactionPda,
      proposalRentCollector: feePayer, // Rent goes back to backend fee payer
      transactionRentCollector: feePayer, // Rent goes back to backend fee payer
      systemProgram: address('11111111111111111111111111111111'),
    });
  
    // 10. Combine all instructions into a single transaction
    const allInstructions = [
      createTransactionInstruction,
      createProposalInstruction,
      approveProposalInstruction,
      executeTransactionInstruction,
      closeTransactionInstruction, // Close accounts and reclaim rent
    ];
  
    // 11. Build the final transaction message
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const finalTransactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(createNoopSigner(feePayer), tx), // Use feePayer for gasless transactions
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstructions(allInstructions, tx)
    );
  
    // 12. Compile the transaction to get the buffer
    const compiledTransaction = compileTransaction(finalTransactionMessage);
    
    // 13. Validate transaction size
    assertIsTransactionWithinSizeLimit(compiledTransaction);
  
    return {
      transactionBuffer: new Uint8Array(compiledTransaction.messageBytes),
      transactionPda,
      proposalPda,
      transactionIndex,
    };
  } 