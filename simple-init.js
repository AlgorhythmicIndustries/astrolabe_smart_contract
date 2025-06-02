const { 
  Connection, 
  Keypair, 
  PublicKey, 
  TransactionMessage, 
  VersionedTransaction,
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

async function main() {
  try {
    // Check balance
    const balance = await connection.getBalance(wallet.publicKey);
    console.log('💰 Balance:', balance / LAMPORTS_PER_SOL, 'SOL');
    
    // Calculate Program Config PDA
    const [programConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('smart_account'), Buffer.from('program_config')],
      programId
    );
    
    console.log('📋 Program Config PDA:', programConfigPda.toString());
    
    // Check if program config exists
    try {
      const accountInfo = await connection.getAccountInfo(programConfigPda);
      if (accountInfo) {
        console.log('✅ Program config already exists!');
        console.log('📊 Account size:', accountInfo.data.length, 'bytes');
        return;
      }
    } catch (error) {
      console.log('❌ Program config does not exist');
    }
    
    console.log('\n🚨 Program config needs to be initialized first!');
    console.log('🔧 This typically requires specific initialization logic.');
    console.log('💡 You may need to run the project tests first to initialize the program:');
    console.log('   anchor test --detach');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main(); 