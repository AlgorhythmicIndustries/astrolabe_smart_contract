#![allow(clippy::result_large_err)]
#![deny(arithmetic_overflow)]
#![deny(unused_must_use)]
// #![deny(clippy::arithmetic_side_effects)]
// #![deny(clippy::integer_arithmetic)]

// Re-export anchor_lang for convenience.
pub use anchor_lang;
use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use solana_security_txt::security_txt;

pub use instructions::ProgramConfig;
pub use instructions::*;
pub use state::*;
pub use utils::SmallVec;
pub use events::*;

pub mod errors;
pub mod instructions;
pub mod state;
mod utils;
pub mod events;


#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "Astrolabe Smart Account",
    project_url: "https://astrolabefinance.com",
    contacts: "email:security@astrolabefinance.com",
    policy: "",
    preferred_languages: "en",
    source_code: "https://github.com/AlgorhythmicIndustries/astrolabe_smart_contract",
    auditors: ""
}

#[cfg(not(feature = "testing"))]
declare_id!("aStRoeLaWJCg8wy8wcUGHYBJJaoSUVQrgoUZZdQcWRh");

#[cfg(feature = "testing")]
declare_id!("ASTRjN4RRXupfb6d2HD24ozu8Gbwqf6JmS32UnNeGQ6q");

#[program]
pub mod astrolabe_smart_account {

    use super::*;

    /// Initialize the program config.
    #[instruction(discriminator = [1])]
    pub fn initialize_program_config(
        ctx: Context<InitProgramConfig>,
        args: InitProgramConfigArgs,
    ) -> Result<()> {
        InitProgramConfig::init_program_config(ctx, args)
    }

    /// Set the `authority` parameter of the program config.
    #[instruction(discriminator = [2])]
    pub fn set_program_config_authority(
        ctx: Context<ProgramConfig>,
        args: ProgramConfigSetAuthorityArgs,
    ) -> Result<()> {
        ProgramConfig::set_authority(ctx, args)
    }

    /// Set the `smart_account_creation_fee` parameter of the program config.
    #[instruction(discriminator = [3])]
    pub fn set_program_config_smart_account_creation_fee(
        ctx: Context<ProgramConfig>,
        args: ProgramConfigSetSmartAccountCreationFeeArgs,
    ) -> Result<()> {
        ProgramConfig::set_smart_account_creation_fee(ctx, args)
    }

