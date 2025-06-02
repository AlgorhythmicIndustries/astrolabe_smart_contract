import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import * as smartAccount from './sdk/smart-account/src';
import { readFileSync } from 'fs';

const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
const programId = new PublicKey('7tWVnAHd8LLNDx3nWEzBF3dWYUAVRsASxnTqdhJ9aMML');

async function checkAndInitializeProgramConfig() {
  try {
    // Calculate program config PDA
    const [programConfigPda] = smartAccount.getProgramConfigPda({ programId });
    console.log('🔍 Program Config PDA:', programConfigPda.toString());
    
    // Check if it exists
    try {
      const programConfig = await smartAccount.accounts.ProgramConfig.fromAccountAddress(
        connection,
        programConfigPda
      );
      console.log('✅ Program Config already exists!');
      console.log('📊 Smart Account Index:', programConfig.smartAccountIndex.toString());
      console.log('🏛️  Treasury:', programConfig.treasury.toString());
      console.log('👤 Authority:', programConfig.authority.toString());
      return;
    } catch (error) {
      console.log('❌ Program Config does not exist. Need to initialize it.');
    }
    
    // Load authority keypair
    const authorityKeypair = Keypair.fromSecretKey(
      Buffer.from(
        JSON.parse(readFileSync('/home/user/.config/solana/id.json', 'utf-8'))
      )
    );
    
    console.log('👤 Initializing with authority:', authorityKeypair.publicKey.toString());
    
    // Create initialization instruction
    const initIx = smartAccount.generated.createInitializeProgramConfigInstruction(
      {
        programConfig: programConfigPda,
        initializer: authorityKeypair.publicKey,
      },
      {
        args: {
          authority: authorityKeypair.publicKey,
          treasury: authorityKeypair.publicKey, // Use your keypair as treasury for now
          smartAccountCreationFee: 0, // No creation fee
        },
      },
      programId
    );
    
    // Create and send transaction
    const blockhash = (await connection.getLatestBlockhash()).blockhash;
    const message = new TransactionMessage({
      recentBlockhash: blockhash,
      payerKey: authorityKeypair.publicKey,
      instructions: [initIx],
    }).compileToV0Message();
    
    const tx = new VersionedTransaction(message);
    tx.sign([authorityKeypair]);
    
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
    });
    
    console.log('⏳ Confirming transaction...');
    await connection.confirmTransaction(signature);
    
    console.log('✅ Program Config initialized successfully!');
    console.log('📋 Transaction signature:', signature);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkAndInitializeProgramConfig(); 