import { PublicKey } from "@solana/web3.js";
import {
  SettingsAction,
  createSettingsTransactionInstruction,
  PROGRAM_ID,
} from "../generated";
import { getTransactionPda } from "../pda";

export function createSettingsTransaction({
  settingsPda,
  transactionIndex,
  creator,
  rentPayer,
  actions,
  memo,
  programId = PROGRAM_ID,
}: {
  settingsPda: PublicKey;
  /** Member of the multisig that is creating the transaction. */
  creator: PublicKey;
  /** Payer for the transaction account rent. If not provided, `creator` is used. */
  rentPayer?: PublicKey;
  transactionIndex: bigint;
  actions: SettingsAction[];
  memo?: string;
  programId?: PublicKey;
}) {
  const [transactionPda] = getTransactionPda({
    settingsPda,
    transactionIndex: transactionIndex,
    programId,
  });

  return createSettingsTransactionInstruction(
    {
      settings: settingsPda,
      transaction: transactionPda,
      creator,
      rentPayer: rentPayer ?? creator,
    },
    { args: { actions, memo: memo ?? null } },
    programId
  );
}
