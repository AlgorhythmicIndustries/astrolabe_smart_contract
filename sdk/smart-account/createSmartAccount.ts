import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    sendAndConfirmTransaction,
    Transaction,
} from '@solana/web3.js';
import { createSmartAccount } from './src/instructions/createSmartAccount';
import { SmartAccountSigner, RestrictedSmartAccountSigner } from './src/generated/index';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createInitializeProgramConfigInstruction } from './src/generated/instructions/initialize_program_config';
import { ProgramConfig } from './src/generated/';
import { getProgramConfigPda } from './src/pda';
import BN from 'bn.js';
  
  // 1. Load your creator keypair (replace with your actual secret key)
  const keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
  const creator = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8')))
  );

  const rentCollector = new PublicKey('FRtzUnG1Tya1JbYuCttNyLH2nTX3d6Fe2ZFQQYi94yjw');
  
  // 2. Set up the treasury and restricted signer
  const treasury = new PublicKey('4FB6NRK2xy7QxfGG6t6ZsDUcEwuqXYKWDnKgLnH7omAz'); // Replace with your treasury
  const restrictedSigner = new PublicKey('6o1hMk7a7fAkwEDGG5qxERprjspNb11hxdfAun2NxtdQ');
  
  // 3. Prepare signers
  const signers: SmartAccountSigner[] = [
    {
      key: creator.publicKey,
      permissions: { mask: 7 }, // all permissions for test
    },
  ];
  const restrictedSigners: RestrictedSmartAccountSigner[] = [
    {
      key: restrictedSigner,
      restrictedPermissions: { mask: 8 }, // dummy mask
    },
  ];

  const authorityKeypairPath = path.join(os.homedir(), '.config', 'solana', 'smart_account_authority.json');
  const authority = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(authorityKeypairPath, 'utf8')))
  );
  
  // 4. Connect to local validator
  const connection = new Connection('http://localhost:8899', 'confirmed');
  

  const [programConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('smart_account'), Buffer.from('program_config')], 
    new PublicKey('97Xsunnsy4C6EET3V3cd2bSd1ArLcdUcihD8CKEjdS4c') 
  );

  const programId = new PublicKey('97Xsunnsy4C6EET3V3cd2bSd1ArLcdUcihD8CKEjdS4c');

  console.log('Derived programConfigPda', getProgramConfigPda({ programId })[0].toBase58());
  console.log('Expected PDA:', programConfigPda.toBase58());

  async function ensureAccountHasSol(pubkey: PublicKey, label: string) {
    const balance = await connection.getBalance(pubkey);
    if (balance < 1 * 1e9) { // less than 1 SOL
      console.log(`Airdropping 2 SOL to ${label} (${pubkey.toBase58()})...`);
      const sig = await connection.requestAirdrop(pubkey, 2 * 1e9);
      await connection.confirmTransaction(sig, 'confirmed');
      console.log(`Airdrop to ${label} complete.`);
    } else {
      console.log(`${label} (${pubkey.toBase58()}) already has sufficient SOL.`);
    }
  }

  async function main() {
    await ensureAccountHasSol(treasury, 'treasury');
    await ensureAccountHasSol(authority.publicKey, 'authority');
    await ensureAccountHasSol(rentCollector, 'rentCollector');
    await ensureAccountHasSol(creator.publicKey, 'creator');

    await initializeProgramConfig();

    // Fetch and deserialize the program config account
    const programConfigAccount = await connection.getAccountInfo(programConfigPda);
    if (!programConfigAccount) {
      throw new Error('ProgramConfig account not found');
    }
    const [programConfig] = ProgramConfig.deserialize(programConfigAccount.data);
    const settingsSeed = new BN(programConfig.smartAccountIndex).addn(1); // BN for u128

    const [settingsPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('smart_account'),
        Buffer.from('settings'),
        settingsSeed.toArrayLike(Buffer, 'le', 16), // 16 bytes for u128
      ],
      programId
    );

    console.log('Accounts sent to createSmartAccount:', {
      programConfig: programConfigPda.toBase58(),
      treasury: treasury.toBase58(),
      creator: creator.publicKey.toBase58(),
      systemProgram: SystemProgram.programId.toBase58(),
      program: programId.toBase58(),
      settings: settingsPda.toBase58(),
    });

    const instruction = createSmartAccount({
      treasury,
      creator: creator.publicKey,
      settings: settingsPda,
      settingsAuthority: creator.publicKey,
      threshold: 1,
      signers,
      restrictedSigners,
      timeLock: 0,
      rentCollector: new PublicKey('FRtzUnG1Tya1JbYuCttNyLH2nTX3d6Fe2ZFQQYi94yjw'),
      programId,
    });

    console.log('Instruction keys:', instruction.keys.map(k => ({
      pubkey: k.pubkey.toBase58(),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })));

    // 6. Create and send the transaction
    const tx = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(connection, tx, [creator]);
    console.log('Transaction signature:', signature);
  }
  
  async function initializeProgramConfig() {
    const ix = createInitializeProgramConfigInstruction({
      programConfig: programConfigPda, // the PDA for the config
      initializer: authority.publicKey, 
      systemProgram: SystemProgram.programId,
    }, {
      args: {
        authority: authority.publicKey, // or another admin key
        smartAccountCreationFee: 10000000, 
        treasury: treasury, // your treasury public key
      }
    });
  
    const tx = new Transaction().add(ix);
    await sendAndConfirmTransaction(connection, tx, [authority]);
  }
  
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });