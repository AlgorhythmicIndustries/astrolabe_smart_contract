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

// Load your wallet (this will be the signer and creator)
const wallet = Keypair.fromSecretKey(
  Buffer.from(
    JSON.parse(readFileSync('/home/user/.config/solana/id.json', 'utf-8'))
  )
);

console.log('🔑 Wallet:', wallet.publicKey.toString());

async function createSmartAccountInstruction() {
  // Get program config to determine next account index
  const [programConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('smart_account'), Buffer.from('program_config')],
    programId
  );

  // Get current program config data to find the next account index
  const programConfigInfo = await connection.getAccountInfo(programConfigPda);
  if (!programConfigInfo) {
    throw new Error('Program config not found');
  }

  // Parse the smart_account_index from the program config data
  // The index is at offset 8 as a u128 (16 bytes), but we'll read as u64 for now
  const smartAccountIndex = programConfigInfo.data.readBigUInt64LE(8);
  const nextIndex = smartAccountIndex + 1n;
  
  console.log('📊 Current smart account index:', smartAccountIndex.toString());
  console.log('📊 Next smart account index:', nextIndex.toString());

  // Parse the treasury address from program config data (corrected offsets)
  const authority = new PublicKey(programConfigInfo.data.subarray(24, 56));
  const treasury = new PublicKey(programConfigInfo.data.subarray(64, 96));
  
  console.log('📊 Authority:', authority.toString());
  console.log('📊 Treasury:', treasury.toString());

  // Calculate Settings PDA
  const settingsSeed = nextIndex; // This is a u128 (16 bytes), but we're using u64 for now
  const settingsSeedBytes = Buffer.alloc(16);
  settingsSeedBytes.writeBigUInt64LE(settingsSeed, 0); // Write as little endian u128 (first 8 bytes)
  
  const [settingsPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('smart_account'), // SEED_PREFIX
      Buffer.from('settings'),      // SEED_SETTINGS  
      settingsSeedBytes,            // settings_seed as u128 little endian
    ],
    programId
  );

  console.log('🏠 Settings PDA:', settingsPda.toString());

  // Build CreateSmartAccountArgs
  const args = {
    settings_authority: null, // None for autonomous smart account
    threshold: 1, // Only need 1 signature
    signers: [
      {
        key: wallet.publicKey,
        permissions: { mask: 0b111 } // All permissions: Initiate | Vote | Execute
      }
    ],
    time_lock: 0, // No time lock
    rent_collector: wallet.publicKey, // You collect rent for closed accounts
    memo: "Simple Smart Account" // Optional memo
  };

  // Serialize the arguments using Borsh-like encoding
  const argsData = Buffer.alloc(1000); // Allocate plenty of space
  let offset = 0;

  // settings_authority: Option<Pubkey> - None = 0, Some = 1 + 32 bytes
  argsData.writeUInt8(0, offset); // None
  offset += 1;

  // threshold: u16
  argsData.writeUInt16LE(args.threshold, offset);
  offset += 2;

  // signers: Vec<SmartAccountSigner>
  argsData.writeUInt32LE(args.signers.length, offset); // Vec length
  offset += 4;

  // For each signer
  for (const signer of args.signers) {
    // key: Pubkey (32 bytes)
    signer.key.toBuffer().copy(argsData, offset);
    offset += 32;
    
    // permissions.mask: u8
    argsData.writeUInt8(signer.permissions.mask, offset);
    offset += 1;
  }

  // time_lock: u32
  argsData.writeUInt32LE(args.time_lock, offset);
  offset += 4;

  // rent_collector: Option<Pubkey> - Some = 1 + 32 bytes
  argsData.writeUInt8(1, offset); // Some
  offset += 1;
  args.rent_collector.toBuffer().copy(argsData, offset);
  offset += 32;

  // memo: Option<String> - Some = 1 + length + string bytes
  const memoBytes = Buffer.from(args.memo, 'utf8');
  argsData.writeUInt8(1, offset); // Some
  offset += 1;
  argsData.writeUInt32LE(memoBytes.length, offset); // String length
  offset += 4;
  memoBytes.copy(argsData, offset);
  offset += memoBytes.length;

  // Trim to actual size
  const trimmedArgsData = argsData.subarray(0, offset);

  // Create instruction data with discriminator
  const crypto = require('crypto');
  const discriminator = crypto.createHash('sha256')
    .update('global:create_smart_account')
    .digest()
    .subarray(0, 8);

  const instructionData = Buffer.concat([discriminator, trimmedArgsData]);

  return new TransactionInstruction({
    keys: [
      // Main accounts as defined in CreateSmartAccount struct
      {
        pubkey: programConfigPda,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: treasury, // treasury (from program config)
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: wallet.publicKey, // creator
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: programId, // program
        isSigner: false,
        isWritable: false,
      },
      // Remaining accounts: settings PDA (will be created by the program)
      {
        pubkey: settingsPda,
        isSigner: false,
        isWritable: true,
      },
    ],
    programId,
    data: instructionData,
  });
}

async function main() {
  try {
    console.log('🚀 Creating Smart Account...');
    
    // Check balance
    const balance = await connection.getBalance(wallet.publicKey);
    console.log('💰 Balance:', balance / LAMPORTS_PER_SOL, 'SOL');
    
    if (balance < 0.1 * LAMPORTS_PER_SOL) {
      throw new Error('Insufficient balance. Need at least 0.1 SOL');
    }

    console.log('⚙️  Creating smart account instruction...');
    
    const createIx = await createSmartAccountInstruction();
    
    // Create and send transaction
    const blockhash = (await connection.getLatestBlockhash()).blockhash;
    const message = new TransactionMessage({
      recentBlockhash: blockhash,
      payerKey: wallet.publicKey,
      instructions: [createIx],
    }).compileToV0Message();
    
    const tx = new VersionedTransaction(message);
    tx.sign([wallet]);
    
    console.log('📤 Sending transaction...');
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false, // Enable preflight for better error messages
    });
    
    console.log('⏳ Confirming transaction...');
    await connection.confirmTransaction(signature);
    
    console.log('✅ Smart Account created successfully!');
    console.log('📋 Transaction signature:', signature);
    
    // Parse the settings PDA from the transaction logs if needed
    // The settings PDA should be deterministic based on the next account index
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.logs) {
      console.error('📝 Transaction logs:');
      error.logs.forEach(log => console.error('  ', log));
    }
  }
}

main(); 