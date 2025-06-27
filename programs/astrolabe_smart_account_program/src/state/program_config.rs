use anchor_lang::prelude::*;

use crate::errors::SmartAccountError;

/// Global program configuration account.
#[account]
#[derive(InitSpace)]
pub struct ProgramConfig {
    /// Counter for the number of smart accounts created.
    pub smart_account_index: u128,
    /// The authority which can update the config.
    pub authority: Pubkey,
    /// The lamports amount charged for creating a new smart account.
    /// This fee is sent to the `treasury` account.
    pub smart_account_creation_fee: u64,
    /// The treasury account to send charged fees to.
    pub treasury: Pubkey,
    /// Reserved for future use.
    pub _reserved: [u8; 64],
}

impl ProgramConfig {
    pub fn invariant(&self) -> Result<()> {
        // authority must be non-default.
        require_keys_neq!(
            self.authority,
            Pubkey::default(),
            SmartAccountError::InvalidAccount
        );

        // treasury must be non-default.
        require_keys_neq!(
            self.treasury,
            Pubkey::default(),
            SmartAccountError::InvalidAccount
        );

        Ok(())
    }

    pub fn increment_smart_account_index(&mut self) -> Result<()>   {
        self.smart_account_index = self.smart_account_index.checked_add(1).unwrap();
        Ok(())
    }
}