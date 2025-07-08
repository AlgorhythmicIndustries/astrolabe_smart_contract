use anchor_lang::prelude::*;

use crate::errors::*;
use crate::state::*;
use crate::utils::validate_settings_actions;

use crate::state::{Settings, RestrictedSmartAccountSigner, RestrictedPermission};

#[derive(Accounts)]
pub struct RestrictedEmergencyExit<'info> {
    #[account(mut)]
    pub settings: Account<'info, Settings>,
    pub restricted_signer: Signer<'info>,
}

pub fn emergency_exit(ctx: Context<RestrictedEmergencyExit>) -> Result<()> {
    let settings = &ctx.accounts.settings;
    let signer_key = ctx.accounts.restricted_signer.key();
    // Check if the signer is a restricted signer with EmergencyExit permission
    let allowed = settings.restricted_signers.iter().any(|rs| {
        rs.key == signer_key && rs.restricted_permissions.has(RestrictedPermission::EmergencyExit)
    });
    require!(allowed, CustomError::UnauthorizedRestrictedSigner);
    // Stub: actual emergency exit logic goes here
    Ok(())
}

#[error_code]
pub enum CustomError {
    #[msg("Unauthorized restricted signer")] 
    UnauthorizedRestrictedSigner,
}