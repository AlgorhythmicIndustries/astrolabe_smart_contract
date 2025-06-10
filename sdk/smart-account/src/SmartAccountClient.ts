import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
} from '@solana/web3.js';
import BN from 'bn.js';
import {
  SmartAccountSigner,
  RestrictedSmartAccountSigner,
  ProgramConfig,
  PROGRAM_ID,
} from './generated';
import { createSmartAccount } from './instructions/createSmartAccount';
import { createInitializeProgramConfigInstruction } from './generated/instructions/initialize_program_config';
import { getProgramConfigPda } from './pda';

export interface CreateSmartAccountParams {
  // Required
  creator: Keypair;
  threshold: number;
  signers: SmartAccountSigner[];
  
  // Optional with sensible defaults
  treasury?: PublicKey;
  settingsAuthority?: PublicKey | null;
  restrictedSigners?: RestrictedSmartAccountSigner[];
  timeLock?: number;
  rentCollector?: PublicKey | null;
  memo?: string;
  programId?: PublicKey;
  
  // Auto-funding options
  ensureFunding?: boolean;
  minimumBalance?: number;
}

export interface InitializeProgramConfigParams {
  authority: Keypair;
  treasury: PublicKey;
  smartAccountCreationFee?: number;
  programId?: PublicKey;
}

export class SmartAccountClient {
  constructor(
    private connection: Connection,
    private programId: PublicKey = PROGRAM_ID
  ) {}

  /**
   * Creates a smart account with sensible defaults and automatic PDA derivation
   * You don't need to worry about account ordering - this handles it all internally
   */
  async createSmartAccount(params: CreateSmartAccountParams): Promise<string> {
    const {
      creator,
      threshold,
      signers,
      treasury = this.getDefaultTreasury(),
      settingsAuthority = creator.publicKey,
      restrictedSigners = [],
      timeLock = 0,
      rentCollector = this.getDefaultRentCollector(),
      memo,
      programId = this.programId,
      ensureFunding = true,
      minimumBalance = 1e9, // 1 SOL
    } = params;

    // Auto-fund accounts if requested
    if (ensureFunding) {
      await this.ensureAccountsFunded([
        { pubkey: treasury, label: 'treasury' },
        { pubkey: creator.publicKey, label: 'creator' },
        ...(rentCollector ? [{ pubkey: rentCollector, label: 'rentCollector' }] : []),
      ], minimumBalance);
    }

    // Derive all PDAs internally
    const programConfigPda = this.getProgramConfigPda(programId);
    const settingsPda = await this.deriveSettingsPda(programId);

    console.log('🏗️  Creating smart account with derived PDAs:', {
      programConfig: programConfigPda.toBase58(),
      settings: settingsPda.toBase58(),
      treasury: treasury.toBase58(),
      creator: creator.publicKey.toBase58(),
    });

    // Create the instruction (account ordering handled internally)
    const instruction = createSmartAccount({
      treasury,
      creator: creator.publicKey,
      settings: settingsPda,
      settingsAuthority,
      threshold,
      signers,
      restrictedSigners,
      timeLock,
      rentCollector,
      memo,
      programId,
    });

    // Send transaction
    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [creator]
    );

