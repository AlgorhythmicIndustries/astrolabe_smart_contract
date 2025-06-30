import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { SmartAccountClient } from './src/SmartAccountClient';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Example usage of the improved SmartAccountClient
 * Compare this to the verbose createSmartAccount.ts script!
 */
async function main() {
  // 1. Setup connection and client
  const connection = new Connection('http://localhost:8899', 'confirmed');
  const programId = new PublicKey('97Xsunnsy4C6EET3V3cd2bSd1ArLcdUcihD8CKEjdS4c');
  const client = new SmartAccountClient(connection, programId);

  // 2. Load keypairs (same as before)
  const creatorPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
  const creator = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(creatorPath, 'utf8')))
  );

  const authorityPath = path.join(os.homedir(), '.config', 'solana', 'smart_account_authority.json');
  const authority = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(authorityPath, 'utf8')))
  );

  // 3. Ensure authority has SOL before initializing program config
  await client.ensureAccountsFunded([
    { pubkey: authority.publicKey, label: 'authority' }
  ], 1e9);

  // 4. Initialize program config (one-time setup)
  const isConfigInitialized = await client.isProgramConfigInitialized();
  if (!isConfigInitialized) {
    console.log('🔧 Initializing program config...');
    await client.initializeProgramConfig({
      authority,
      treasury: new PublicKey('4FB6NRK2xy7QxfGG6t6ZsDUcEwuqXYKWDnKgLnH7omAz'),
      smartAccountCreationFee: 10000000, // 0.01 SOL
    });
    console.log('✅ Program config initialized successfully');
  } else {
    console.log('✅ Program config already initialized');
  }

  // 5. Create smart account - MUCH SIMPLER! 🎉
  const signature = await client.createSmartAccount({
    // Required params
    creator,
    threshold: 1,
    signers: [
      SmartAccountClient.createSigner(creator.publicKey), // All permissions by default
    ],
    
    // Optional params (with sensible defaults)
    restrictedSigners: [
      SmartAccountClient.createRestrictedSigner(
        new PublicKey('6o1hMk7a7fAkwEDGG5qxERprjspNb11hxdfAun2NxtdQ')
      ),
    ],
    timeLock: 0,
    memo: 'My first smart account!',
    
    // The client handles:
    // ✅ PDA derivation automatically
    // ✅ Account ordering internally
    // ✅ Auto-funding accounts (if ensureFunding: true)
    // ✅ Sensible defaults for treasury, rent collector, etc.
    ensureFunding: true,
  });

  console.log('\n🎉 Success! Smart account created with signature:', signature);
}

// Example of different permission configurations
async function advancedExample() {
  const connection = new Connection('http://localhost:8899', 'confirmed');
  const client = new SmartAccountClient(connection);
  
  // Load multiple signers
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  const charlie = Keypair.generate();

  await client.createSmartAccount({
    creator: alice,
    threshold: 2, // Require 2 out of 3 signatures
    signers: [
      SmartAccountClient.createSigner(alice.publicKey, {
        initiate: true,
        vote: true,
        execute: true,
      }),
      SmartAccountClient.createSigner(bob.publicKey, {
        initiate: false, // Bob can only vote and execute
        vote: true,
        execute: true,
      }),
      SmartAccountClient.createSigner(charlie.publicKey, {
        initiate: true,
        vote: true,
        execute: false, // Charlie can't execute
      }),
    ],
    settingsAuthority: null, // Autonomous smart account
    timeLock: 60 * 60 * 24, // 24 hour time lock
  });
}

main().catch(console.error); 