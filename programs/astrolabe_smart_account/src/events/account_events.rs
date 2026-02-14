use anchor_lang::prelude::*;

use crate::{state::SettingsAction, Settings, SmartAccountCompiledInstruction};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateSmartAccountEvent {
    pub new_settings_pubkey: Pubkey,
    pub new_settings_content: Settings,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SynchronousTransactionEvent {
    pub settings_pubkey: Pubkey,
    pub account_index: u8,
    pub signers: Vec<Pubkey>,
    pub instructions: Vec<SmartAccountCompiledInstruction>,
    pub instruction_accounts: Vec<Pubkey>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SynchronousSettingsTransactionEvent {
    pub settings_pubkey: Pubkey,
    pub signers: Vec<Pubkey>,
    pub settings: Settings,
    pub changes: Vec<SettingsAction>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AuthoritySettingsEvent {
    pub settings: Settings,
    pub settings_pubkey: Pubkey,
    pub authority: Pubkey,
    pub change: SettingsAction,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AuthorityChangeEvent {
    pub settings: Settings,
    pub settings_pubkey: Pubkey,
    pub authority: Pubkey,
    pub new_authority: Option<Pubkey>,
}
