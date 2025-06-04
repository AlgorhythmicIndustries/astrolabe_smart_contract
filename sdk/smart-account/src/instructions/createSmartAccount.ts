import {
  AccountMeta,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createSmartAccountInstruction,
  PROGRAM_ID,
  SmartAccountSigner,
} from "../generated";
import { getProgramConfigPda } from "../pda";

export function createSmartAccount({
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
  programId = PROGRAM_ID,
  remainingAccounts,
}: {
  treasury: PublicKey;
  creator: PublicKey;
  settings?: PublicKey;
  settingsAuthority: PublicKey | null;
  threshold: number;
  signers: SmartAccountSigner[];
  restrictedSigners: SmartAccountSigner[];
  timeLock: number;
  rentCollector: PublicKey | null;
  memo?: string;
  programId?: PublicKey;
  remainingAccounts?: AccountMeta[];
}): TransactionInstruction {
  const programConfigPda = getProgramConfigPda({ programId })[0];
  const settingsAccountMeta: AccountMeta = {
    pubkey: settings ?? PublicKey.default,
    isSigner: false,
    isWritable: true,
  };
  return createSmartAccountInstruction(
    {
      programConfig: programConfigPda,
      treasury,
      creator,
      systemProgram: SystemProgram.programId,
      program: programId,
      anchorRemainingAccounts: [
        settingsAccountMeta,
        ...(remainingAccounts ?? []),
      ],
    },
    {
      args: {
        settingsAuthority,
        threshold,
        signers,
        timeLock,
        rentCollector,
        memo: memo ?? null,
      },
    },
    programId
  );
}
