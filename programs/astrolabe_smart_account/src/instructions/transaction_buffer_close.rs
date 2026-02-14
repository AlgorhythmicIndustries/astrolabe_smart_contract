use anchor_lang::prelude::*;

use crate::errors::*;
use crate::state::*;

#[derive(Accounts)]
pub struct CloseTransactionBuffer<'info> {
    #[account(
        seeds = [SEED_PREFIX, SEED_SETTINGS, settings.seed.to_le_bytes().as_ref()],
        bump = settings.bump,
    )]
    pub settings: Account<'info, Settings>,

    #[account(
        seeds = [SEED_PREFIX, SEED_PROGRAM_CONFIG],
        bump,
    )]
    pub program_config: Account<'info, ProgramConfig>,

    #[account(
        mut,
        // Rent gets returned to the configured collector.
        close = buffer_rent_collector,
        // Only the creator can close the buffer
        constraint = transaction_buffer.creator == creator.key() @ SmartAccountError::Unauthorized,
        // Account can be closed anytime by the creator, regardless of the
        // current settings transaction index
        seeds = [
            SEED_PREFIX,
            settings.key().as_ref(),
            SEED_TRANSACTION_BUFFER,
            creator.key().as_ref(),
            &transaction_buffer.buffer_index.to_le_bytes()
        ],
        bump
    )]
    pub transaction_buffer: Account<'info, TransactionBuffer>,

    /// The signer on the smart account that created the TransactionBuffer.
    pub creator: Signer<'info>,

    /// CHECK: validated in `validate` against `program_config`.
    #[account(mut)]
    pub buffer_rent_collector: UncheckedAccount<'info>,
}

impl CloseTransactionBuffer<'_> {
    fn validate(&self) -> Result<()> {
        require_keys_eq!(
            self.buffer_rent_collector.key(),
            self.program_config.effective_buffer_rent_collector(),
            SmartAccountError::InvalidAccount
        );
        Ok(())
    }

    /// Close a transaction buffer account.
    #[access_control(ctx.accounts.validate())]
    pub fn close_transaction_buffer(ctx: Context<Self>) -> Result<()> {
        Ok(())
    }
}
