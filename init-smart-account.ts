import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as smartAccount from './sdk/smart-account/src';
import { readFileSync } from 'fs';

const { Permission, Permissions } = smartAccount.types;

// Setup connection to localnet
const connection = new Connection('http://127.0.0.1:8899', 'confirmed');

// Your deployed program ID
const programId = new PublicKey('7tWVnAHd8LLNDx3nWEzBF3dWYUAVRsASxnTqdhJ9aMML');

async function initializeSmartAccount() {
  try {
    console.log('🚀 Initializing Smart Account...');
    
    // Load your wallet keypair (this will be both creator and settings authority)
    const creatorKeypair = Keypair.fromSecretKey(
      Buffer.from(
        JSON.parse(readFileSync('/home/user/.config/solana/id.json', 'utf-8'))
      )
    );
    
    console.log('👤 Creator/Settings Authority:', creatorKeypair.publicKey.toString());
    
    // Check balance
    const balance = await connection.getBalance(creatorKeypair.publicKey);
    console.log('💰 Balance:', balance / LAMPORTS_PER_SOL, 'SOL');
    
    if (balance < 0.1 * LAMPORTS_PER_SOL) {
      throw new Error('Insufficient balance. Need at least 0.1 SOL');
    }
    
    // Get program config to find the next account index
    const programConfigPda = smartAccount.getProgramConfigPda({ programId })[0];
    console.log('⚙️  Program Config PDA:', programConfigPda.toString());
    
    const programConfig = await smartAccount.accounts.ProgramConfig.fromAccountAddress(
      connection,
      programConfigPda
    );
    
    const nextAccountIndex = BigInt(programConfig.smartAccountIndex.toString()) + 1n;
    console.log('📊 Next Account Index:', nextAccountIndex.toString());
    
    // Calculate the settings PDA for this account
    const [settingsPda] = smartAccount.getSettingsPda({
      accountIndex: nextAccountIndex,
      programId,
    });
    console.log('🔑 Settings PDA:', settingsPda.toString());
    
    // Create some sample signers (you can modify this)
    const signer1 = Keypair.generate();
    const signer2 = Keypair.generate();
    
    console.log('👥 Signers:');
    console.log('  - Settings Authority (you):', creatorKeypair.publicKey.toString());
    console.log('  - Signer 1:', signer1.publicKey.toString());
    console.log('  - Signer 2:', signer2.publicKey.toString());
    
    // Create the smart account
    console.log('\n📝 Creating smart account transaction...');
    
    const signature = await smartAccount.rpc.createSmartAccount({
      connection,
      treasury: programConfig.treasury,
      creator: creatorKeypair,
      settings: settingsPda,
      settingsAuthority: creatorKeypair.publicKey, // You as the settings authority
      timeLock: 0, // No time lock for immediate execution
      threshold: 2, // Require 2 signatures
      signers: [
        {
          key: creatorKeypair.publicKey,
          permissions: Permissions.all(), // Full permissions for you
        },
        {
          key: signer1.publicKey,
          permissions: Permissions.fromPermissions([Permission.Initiate, Permission.Vote]),
        },
        {
          key: signer2.publicKey,
          permissions: Permissions.fromPermissions([Permission.Vote, Permission.Execute]),
        },
      ],
      rentCollector: creatorKeypair.publicKey, // You collect rent for closed accounts
      sendOptions: { skipPreflight: true },
      programId,
    });
    
    console.log('⏳ Confirming transaction...');
    await connection.confirmTransaction(signature);
    
    console.log('✅ Smart Account created successfully!');
    console.log('📋 Transaction signature:', signature);
    console.log('🏠 Settings PDA:', settingsPda.toString());
    
    // Verify the account was created
    const settingsAccount = await smartAccount.accounts.Settings.fromAccountAddress(
      connection,
      settingsPda
    );
    
    console.log('\n📊 Smart Account Details:');
    console.log('  - Settings Authority:', settingsAccount.settingsAuthority.toString());
    console.log('  - Threshold:', settingsAccount.threshold);
    console.log('  - Number of Signers:', settingsAccount.signers.length);
    console.log('  - Account Index:', settingsAccount.seed.toString());
    
    // Show how to derive smart account PDAs for different indexes
    console.log('\n🔗 Smart Account PDAs:');
    for (let i = 0; i < 3; i++) {
      const [smartAccountPda] = smartAccount.getSmartAccountPda({
        settingsPda,
        accountIndex: i,
        programId,
      });
      console.log(`  - Smart Account ${i}:`, smartAccountPda.toString());
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the script
initializeSmartAccount(); 