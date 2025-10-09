# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Astrolabe Smart Account program for Solana - a multi-signature smart wallet solution built with Anchor framework. The project consists of:

- **Rust Program** (`programs/astrolabe_smart_account/`): Core Solana program implementing smart account functionality
- **SDK** (`sdk/`): TypeScript SDK with auto-generated client bindings and high-level functions
- **Generated Clients** (`sdk/clients/`): Auto-generated TypeScript and Rust client libraries from IDL

**Program ID**: `ASTRjN4RRXupfb6d2HD24ozu8Gbwqf6JmS32UnNeGQ6q`

## Development Commands

### Building
- `anchor build` - Compile the Solana program
- `turbo run build` - Build all workspace packages including SDK
- `cd sdk && npm run build` - Build just the SDK

### Testing
- `npm run test` - Run anchor tests with program features
- `npm run test:detached` - Run tests in detached mode
- `cd sdk && npm test` - Run SDK integration tests (requires specific order)

### SDK Test Commands (Must Run in Order)
```bash
cd sdk
npm run test:setup      # Initialize program configß
npm run test:create     # Create smart account
npm run test:simple     # Test transactions
npm run test:buffered   # Test complex buffered transaction
```

### Code Generation
- `npx @codama/cli generate` - Regenerate client bindings from IDL using Codama

## Architecture

### Smart Account Features
- **Multi-signature transactions**: Support for threshold-based authorization
- **Transaction batching**: Group multiple transactions for atomic execution  
- **Buffered transactions**: Large transactions split across multiple instructions
- **Spending limits**: Configure per-signer spending restrictions
- **Proposals system**: Create, vote on, and execute governance proposals
- **Settings management**: Authority-based configuration changes
- **Time locks**: Delayed execution for sensitive operations

### Key Program Instructions
- `create_smart_account` - Initialize new smart account
- `create_transaction` / `create_transaction_from_buffer` - Transaction creation
- `execute_transaction` / `execute_transaction_sync` - Transaction execution
- `create_proposal` / `vote_on_proposal` / `activate_proposal` - Governance workflow
- Authority management instructions for signers, spending limits, thresholds

### State Accounts
- `SmartAccount` - Main account storing configuration and signers
- `Transaction` / `TransactionBuffer` - Transaction data and buffered components
- `Proposal` - Governance proposals with voting state
- `SpendingLimit` - Per-signer spending restrictions
- `Batch` / `BatchTransaction` - Transaction batching state

### SDK Architecture
- **Generated Layer** (`clients/js/src/generated/`): Auto-generated from IDL
- **High-level Functions**: `createSmartAccount.ts`, `proposeVoteExecute.ts`, `complexBufferedTransaction.ts`
- **Jupiter Integration**: Complex DeFi interactions via Jupiter API
- **State Management**: Test state persistence across integration tests

## Testing Requirements

SDK tests are **integration tests** requiring a live Solana validator:

1. Start fresh validator: `surfpool start --no-tui`
2. Deploy program: surfpool start automatically deploys the program but it must be configured with tests
3. Tests must run in sequence to maintain blockchain state
4. State files (`test-state.json`, `buffered-test-state.json`) shared between tests
5. If the cause of a problem is a race condition, you cannot determine whether it was solved or not by running the tests a single time. Instead, use a 'for loop' like:

```
for i in {1..5}; do echo ""; echo "🚀 Run $i of 5"; anchor && echo "✅ PASS" || echo "❌ FAIL"; echo ""; done
```
to determine if the condition is fixed (if 'anchor test' was the command to run). For 5 runs, 5/5 or 0/5 would indicate the lack of the race condition. Any other value would indicate the race condition still exists. If the condition is more rare you might want to try 10 runs


## Development Environment

- **Anchor Version**: 0.31.1
- **Solana Version**: 2.1.21  
- **TypeScript**: 4.9.4
- **Web3.js**: 1.95.5
- **Solana Kit**: 3.0.0

## Important Notes

- Always run `anchor build` before deployment to ensure latest program build
- SDK uses Solana Kit 3.0 - follow its patterns for transaction building
- Generated client files should not be manually edited - regenerate from IDL
- Tests require specific execution order due to state dependencies
- Program uses security-focused features (overflow checks, arithmetic safety)
- surfpool validator is able to pull state directly from mainnet to simulate real program interactions
- setup, createSmartAccount, and simpleTransaction tests are working, buffered tests are not
