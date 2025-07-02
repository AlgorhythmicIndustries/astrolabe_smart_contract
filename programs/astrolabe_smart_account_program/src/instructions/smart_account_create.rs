#![allow(deprecated)]
use std::borrow::Borrow;

use account_events::CreateSmartAccountEvent;
use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_lang::solana_program::native_token::LAMPORTS_PER_SOL;

use crate::errors::SmartAccountError;
use crate::events::*;
use crate::program::AstrolabeSmartAccountProgram;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateSmartAccountArgs {
    /// The authority that can configure the smart account: add/remove signers, change the threshold, etc.
    /// Should be set to `None` for autonomous smart accounts.
    pub settings_authority: Option<Pubkey>,
    /// The number of signatures required to execute a transaction.
    pub threshold: u16,
    /// The signers on the smart account.
    pub signers: Vec<SmartAccountSigner>,
    /// The restricted signers on the smart account.
    pub restricted_signers: Vec<RestrictedSmartAccountSigner>,
    /// How many seconds must pass between transaction voting, settlement, and execution.
    pub time_lock: u32,
    /// The address where the rent for the accounts related to executed, rejected, or cancelled
    /// transactions can be reclaimed. If set to `None`, the rent reclamation feature is turned off.
    pub rent_collector: Option<Pubkey>,
    /// Memo is used for indexing only.
    pub memo: Option<String>,
}

#[derive(Accounts)]
#[instruction(args: CreateSmartAccountArgs)]
pub struct CreateSmartAccount<'info> {
    /// Global program config account.
    #[account(mut, seeds = [SEED_PREFIX, SEED_PROGRAM_CONFIG], bump)]
    pub program_config: Account<'info, ProgramConfig>,

    /// The settings account for the smart account.
    #[account(
        init,
        payer = creator,
        seeds = [
            SEED_PREFIX,
            SEED_SETTINGS,
            (program_config.smart_account_index + 1).to_le_bytes().as_ref()
        ],
        bump,
        space = 8 + 1016
    )]
    pub settings: Account<'info, Settings>,

    /// The treasury where the creation fee is transferred to.
    /// CHECK: validation is performed in the `MultisigCreate::validate()` method.
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    /// The creator of the smart account.
    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub program: Program<'info, AstrolabeSmartAccountProgram>,
}

impl<'info> CreateSmartAccount<'info> {
    fn validate(&self) -> Result<()> {
        //region treasury
        require_keys_eq!(
            self.treasury.key(),
            self.program_config.treasury,
            SmartAccountError::InvalidAccount
        );
        //endregion

        Ok(())
    }

    /// Creates a multisig.
    #[access_control(ctx.accounts.validate())]
    pub fn create_smart_account(
        ctx: Context<'_, '_, 'info, 'info, Self>,
        args: CreateSmartAccountArgs,
    ) -> Result<()> {
        msg!("--- Debug: CreateSmartAccount ---");
        msg!("Required accounts:");
        msg!("  program_config: {}", ctx.accounts.program_config.key());
        msg!("  treasury: {}", ctx.accounts.treasury.key());
        msg!("  creator: {}", ctx.accounts.creator.key());
        msg!("  system_program: {}", ctx.accounts.system_program.key());
        msg!("  program: {}", ctx.accounts.program.key());
        msg!("  settings: {}", ctx.accounts.settings.key());
        msg!("--- End Debug: CreateSmartAccount ---");

        let program_config = &mut ctx.accounts.program_config;
        // Sort the members by pubkey.
        let mut signers = args.signers;
        signers.sort_by_key(|m| m.key);

        let mut restricted_signers = args.restricted_signers;
        restricted_signers.sort_by_key(|m| m.key);

        let settings = &mut ctx.accounts.settings;
        settings.seed = program_config.smart_account_index.checked_add(1).unwrap();
        settings.settings_authority = args.settings_authority.unwrap_or_default();
        settings.threshold = args.threshold;
        settings.time_lock = args.time_lock;
        settings.transaction_index = 0;
        settings.stale_transaction_index = 0;
        settings.archival_authority = Some(Pubkey::default());
        settings.archivable_after = 0;
        settings.bump = ctx.bumps.settings;
        settings.signers = signers;
        settings.restricted_signers = restricted_signers;
        settings.account_utilization = 0;
        settings._reserved1 = 0;
        settings._reserved2 = 0;

        settings.invariant()?;

        // Check if the creation fee is set and transfer the fee to the treasury if necessary.
        let creation_fee = program_config.smart_account_creation_fee;

        if creation_fee > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.creator.to_account_info(),
                        to: ctx.accounts.treasury.to_account_info(),
                    },
                ),
                creation_fee,
            )?;
            msg!("Creation fee: {}", creation_fee / LAMPORTS_PER_SOL);
        }

        // Increment the smart account index.
        program_config.increment_smart_account_index()?;

        // Log Smart Account Creation
        let event = CreateSmartAccountEvent {
            new_settings_pubkey: settings.key(),
            new_settings_content: settings.clone().into_inner(),
        };
        let log_authority_info = LogAuthorityInfo {
            authority: settings.to_account_info(),
            authority_seeds: get_settings_signer_seeds(settings.seed),
            bump: settings.bump,
            program: ctx.accounts.program.to_account_info(),
        };
        SmartAccountEvent::CreateSmartAccountEvent(event).log(&log_authority_info)?;

        Ok(())
    }
}
