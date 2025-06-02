const { PublicKey } = require('@solana/web3.js');

// Calculate Program Config PDA
const programId = new PublicKey('7tWVnAHd8LLNDx3nWEzBF3dWYUAVRsASxnTqdhJ9aMML');
const [programConfigPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('smart_account'), Buffer.from('program_config')],
  programId
);

console.log('Program ID:', programId.toString());
console.log('Program Config PDA:', programConfigPda.toString());

// For settings PDA, we need the account index (let's assume it's 1 for the first account)
const accountIndex = 1;
const [settingsPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from('smart_account'), 
    Buffer.from('settings'), 
    Buffer.from(new Uint8Array(new BigUint64Array([BigInt(accountIndex)]).buffer))
  ],
  programId
);

console.log('Settings PDA (for account index 1):', settingsPda.toString()); 