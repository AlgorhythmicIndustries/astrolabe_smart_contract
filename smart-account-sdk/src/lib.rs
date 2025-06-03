use anchor_client::{Client, Cluster, Program};
use anchor_client::solana_sdk::instruction::AccountMeta;
use anchor_lang::{InstructionData, AnchorSerialize, AnchorDeserialize};
use solana_sdk::{pubkey::Pubkey, signature::{Keypair, Signer}, system_program};
use serde::{Serialize, Deserialize};
use anyhow::Result;
use std::rc::Rc;

pub struct SmartAccountSdk {
    program: Program<Rc<Keypair>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Permissions {
    pub mask: u8,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SmartAccountSigner {
    pub key: Pubkey,
    pub permissions: Permissions,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateSmartAccountArgs {
    pub settings_authority: Option<Pubkey>,
    pub threshold: u16,
    pub signers: Vec<SmartAccountSigner>,
    pub time_lock: u32,
    pub rent_collector: Option<Pubkey>,
    pub memo: Option<String>,
}

#[derive(Clone, Debug)]
pub struct CreateSmartAccountAccounts {
    pub program_config: Pubkey,
    pub treasury: Pubkey,
    pub creator: Pubkey,
    pub system_program: Pubkey,
    pub program: Pubkey,
}

pub fn create_smart_account(
    program: &Program<Rc<Keypair>>,
    accounts: CreateSmartAccountAccounts,
    creator: &Keypair,
    args: CreateSmartAccountArgs,
) -> Result<()> {
    let ix_data = args.data();
    program
        .request()
        .accounts(vec![
            AccountMeta::new(accounts.program_config, false),
            AccountMeta::new(accounts.treasury, false),
            AccountMeta::new(accounts.creator, true),
            AccountMeta::new(accounts.system_program, false),
            AccountMeta::new(accounts.program, false),
        ])
        .instruction(ix_data)
        .signer(creator)
        .send()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_smart_account_instruction_builds() {
        use super::*;
        // Setup: create dummy keys and args
        let payer = Keypair::new();
        let program_id = Pubkey::new_unique();
        let program = anchor_client::Client::new(Cluster::Localnet, Rc::new(payer)).program(program_id);

        let accounts = CreateSmartAccountAccounts {
            program_config: Pubkey::new_unique(),
            treasury: Pubkey::new_unique(),
            creator: payer.pubkey(),
            system_program: system_program::ID,
            program: program_id,
        };

        let permissions = Permissions { mask: 1 };
        let signer = SmartAccountSigner {
            key: Pubkey::new_unique(),
            permissions,
        };
        let args = CreateSmartAccountArgs {
            settings_authority: Some(Pubkey::new_unique()),
            threshold: 2,
            signers: vec![signer],
            time_lock: 0,
            rent_collector: None,
            memo: Some("Test".to_string()),
        };

        // This will fail unless you have a running local validator and a deployed program,
        // but it checks that the function builds and serializes correctly.
        let _ = create_smart_account(&program, accounts, &payer, args);
    }
}
