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

// Load your wallet
const wallet = Keypair.fromSecretKey(
  Buffer.from(
    JSON.parse(readFileSync('/home/user/.config/solana/id.json', 'utf-8'))
  )
);

console.log('🔑 Wallet:', wallet.publicKey.toString());

function serializeInitializeProgramConfigArgs(authority, treasury, smartAccountCreationFee) {
  // This is a simplified version - in reality you'd need to match the exact Borsh serialization
  // For now, let's create a basic instruction data structure
  const buffer = Buffer.alloc(1 + 32 + 32 + 8); // discriminator + authority + treasury + fee
  let offset = 0;
  
  // Instruction discriminator (this would need to be the correct hash for initialize_program_config)
  // For now, using a placeholder - you'd need the actual discriminator from the IDL
  buffer.writeUInt8(0, offset); // placeholder discriminator
  offset += 1;
  
  // Authority public key (32 bytes)
  authority.toBuffer().copy(buffer, offset);
  offset += 32;
  
  // Treasury public key (32 bytes)  
  treasury.toBuffer().copy(buffer, offset);
  offset += 32;
  
  // Smart account creation fee (8 bytes, little endian)
  buffer.writeBigUInt64LE(BigInt(smartAccountCreationFee), offset);
  
  return buffer;
}

async function initializeProgramConfig() {
  try {
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
      return;
    }
    
    console.log('🔧 Creating program config initialization instruction...');
    
    // Note: This is a simplified approach. The real instruction would need:
    // 1. Correct instruction discriminator from the IDL
    // 2. Proper Borsh serialization of the args
    // 3. Correct account ordering and metadata
    
    console.log('\n⚠️  IMPORTANT:');
    console.log('To properly initialize the program config, you need:');
    console.log('1. The exact instruction discriminator from the compiled IDL');
    console.log('2. Proper Borsh serialization of arguments');
    console.log('3. The correct account metadata for Anchor');
    console.log('\n💡 Recommended approach:');
    console.log('1. Build the SDK first: `cd sdk/smart-account && npm install --legacy-peer-deps && npm run build`');
    console.log('2. Or run the initialization tests that handle this properly');
    console.log('3. Or use anchor test to initialize the program');
    
    // For demonstration, showing what the instruction structure would look like:
    const instructionData = serializeInitializeProgramConfigArgs(
      wallet.publicKey, // authority
      wallet.publicKey, // treasury (same as authority for simplicity)
      0 // no creation fee
    );
    
    console.log('\n📝 Instruction data structure (for reference):');
    console.log('- Program Config PDA:', programConfigPda.toString());
    console.log('- Authority:', wallet.publicKey.toString());
    console.log('- Treasury:', wallet.publicKey.toString());
    console.log('- Creation Fee: 0');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

initializeProgramConfig(); 