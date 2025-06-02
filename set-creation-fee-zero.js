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

// Load your wallet (should be the authority)
const wallet = Keypair.fromSecretKey(
  Buffer.from(
    JSON.parse(readFileSync('/home/user/.config/solana/id.json', 'utf-8'))
  )
);

console.log('🔑 Wallet:', wallet.publicKey.toString());

async function createSetCreationFeeInstruction() {
  // Calculate Program Config PDA
  const [programConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('smart_account'), Buffer.from('program_config')],
    programId
  );

  // Create instruction data for set_program_config_smart_account_creation_fee
  const instructionData = Buffer.alloc(8 + 8); // discriminator + new_fee
  let offset = 0;

  // Instruction discriminator for set_program_config_smart_account_creation_fee
  const crypto = require('crypto');
  const discriminator = crypto.createHash('sha256')
    .update('global:set_program_config_smart_account_creation_fee')
    .digest()
    .subarray(0, 8);
  
  discriminator.copy(instructionData, offset);
  offset += 8;

  // new_smart_account_creation_fee: u64 (8 bytes, little endian)
  instructionData.writeBigUInt64LE(0n, offset); // Set to 0

  return new TransactionInstruction({
    keys: [
      {
        pubkey: programConfigPda,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: wallet.publicKey, // authority
        isSigner: true,
        isWritable: false,
      },
    ],
    programId,
    data: instructionData,
  });
}

async function main() {
  try {
    console.log('🚀 Setting creation fee to zero...');
    
    // Check balance
    const balance = await connection.getBalance(wallet.publicKey);
    console.log('💰 Balance:', balance / LAMPORTS_PER_SOL, 'SOL');
    
    console.log('⚙️  Creating set creation fee instruction...');
    
    const setFeeIx = await createSetCreationFeeInstruction();
    
    // Create and send transaction
    const blockhash = (await connection.getLatestBlockhash()).blockhash;
    const message = new TransactionMessage({
      recentBlockhash: blockhash,
      payerKey: wallet.publicKey,
      instructions: [setFeeIx],
    }).compileToV0Message();
    
    const tx = new VersionedTransaction(message);
    tx.sign([wallet]);
    
    console.log('📤 Sending transaction...');
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
    });
    
    console.log('⏳ Confirming transaction...');
    await connection.confirmTransaction(signature);
    
    console.log('✅ Creation fee set to zero successfully!');
    console.log('📋 Transaction signature:', signature);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.logs) {
      console.error('📝 Transaction logs:');
      error.logs.forEach(log => console.error('  ', log));
    }
  }
}

main(); 