    console.log('✅ Smart account created! Transaction:', signature);
    return signature;
  }

  /**
   * Initialize the program config (one-time setup)
   */
  async initializeProgramConfig(params: InitializeProgramConfigParams): Promise<string> {
    const {
      authority,
      treasury,
      smartAccountCreationFee = 10000000, // 0.01 SOL
      programId = this.programId,
    } = params;

    const programConfigPda = this.getProgramConfigPda(programId);

    const instruction = createInitializeProgramConfigInstruction({
      programConfig: programConfigPda,
      initializer: authority.publicKey,
      systemProgram: SystemProgram.programId,
    }, {
      args: {
        authority: authority.publicKey,
        smartAccountCreationFee,
        treasury,
      }
    });

    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [authority]
    );

    console.log('✅ Program config initialized! Transaction:', signature);
    return signature;
  }

  /**
   * Get the next settings PDA that will be created
   */
  async deriveSettingsPda(programId: PublicKey = this.programId): Promise<PublicKey> {
    const programConfigPda = this.getProgramConfigPda(programId);
    
    // Fetch program config to get current index
    const programConfigAccount = await this.connection.getAccountInfo(programConfigPda);
    if (!programConfigAccount) {
      throw new Error(
        `Program config not found at ${programConfigPda.toBase58()}. ` +
        `Make sure to call initializeProgramConfig() first and that it succeeded.`
      );
    }

    const [programConfig] = ProgramConfig.deserialize(programConfigAccount.data);
    const settingsSeed = new BN(programConfig.smartAccountIndex).addn(1);

    const [settingsPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('smart_account'),
        Buffer.from('settings'),
        settingsSeed.toArrayLike(Buffer, 'le', 16), // 16 bytes for u128
      ],
      programId
    );

    return settingsPda;
  }

  /**
   * Get program config PDA
   */
  getProgramConfigPda(programId: PublicKey = this.programId): PublicKey {
    return getProgramConfigPda({ programId })[0];
  }

  /**
   * Check if program config is initialized
   */
  async isProgramConfigInitialized(programId: PublicKey = this.programId): Promise<boolean> {
    const programConfigPda = this.getProgramConfigPda(programId);
    const account = await this.connection.getAccountInfo(programConfigPda);
    return account !== null && account.data.length > 0;
  }

  /**
   * Ensure accounts have sufficient SOL (useful for testing)
   */
  async ensureAccountsFunded(
    accounts: Array<{ pubkey: PublicKey; label: string }>,
    minimumBalance: number = 1e9
  ): Promise<void> {
    for (const { pubkey, label } of accounts) {
      const balance = await this.connection.getBalance(pubkey);
      if (balance < minimumBalance) {
        console.log(`💰 Airdropping 2 SOL to ${label} (${pubkey.toBase58()})...`);
        const signature = await this.connection.requestAirdrop(pubkey, 2e9);
        await this.connection.confirmTransaction(signature, 'confirmed');
        console.log(`✅ Airdrop to ${label} complete.`);
      } else {
        console.log(`✅ ${label} (${pubkey.toBase58()}) already has sufficient SOL.`);
      }
    }
  }

  /**
   * Helper to create signer objects with permissions
   */
  static createSigner(
    publicKey: PublicKey,
    permissions: { initiate?: boolean; vote?: boolean; execute?: boolean } = {}
  ): SmartAccountSigner {
    const { initiate = true, vote = true, execute = true } = permissions;
    
    let mask = 0;
    if (initiate) mask |= 1; // Permission::Initiate
    if (vote) mask |= 2;     // Permission::Vote
    if (execute) mask |= 4;  // Permission::Execute

    return {
      key: publicKey,
      permissions: { mask },
    };
  }

  /**
   * Helper to create restricted signer objects
   */
  static createRestrictedSigner(
    publicKey: PublicKey,
    permissions: { emergencyExit?: boolean } = {}
  ): RestrictedSmartAccountSigner {
    const { emergencyExit = true } = permissions;
    
    let mask = 0;
    if (emergencyExit) mask |= 8; // RestrictedPermission::EmergencyExit

    return {
      key: publicKey,
      restrictedPermissions: { mask },
    };
  }

  /**
   * Get default treasury (can be overridden)
   */
  private getDefaultTreasury(): PublicKey {
    return new PublicKey('4FB6NRK2xy7QxfGG6t6ZsDUcEwuqXYKWDnKgLnH7omAz');
  }

  /**
   * Get default rent collector (can be overridden)
   */
  private getDefaultRentCollector(): PublicKey {
    return new PublicKey('FRtzUnG1Tya1JbYuCttNyLH2nTX3d6Fe2ZFQQYi94yjw');
  }
} 