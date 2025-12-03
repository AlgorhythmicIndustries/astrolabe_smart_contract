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
    sendAndConfirmTransactionFactory,
    assertIsSendableTransaction,
    lamports,
    address,
    getProgramDerivedAddress,
  } from '@solana/kit';
  import fs from 'fs';
  import {
    getInitializeProgramConfigInstruction,
  } from '../clients/js/src/generated/instructions';
  import {
    ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
  } from '../clients/js/src/generated/programs';
  import {
    getSetComputeUnitLimitInstruction,
    getSetComputeUnitPriceInstruction,
  } from '@solana-program/compute-budget';
  
  async function main() {
    console.log('🚀 Initializing Astrolabe Smart Account Program Config on Mainnet-Beta');
    console.log('');
  
    // Set up connection to mainnet-beta
    const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
    const rpcSubscriptions = createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com');
  
    // Load the initializer keypair (hard-coded required signer)
    const initializerKeypairFile = fs.readFileSync('/Users/algorhythmic/.config/solana/astro_deployer.json');
    const initializerKeypairBytes = new Uint8Array(JSON.parse(initializerKeypairFile.toString()));
    const initializerKeypair = await createKeyPairFromBytes(initializerKeypairBytes);
    const initializerSigner = await createSignerFromKeyPair(initializerKeypair);
  
    console.log('Initializer (must sign):', initializerSigner.address);
    console.log('Expected address: DEpLcxgnnHj3Qg2ogpxWVsTRhuFbXu7KBFY1LvmJJgpf');
    
    if (initializerSigner.address !== 'DEpLcxgnnHj3Qg2ogpxWVsTRhuFbXu7KBFY1LvmJJgpf') {
      console.error('❌ ERROR: Initializer keypair does not match expected address!');
      console.error('   Make sure /Users/algorhythmic/.config/solana/astro_deployer.json is correct.');
      return;
    }
    
    const feePayerSigner = initializerSigner;
  
    console.log('Rent Payer (pays fees):', feePayerSigner.address);
    
    // Your multisig address (will be set as authority)
    const multisigAuthority = address('6o1hMk7a7fAkwEDGG5qxERprjspNb11hxdfAun2NxtdQ');
    console.log('Authority (multisig):', multisigAuthority);
    console.log('');
    
    // Check balances
    const { value: initializerBalance } = await rpc.getBalance(initializerSigner.address).send();
    const { value: feePayerBalance } = await rpc.getBalance(feePayerSigner.address).send();
    
    console.log(`Initializer balance: ${Number(initializerBalance) / 1e9} SOL`);
    console.log(`Rent Payer balance: ${Number(feePayerBalance) / 1e9} SOL`);
    
    if (feePayerBalance < 10_000_000n) {
      console.error('❌ Rent payer needs at least 0.01 SOL for transaction fees and rent');
      return;
    }
    console.log('');
  
    console.log('Program Address:', ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS);
  
    // Derive program config PDA
    const [programConfigPda] = await getProgramDerivedAddress({
      programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
      seeds: [
        new Uint8Array(Buffer.from('smart_account')),
        new Uint8Array(Buffer.from('program_config')),
      ],
    });
    console.log('Program Config PDA:', programConfigPda);
  
    // Derive treasury PDA
    const [treasuryPda] = await getProgramDerivedAddress({
      programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
      seeds: [
        new Uint8Array(Buffer.from('smart_account')),
        new Uint8Array(Buffer.from('treasury')),
      ],
    });
    console.log('Treasury PDA:', treasuryPda);
    console.log('');
  
    // Build initialize program config instruction
    const instruction = await getInitializeProgramConfigInstruction({
      programConfig: programConfigPda,
      initializer: initializerSigner,    // Must sign (hard-coded requirement)
      feePayer: feePayerSigner,        // Pays rent (can be any wallet)
      systemProgram: address('11111111111111111111111111111111'),
      authority: multisigAuthority,      // Your multisig becomes authority
      smartAccountCreationFee: lamports(0n),
      treasury: treasuryPda,
    });
  
    // Get latest blockhash
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  
    // Build transaction (rent payer is also fee payer)
    const transactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(feePayerSigner, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstructions([
        getSetComputeUnitLimitInstruction({ units: 200_000 }),
        getSetComputeUnitPriceInstruction({ microLamports: 100_000 }), // 0.1 SOL priority fee
        instruction
      ], tx)
    );
  
    // Sign with BOTH signers (initializer + rent payer)
    const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
    assertIsSendableTransaction(signedTransaction);
  
    console.log('📝 Transaction built and signed by both accounts');
    console.log('');
    console.log('⚠️  READY TO SEND TO MAINNET-BETA');
    console.log('   This will initialize the program config with:');
    console.log(`   - Authority: ${multisigAuthority} (your multisig)`);
    console.log('   - Creation Fee: 0 SOL');
    console.log('   - Initializer: DEpLcxgnnHj3Qg2ogpxWVsTRhuFbXu7KBFY1LvmJJgpf');
    console.log('');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
  
    console.log('');
    console.log('🚀 Sending transaction to mainnet...');
    
    const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
    const signature = await sendAndConfirm(signedTransaction, { commitment: 'confirmed' });
    
    console.log('');
    console.log('✅ SUCCESS! Program config initialized on mainnet-beta');
    console.log(`📋 Signature: ${signature}`);
    console.log(`🔗 Explorer: https://solscan.io/tx/${signature}`);
    console.log('');
    console.log(`🎉 Your multisig (${multisigAuthority}) is now the program authority!`);
  }
  
  main().catch(console.error);