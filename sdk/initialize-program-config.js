const {
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
    lamports,
    address,
    getProgramDerivedAddress,
  } = require('@solana/kit');
  const fs = require('fs');
  const {
    getInitializeProgramConfigInstruction,
  } = require('../clients/js/src/generated/instructions');
  const {
    ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
  } = require('../clients/js/src/generated/programs');
  
  (async () => {
    const rpc = createSolanaRpc('http://localhost:8899');
    const rpcSubscriptions = createSolanaRpcSubscriptions('ws://localhost:8900');
  
    // Authority: /home/user/.config/solana/id.json
    const authorityKeypairFile = fs.readFileSync('/home/user/.config/solana/id.json');
    const authorityKeypairBytes = new Uint8Array(JSON.parse(authorityKeypairFile.toString()));
    const authorityKeypair = await createKeyPairFromBytes(authorityKeypairBytes);
    const authoritySigner = await createSignerFromKeyPair(authorityKeypair);
  
    // Initializer: ../test-program-config-initializer-keypair.json (relative to sdk/)
    const initializerKeypairFile = fs.readFileSync('/home/user/Code/squads_SA_fork/test-program-config-initializer-keypair.json');
    const initializerKeypairBytes = new Uint8Array(JSON.parse(initializerKeypairFile.toString()));
    const initializerKeypair = await createKeyPairFromBytes(initializerKeypairBytes);
    const initializerSigner = await createSignerFromKeyPair(initializerKeypair);
  
    // Derive PDAs
    const [programConfigPda] = await getProgramDerivedAddress({
      programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
      seeds: [
        new Uint8Array(Buffer.from('smart_account')),
        new Uint8Array(Buffer.from('program_config')),
      ],
    });
  
    const [treasuryPda] = await getProgramDerivedAddress({
      programAddress: ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
      seeds: [
        new Uint8Array(Buffer.from('smart_account')),
        new Uint8Array(Buffer.from('treasury')),
      ],
    });
  
    // Build instruction
    const instruction = await getInitializeProgramConfigInstruction({
      programConfig: programConfigPda,
      initializer: initializerSigner,
      systemProgram: address('11111111111111111111111111111111'),
      authority: authoritySigner.address,
      smartAccountCreationFee: lamports(10000000n),
      treasury: treasuryPda,
    });
  
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  
    const transactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(initializerSigner, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstructions([instruction], tx)
    );
  
    const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
    const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
    const signature = await sendAndConfirm(signedTransaction, { commitment: 'confirmed' });
    console.log('Program config initialized! Signature:', signature);
  })();