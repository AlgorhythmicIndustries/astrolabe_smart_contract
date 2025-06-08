import {
  AccountMeta,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import {
  SmartAccountInstruction,
  PROGRAM_ID,
  SmartAccountSigner,
  RestrictedSmartAccountSigner,
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
  restrictedSigners: RestrictedSmartAccountSigner[];
  timeLock: number;
  rentCollector: PublicKey | null;
  memo?: string;
  programId?: PublicKey;
  remainingAccounts?: AccountMeta[];
}): TransactionInstruction {
  const programConfigPda = getProgramConfigPda({ programId })[0];
  const anchorRemainingAccounts: AccountMeta[] = [
    ...(settings
      ? [
          {
            pubkey: settings,
            isSigner: false,
            isWritable: true,
          },
        ]
      : []),
    ...(remainingAccounts ?? []),
  ];
  return SmartAccountInstruction(
    {
      programConfig: programConfigPda,
      treasury,
      creator,
      systemProgram: SystemProgram.programId,
      program: programId,
      anchorRemainingAccounts,
    },
    {
      args: {
        settingsAuthority,
        threshold,
        signers,
        restrictedSigners,
        timeLock,
        rentCollector,
        memo: memo ?? null,
      },
    },
    programId
  );
}
