import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  SmartAccountSigner,
  RestrictedSmartAccountSigner,
  PROGRAM_ID,
} from './generated';
import { createSmartAccount } from './instructions/createSmartAccount';
import { getProgramConfigPda } from './pda';
import BN from 'bn.js';

/**
 * Serializable transaction data that can be passed between services
 */
export interface SerializableTransaction {
  /** Base64 encoded transaction */
  transaction: string;
  /** Required signers (public keys) */
  requiredSigners: string[];
  /** Transaction metadata for logging/tracking */
  metadata: {
    type: string;
    smartAccount?: string;
    description?: string;
    [key: string]: any;
  };
}

/**
 * Transaction builder optimized for frontend-to-backend-to-signing workflows
 * Creates transaction buffers that can be serialized and passed between services
 */
export class TransactionBuilder {
  private instructions: TransactionInstruction[] = [];
  private signers: PublicKey[] = [];
  private metadata: Record<string, any> = {};

  constructor(
    private programId: PublicKey = PROGRAM_ID,
    private computeUnitLimit?: number,
    private computeUnitPrice?: number
  ) {}

  /**
   * Add compute budget instructions (useful for complex transactions)
   */
  withComputeBudget(limit: number, pricePerUnit?: number): this {
    if (limit) {
      this.instructions.unshift(
        ComputeBudgetProgram.setComputeUnitLimit({ units: limit })
      );
    }
    if (pricePerUnit) {
      this.instructions.unshift(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: pricePerUnit })
      );
    }
    return this;
  }

  /**
   * Add a create smart account instruction
   */
  createSmartAccount({
    treasury,
    creator,
    settings,
    settingsAuthority,
    threshold,
    signers,
    restrictedSigners = [],
    timeLock = 0,
    rentCollector,
    memo,
  }: {
    treasury: PublicKey;
    creator: PublicKey;
    settings: PublicKey;
    settingsAuthority: PublicKey | null;
    threshold: number;
    signers: SmartAccountSigner[];
    restrictedSigners?: RestrictedSmartAccountSigner[];
    timeLock?: number;
    rentCollector: PublicKey | null;
    memo?: string;
  }): this {
    const instruction = createSmartAccount({
      treasury,
      creator,
      settings,
      settingsAuthority,
      threshold,
      signers,
      restrictedSigners,
      timeLock,
      rentCollector,
      memo,
      programId: this.programId,
    });

    this.instructions.push(instruction);
    this.signers.push(creator);
    this.metadata = {
      type: 'CREATE_SMART_ACCOUNT',
      smartAccount: settings.toBase58(),
      threshold,
      signersCount: signers.length,
      description: memo || `Create smart account with ${signers.length} signers, threshold ${threshold}`,
    };

    return this;
  }

  /**
   * Add a custom instruction (for advanced use cases)
   */
  addInstruction(instruction: TransactionInstruction, requiredSigners: PublicKey[] = []): this {
    this.instructions.push(instruction);
    this.signers.push(...requiredSigners);
    return this;
  }

  /**
   * Set metadata for tracking/logging
   */
  withMetadata(metadata: Record<string, any>): this {
    this.metadata = { ...this.metadata, ...metadata };
    return this;
  }

  /**
   * Build a versioned transaction (modern Solana transaction format)
   */
  buildVersionedTransaction(recentBlockhash: string, feePayer: PublicKey): VersionedTransaction {
    // Add compute budget if specified
    if (this.computeUnitLimit || this.computeUnitPrice) {
      this.withComputeBudget(this.computeUnitLimit || 200_000, this.computeUnitPrice);
    }

    const message = new TransactionMessage({
      payerKey: feePayer,
      recentBlockhash,
      instructions: this.instructions,
    }).compileToV0Message();

    return new VersionedTransaction(message);
  }

  /**
   * Build serializable transaction data for cross-service communication
   * Perfect for your frontend → backend → gRPC → signing service workflow
   */
  buildSerializable(recentBlockhash: string, feePayer: PublicKey): SerializableTransaction {
    const transaction = this.buildVersionedTransaction(recentBlockhash, feePayer);
    
    // Get unique signers
    const uniqueSigners = Array.from(new Set([feePayer, ...this.signers]));

    return {
      transaction: Buffer.from(transaction.serialize()).toString('base64'),
      requiredSigners: uniqueSigners.map(s => s.toBase58()),
      metadata: {
        type: this.metadata.type || 'UNKNOWN',
        ...this.metadata,
        feePayer: feePayer.toBase58(),
        instructionsCount: this.instructions.length,
        createdAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Static method to deserialize a transaction (useful in your backend/signing service)
   */
  static deserialize(serialized: SerializableTransaction): {
    transaction: VersionedTransaction;
    requiredSigners: PublicKey[];
    metadata: any;
  } {
    const transactionBuffer = Buffer.from(serialized.transaction, 'base64');
    const transaction = VersionedTransaction.deserialize(transactionBuffer);
    const requiredSigners = serialized.requiredSigners.map(s => new PublicKey(s));

    return {
      transaction,
      requiredSigners,
      metadata: serialized.metadata,
    };
  }

  /**
   * Helper to create a settings PDA for a given seed
   */
  static deriveSettingsPda(settingsSeed: BN | number, programId: PublicKey = PROGRAM_ID): PublicKey {
    const seed = typeof settingsSeed === 'number' ? new BN(settingsSeed) : settingsSeed;
    const [settingsPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('smart_account'),
        Buffer.from('settings'),
        seed.toArrayLike(Buffer, 'le', 16),
      ],
      programId
    );
    return settingsPda;
  }

  /**
   * Helper to create signer objects with readable permissions
   */
  static createSigner(
    publicKey: PublicKey,
    permissions: { initiate?: boolean; vote?: boolean; execute?: boolean } = {}
  ): SmartAccountSigner {
    const { initiate = true, vote = true, execute = true } = permissions;
    
    let mask = 0;
    if (initiate) mask |= 1;
    if (vote) mask |= 2;
    if (execute) mask |= 4;

    return { key: publicKey, permissions: { mask } };
  }

  /**
   * Reset the builder for reuse
   */
  reset(): this {
    this.instructions = [];
    this.signers = [];
    this.metadata = {};
    return this;
  }
} 