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
    /// Collector account that receives lamports reclaimed when closing
    /// `TransactionBuffer` accounts.
    ///
    /// Backward compatibility note:
    /// older `ProgramConfig` accounts store zeros in this slot (reserved bytes),
    /// so runtime logic falls back to `treasury` when this is default.
    pub buffer_rent_collector: Pubkey,
    /// Reserved for future use.
    pub _reserved: [u8; 32],
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

    pub fn effective_buffer_rent_collector(&self) -> Pubkey {
        if self.buffer_rent_collector == Pubkey::default() {
            self.treasury
        } else {
            self.buffer_rent_collector
        }
    }

    pub fn increment_smart_account_index(&mut self) -> Result<()> {
        self.smart_account_index = self.smart_account_index.checked_add(1).unwrap();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn effective_buffer_collector_falls_back_to_treasury_when_unset() {
        let treasury = Pubkey::new_unique();
        let config = ProgramConfig {
            smart_account_index: 0,
            authority: Pubkey::new_unique(),
            smart_account_creation_fee: 0,
            treasury,
            buffer_rent_collector: Pubkey::default(),
            _reserved: [0u8; 32],
        };
        assert_eq!(config.effective_buffer_rent_collector(), treasury);
    }

    #[test]
    fn effective_buffer_collector_uses_explicit_collector_when_set() {
        let collector = Pubkey::new_unique();
        let config = ProgramConfig {
            smart_account_index: 0,
            authority: Pubkey::new_unique(),
            smart_account_creation_fee: 0,
            treasury: Pubkey::new_unique(),
            buffer_rent_collector: collector,
            _reserved: [0u8; 32],
        };
        assert_eq!(config.effective_buffer_rent_collector(), collector);
    }
}
