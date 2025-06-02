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
        // Calculate the size of actions manually
        let actions_size: usize = actions
            .iter()
            .map(|action| match action {
                SettingsAction::AddSigner { .. } => 1 + 32 + 4, // enum discriminant + pubkey + length
                SettingsAction::RemoveSigner { .. } => 1 + 32, // enum discriminant + pubkey
                SettingsAction::ChangeThreshold { .. } => 1 + 2, // enum discriminant + u16
                SettingsAction::SetTimeLock { .. } => 1 + 4, // enum discriminant + u32
                SettingsAction::AddSpendingLimit { 
                    signers, 
                    destinations, 
                    .. 
                } => {
                    1 + 32 + 1 + 32 + 8 + 4 + 4 + (4 + signers.len() * 32) + (4 + destinations.len() * 32) + 8
                }, // enum discriminant + all fields
                SettingsAction::RemoveSpendingLimit { .. } => 1 + 32, // enum discriminant + pubkey
                SettingsAction::SetArchivalAuthority { new_archival_authority } => {
                    1 + 1 + if new_archival_authority.is_some() { 32 } else { 0 } // enum discriminant + option flag + optional pubkey
                },
            })
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
    /// Change the `time_lock` of the settings.
    AddSpendingLimit {
        /// Key that is used to seed the SpendingLimit PDA.
        seed: Pubkey,
        /// The index of the account that the spending limit is for.
        account_index: u8,
        /// The token mint the spending limit is for.
        mint: Pubkey,
        /// The amount of tokens that can be spent in a period.
        /// This amount is in decimals of the mint,
        /// so 1 SOL would be `1_000_000_000` and 1 USDC would be `1_000_000`.
        amount: u64,
        /// The reset period of the spending limit.
        /// When it passes, the remaining amount is reset, unless it's `Period::OneTime`.
        period: Period,
        /// Members of the settings that can use the spending limit.
        /// In case a member is removed from the settings, the spending limit will remain existent
        /// (until explicitly deleted), but the removed member will not be able to use it anymore.
        signers: Vec<Pubkey>,
        /// The destination addresses the spending limit is allowed to sent funds to.
        /// If empty, funds can be sent to any address.
        destinations: Vec<Pubkey>,
        /// The expiration timestamp of the spending limit.
        /// Non expiring spending limits are set to `i64::MAX`.
        expiration: i64,
    },
    /// Remove a spending limit from the settings.
    RemoveSpendingLimit { spending_limit: Pubkey },
    /// Set the `archival_authority` config parameter of the settings.
    SetArchivalAuthority { new_archival_authority: Option<Pubkey> },
}