    /// Set the `treasury` parameter of the program config.
    #[instruction(discriminator = [4])]
    pub fn set_program_config_treasury(
        ctx: Context<ProgramConfig>,
        args: ProgramConfigSetTreasuryArgs,
    ) -> Result<()> {
        ProgramConfig::set_treasury(ctx, args)
    }
    /// Create a smart account.
    #[instruction(discriminator = [5])]
    pub fn create_smart_account<'info>(
        ctx: Context<'_, '_, 'info, 'info, CreateSmartAccount<'info>>,
        args: CreateSmartAccountArgs,
    ) -> Result<()> {
        CreateSmartAccount::create_smart_account(ctx, args)
    }

    /// Add a new signer to the controlled smart account.
    #[instruction(discriminator = [6])]
    pub fn add_signer_as_authority(
        ctx: Context<ExecuteSettingsTransactionAsAuthority>,
        args: AddSignerArgs,
    ) -> Result<()> {
        ExecuteSettingsTransactionAsAuthority::add_signer(ctx, args)
    }

    /// Remove a signer from the controlled smart account.
    #[instruction(discriminator = [7])]
    pub fn remove_signer_as_authority(
        ctx: Context<ExecuteSettingsTransactionAsAuthority>,
        args: RemoveSignerArgs,
    ) -> Result<()> {
        ExecuteSettingsTransactionAsAuthority::remove_signer(ctx, args)
    }

    /// Set the `time_lock` config parameter for the controlled smart account.
    #[instruction(discriminator = [8])]
    pub fn set_time_lock_as_authority(
        ctx: Context<ExecuteSettingsTransactionAsAuthority>,
        args: SetTimeLockArgs,
    ) -> Result<()> {
        ExecuteSettingsTransactionAsAuthority::set_time_lock(ctx, args)
    }

    /// Set the `threshold` config parameter for the controlled smart account.
    #[instruction(discriminator = [9])]
    pub fn change_threshold_as_authority(
        ctx: Context<ExecuteSettingsTransactionAsAuthority>,
        args: ChangeThresholdArgs,
    ) -> Result<()> {
        ExecuteSettingsTransactionAsAuthority::change_threshold(ctx, args)
    }

    /// Set the smart account `settings_authority`.
    #[instruction(discriminator = [10])]
    pub fn set_new_settings_authority_as_authority(
        ctx: Context<ExecuteSettingsTransactionAsAuthority>,
        args: SetNewSettingsAuthorityArgs,
    ) -> Result<()> {
        ExecuteSettingsTransactionAsAuthority::set_new_settings_authority(ctx, args)
    }

    /// Set the smart account `archival_authority`.
    #[instruction(discriminator = [11])]
    pub fn set_archival_authority_as_authority(
        ctx: Context<ExecuteSettingsTransactionAsAuthority>,
        args: SetArchivalAuthorityArgs,
    ) -> Result<()> {
        ExecuteSettingsTransactionAsAuthority::set_archival_authority(ctx, args)
    }

    /// Create a new settings transaction.
    #[instruction(discriminator = [12])]
    pub fn create_settings_transaction(
        ctx: Context<CreateSettingsTransaction>,
        args: CreateSettingsTransactionArgs,
    ) -> Result<()> {
        CreateSettingsTransaction::create_settings_transaction(ctx, args)
    }

    /// Execute a settings transaction.
    /// The transaction must be `Approved`.
    #[instruction(discriminator = [13])]
    pub fn execute_settings_transaction<'info>(
        ctx: Context<'_, '_, 'info, 'info, ExecuteSettingsTransaction<'info>>,
    ) -> Result<()> {
        ExecuteSettingsTransaction::execute_settings_transaction(ctx)
    }

    /// Create a new vault transaction.
    #[instruction(discriminator = [14])]
    pub fn create_transaction(
        ctx: Context<CreateTransaction>,
        args: CreateTransactionArgs,
    ) -> Result<()> {
        CreateTransaction::create_transaction(ctx, args)
    }

    /// Create a transaction buffer account.
    #[instruction(discriminator = [15])]
    pub fn create_transaction_buffer(
        ctx: Context<CreateTransactionBuffer>,
        args: CreateTransactionBufferArgs,
    ) -> Result<()> {
        CreateTransactionBuffer::create_transaction_buffer(ctx, args)
    }

    /// Close a transaction buffer account.
    #[instruction(discriminator = [16])]
    pub fn close_transaction_buffer(ctx: Context<CloseTransactionBuffer>) -> Result<()> {
        CloseTransactionBuffer::close_transaction_buffer(ctx)
    }

    /// Extend a transaction buffer account.
    #[instruction(discriminator = [17])]
    pub fn extend_transaction_buffer(
        ctx: Context<ExtendTransactionBuffer>,
        args: ExtendTransactionBufferArgs,
    ) -> Result<()> {
        ExtendTransactionBuffer::extend_transaction_buffer(ctx, args)
    }

    /// Create a new vault transaction from a completed transaction buffer.
    /// Finalized buffer hash must match `final_buffer_hash`
    #[instruction(discriminator = [18])]
    pub fn create_transaction_from_buffer<'info>(
        ctx: Context<'_, '_, 'info, 'info, CreateTransactionFromBuffer<'info>>,
        args: CreateTransactionArgs,
    ) -> Result<()> {
        CreateTransactionFromBuffer::create_transaction_from_buffer(ctx, args)
    }

    /// Execute a smart account transaction.
    /// The transaction must be `Approved`.
    #[instruction(discriminator = [19])]
    pub fn execute_transaction(ctx: Context<ExecuteTransaction>) -> Result<()> {
        ExecuteTransaction::execute_transaction(ctx)
    }

    /// Create a new batch.
    #[instruction(discriminator = [20])]
    pub fn create_batch(ctx: Context<CreateBatch>, args: CreateBatchArgs) -> Result<()> {
        CreateBatch::create_batch(ctx, args)
    }

    /// Add a transaction to the batch.
    #[instruction(discriminator = [21])]
    pub fn add_transaction_to_batch(
        ctx: Context<AddTransactionToBatch>,
        args: AddTransactionToBatchArgs,
    ) -> Result<()> {
        AddTransactionToBatch::add_transaction_to_batch(ctx, args)
    }

    /// Execute a transaction from the batch.
    #[instruction(discriminator = [22])]
    pub fn execute_batch_transaction(ctx: Context<ExecuteBatchTransaction>) -> Result<()> {
        ExecuteBatchTransaction::execute_batch_transaction(ctx)
    }

    /// Create a new smart account proposal.
    #[instruction(discriminator = [23])]
    pub fn create_proposal(ctx: Context<CreateProposal>, args: CreateProposalArgs) -> Result<()> {
        CreateProposal::create_proposal(ctx, args)
    }

    /// Update status of a smart account proposal from `Draft` to `Active`.
    #[instruction(discriminator = [24])]
    pub fn activate_proposal(ctx: Context<ActivateProposal>) -> Result<()> {
        ActivateProposal::activate_proposal(ctx)
    }

    /// Approve a smart account proposal on behalf of the `member`.
    /// The proposal must be `Active`.
    #[instruction(discriminator = [25])]
    pub fn approve_proposal(ctx: Context<VoteOnProposal>, args: VoteOnProposalArgs) -> Result<()> {
        VoteOnProposal::approve_proposal(ctx, args)
    }

    /// Reject a smart account proposal on behalf of the `member`.
    /// The proposal must be `Active`.
    #[instruction(discriminator = [26])]
    pub fn reject_proposal(ctx: Context<VoteOnProposal>, args: VoteOnProposalArgs) -> Result<()> {
        VoteOnProposal::reject_proposal(ctx, args)
    }

    /// Cancel a smart account proposal on behalf of the `member`.
    /// The proposal must be `Approved`.
    #[instruction(discriminator = [27])]
    pub fn cancel_proposal(ctx: Context<VoteOnProposal>, args: VoteOnProposalArgs) -> Result<()> {
        VoteOnProposal::cancel_proposal(ctx, args)
    }

    /// Closes a `SettingsTransaction` and the corresponding `Proposal`.
    /// `transaction` can be closed if either:
    /// - the `proposal` is in a terminal state: `Executed`, `Rejected`, or `Cancelled`.
    /// - the `proposal` is stale.
    #[instruction(discriminator = [28])]
    pub fn close_settings_transaction(ctx: Context<CloseSettingsTransaction>) -> Result<()> {
        CloseSettingsTransaction::close_settings_transaction(ctx)
    }

    /// Closes a `Transaction` and the corresponding `Proposal`.
    /// `transaction` can be closed if either:
    /// - the `proposal` is in a terminal state: `Executed`, `Rejected`, or `Cancelled`.
    /// - the `proposal` is stale and not `Approved`.
    #[instruction(discriminator = [29])]
    pub fn close_transaction(ctx: Context<CloseTransaction>) -> Result<()> {
        CloseTransaction::close_transaction(ctx)
    }

    /// Closes a `BatchTransaction` belonging to the `batch` and `proposal`.
    /// `transaction` can be closed if either:
    /// - it's marked as executed within the `batch`;
    /// - the `proposal` is in a terminal state: `Executed`, `Rejected`, or `Cancelled`.
    /// - the `proposal` is stale and not `Approved`.
    #[instruction(discriminator = [30])]
    pub fn close_batch_transaction(ctx: Context<CloseBatchTransaction>) -> Result<()> {
        CloseBatchTransaction::close_batch_transaction(ctx)
    }

    /// Closes Batch and the corresponding Proposal accounts for proposals in terminal states:
    /// `Executed`, `Rejected`, or `Cancelled` or stale proposals that aren't `Approved`.
    ///
    /// This instruction is only allowed to be executed when all `VaultBatchTransaction` accounts
    /// in the `batch` are already closed: `batch.size == 0`.
    #[instruction(discriminator = [31])]
    pub fn close_batch(ctx: Context<CloseBatch>) -> Result<()> {
        CloseBatch::close_batch(ctx)
    }

    /// Synchronously execute a transaction
    #[instruction(discriminator = [32])]
    pub fn execute_transaction_sync(
        ctx: Context<SyncTransaction>,
        args: SyncTransactionArgs,
    ) -> Result<()> {
        SyncTransaction::sync_transaction(ctx, args)
    }

    /// Synchronously execute a config transaction
    #[instruction(discriminator = [33])]
    pub fn execute_settings_transaction_sync<'info>(
        ctx: Context<'_, '_, 'info, 'info, SyncSettingsTransaction<'info>>,
        args: SyncSettingsTransactionArgs,
    ) -> Result<()> {
        SyncSettingsTransaction::sync_settings_transaction(ctx, args)
    }
    /// Log an event
    #[instruction(discriminator = [34])]
    pub fn log_event<'info>(ctx: Context<'_, '_, 'info, 'info, LogEvent<'info>>, args: LogEventArgs) -> Result<()> {
        LogEvent::log_event(ctx, args)
    }
}
