use anchor_lang::prelude::*;

use super::*;

/// Stores data required for execution of a settings configuration transaction.
/// Settings transactions can perform a predefined set of actions on the Settings PDA, such as adding/removing members,
/// changing the threshold, etc.
#[account]
pub struct SettingsTransaction {
    /// The settings this belongs to.
    pub settings: Pubkey,
    /// Signer on the settings who submitted the transaction.
    pub creator: Pubkey,
    /// The rent collector for the settings transaction account.
    pub rent_collector: Pubkey,
    /// Index of this transaction within the settings.
    pub index: u64,
    /// bump for the transaction seeds.
    pub bump: u8,
    /// Action to be performed on the settings.
    pub actions: Vec<SettingsAction>,
}

impl SettingsTransaction {
    pub fn size(actions: &[SettingsAction]) -> usize {
        let actions_size: usize = actions
            .iter()
            .map(|action| action.borsh_size())
            .sum();

        8 +   // anchor account discriminator
        32 +  // settings
        32 +  // creator
        32 +  // rent_collector
        8 +   // index
        1 +   // bump
        4 +  // actions vector length
        actions_size
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum SettingsAction {
    /// Add a new member to the settings.
    AddSigner { new_signer: SmartAccountSigner },
    /// Remove a member from the settings.
    RemoveSigner { old_signer: Pubkey },
    /// Change the `threshold` of the settings.
    ChangeThreshold { new_threshold: u16 },
    /// Change the `time_lock` of the settings.
    SetTimeLock { new_time_lock: u32 },
    /// Set the `archival_authority` config parameter of the settings.
    SetArchivalAuthority { new_archival_authority: Option<Pubkey> },
}

impl SettingsAction {
    /// Calculate the Borsh-serialized size without heap allocation.
    /// Manual implementation for Anchor 0.31.1 (Borsh 0.10.4) to avoid deprecated get_instance_packed_len.
    pub const fn borsh_size(&self) -> usize {
        1 + // enum discriminator
        match self {
            SettingsAction::AddSigner { .. } => {
                32 + // SmartAccountSigner.key (Pubkey)
                1    // SmartAccountSigner.permissions.mask (u8)
            }
            SettingsAction::RemoveSigner { .. } => 32, // Pubkey
            SettingsAction::ChangeThreshold { .. } => 2, // u16
            SettingsAction::SetTimeLock { .. } => 4, // u32
            SettingsAction::SetArchivalAuthority { new_archival_authority } => {
                1 + // Option discriminator
                if new_archival_authority.is_some() { 32 } else { 0 }
            }
        }
    }
}