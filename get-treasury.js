const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
const programId = new PublicKey('7tWVnAHd8LLNDx3nWEzBF3dWYUAVRsASxnTqdhJ9aMML');

async function main() {
  const [programConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('smart_account'), Buffer.from('program_config')],
    programId
  );

  const programConfigInfo = await connection.getAccountInfo(programConfigPda);
  if (!programConfigInfo) {
    throw new Error('Program config not found');
  }

  // Parse the data correctly
  const data = programConfigInfo.data;
  
  // smart_account_index at offset 8 (u128, 16 bytes)
  const smartAccountIndex = data.readBigUInt64LE(8); // Read as u64 for now
  console.log('Smart Account Index:', smartAccountIndex.toString());
  
  // authority at offset 24 (32 bytes)  
  const authority = new PublicKey(data.subarray(24, 56));
  console.log('Authority:', authority.toString());
  
  // smart_account_creation_fee at offset 56 (u64, 8 bytes)
  const creationFee = data.readBigUInt64LE(56);
  console.log('Creation Fee:', creationFee.toString(), 'lamports');
  
  // treasury at offset 64 (32 bytes)
  const treasury = new PublicKey(data.subarray(64, 96));
  console.log('Treasury:', treasury.toString());
}

main().catch(console.error); 