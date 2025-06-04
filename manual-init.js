const { 
  Connection, 
  Keypair, 
  PublicKey, 
  TransactionMessage, 
  VersionedTransaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL 
} = require('@solana/web3.js');
const { readFileSync } = require('fs');

const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
const programId = new PublicKey('7tWVnAHd8LLNDx3nWEzBF3dWYUAVRsASxnTqdhJ9aMML');

// Load the test program config initializer keypair
const initializerKeypair = Keypair.fromSecretKey(
  Buffer.from(
    JSON.parse(readFileSync('./test-program-config-initializer-keypair.json', 'utf-8'))
  )
);

// Load your wallet (for funding if needed)
const wallet = Keypair.fromSecretKey(
  Buffer.from(
    JSON.parse(readFileSync('/home/user/.config/solana/id.json', 'utf-8'))
  )
);

console.log('🔑 Initializer:', initializerKeypair.publicKey.toString());
console.log('🔑 Wallet:', wallet.publicKey.toString());

async function createInitializeProgramConfigInstruction() {
  // Calculate Program Config PDA
  const [programConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('smart_account'), Buffer.from('program_config')],
    programId
  );

  // Create instruction data for initialize_program_config
  // Based on the Anchor IDL, this instruction takes:
  // - authority: PublicKey
  // - treasury: PublicKey  
  // - smartAccountCreationFee: u64
  
  const instructionData = Buffer.alloc(8 + 32 + 32 + 8); // discriminator + authority + treasury + fee
  let offset = 0;

  // Instruction discriminator for initialize_program_config
  // This is computed as the first 8 bytes of sha256("global:initialize_program_config")
  // But since we can't generate the IDL, we'll try the method discriminator approach
  // For Anchor, it's typically: sha256("global:initialize_program_config")[0..8]
  const crypto = require('crypto');
  const discriminator = crypto.createHash('sha256')
    .update('global:initialize_program_config')
    .digest()
    .subarray(0, 8);
  
  discriminator.copy(instructionData, offset);
  offset += 8;

  // Authority (32 bytes)
  wallet.publicKey.toBuffer().copy(instructionData, offset);
  offset += 32;

  // Treasury (32 bytes) 
  wallet.publicKey.toBuffer().copy(instructionData, offset);
  offset += 32;

  // Smart account creation fee (8 bytes, little endian)
  const feeBytes = Buffer.alloc(8);
  feeBytes.writeBigUInt64LE(0n, 0); // Zero fee
  feeBytes.copy(instructionData, offset);

  return new TransactionInstruction({
    keys: [
      {
        pubkey: programConfigPda,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: initializerKeypair.publicKey,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ],
    programId,
    data: instructionData,
  });
}

async function main() {
  try {
    console.log('🚀 Manual Program Config Initialization...');
    
    // Check wallet balance
    const walletBalance = await connection.getBalance(wallet.publicKey);
    console.log('💰 Wallet Balance:', walletBalance / LAMPORTS_PER_SOL, 'SOL');
    
    // Check initializer balance
    const initializerBalance = await connection.getBalance(initializerKeypair.publicKey);
    console.log('💰 Initializer Balance:', initializerBalance / LAMPORTS_PER_SOL, 'SOL');
    
    // Fund initializer if needed
    if (initializerBalance < 0.1 * LAMPORTS_PER_SOL && walletBalance > 1 * LAMPORTS_PER_SOL) {
      console.log('💸 Funding initializer from wallet...');
      const fundIx = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: initializerKeypair.publicKey,
        lamports: 0.5 * LAMPORTS_PER_SOL,
      });
      
      const fundTx = new VersionedTransaction(
        new TransactionMessage({
          recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
          payerKey: wallet.publicKey,
          instructions: [fundIx],
        }).compileToV0Message()
      );
      fundTx.sign([wallet]);
      
      await connection.sendRawTransaction(fundTx.serialize());
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a bit
    }

    // Calculate Program Config PDA
    const [programConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('smart_account'), Buffer.from('program_config')],
      programId
    );
    
    console.log('📋 Program Config PDA:', programConfigPda.toString());
    
    // Check if already exists
    const accountInfo = await connection.getAccountInfo(programConfigPda);
    if (accountInfo) {
      console.log('✅ Program config already exists!');
      console.log('📊 Account size:', accountInfo.data.length, 'bytes');
      console.log('👤 Owner:', accountInfo.owner.toString());
      return;
    }
    
    console.log('⚙️  Creating program config initialization instruction...');
    
    const initIx = await createInitializeProgramConfigInstruction();
    
    // Create and send transaction
    const blockhash = (await connection.getLatestBlockhash()).blockhash;
    const message = new TransactionMessage({
      recentBlockhash: blockhash,
      payerKey: initializerKeypair.publicKey,
      instructions: [initIx],
    }).compileToV0Message();
    
    const tx = new VersionedTransaction(message);
    tx.sign([initializerKeypair]);
    
    console.log('📤 Sending transaction...');
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
    });
    
    console.log('⏳ Confirming transaction...');
    await connection.confirmTransaction(signature);
    
    console.log('✅ Program Config initialized successfully!');
    console.log('📋 Transaction signature:', signature);
    console.log('🏠 Program Config PDA:', programConfigPda.toString());
    
    // Verify the account was created
    const newAccountInfo = await connection.getAccountInfo(programConfigPda);
    if (newAccountInfo) {
      console.log('✅ Verification: Account created successfully');
      console.log('📊 Account size:', newAccountInfo.data.length, 'bytes');
      console.log('👤 Owner:', newAccountInfo.owner.toString());
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.logs) {
      console.error('📝 Transaction logs:');
      error.logs.forEach(log => console.error('  ', log));
    }
  }
}

main(); 