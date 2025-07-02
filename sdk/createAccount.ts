import {
    pipe,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    createKeyPairFromBytes,
    createSignerFromKeyPair,
    airdropFactory,
    createTransactionMessage,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
    signTransactionMessageWithSigners,
    sendAndConfirmTransactionFactory,
    lamports,
    createNoopSigner,
    NoopSigner,
    Address,
    address,
    getProgramDerivedAddress,
  } from '@solana/kit';
  import fs from 'fs';
  import {
    getCreateSmartAccountInstructionAsync,
    getInitializeProgramConfigInstruction,
  } from '../clients/js/src/generated/instructions';
  import {
    fetchProgramConfig,
  } from '../clients/js/src/generated/accounts/programConfig';
  import {
    ASTROLABE_SMART_ACCOUNT_PROGRAM_ADDRESS,
  } from '../clients/js/src/generated/programs';

  export async function createSmartAccountTx(signer: NoopSigner, rpcUrl: string, programConfig: string, treasury: string, rentCollector: string, memo: string) {
    const rpc = createSolanaRpc(rpcUrl);
    const latestBlockhash = await rpc.getLatestBlockhash().send();

    const instruction = await getCreateSmartAccountInstructionAsync({
        programConfig: address(programConfig),
        treasury: address(treasury),
    })
  }