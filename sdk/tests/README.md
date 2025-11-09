# SDK Tests

This directory contains integration tests for the Astrolabe Smart Account SDK that run in a specific order to set up the proper blockchain state.

## Test Execution Order

⚠️ **IMPORTANT**: Tests must run in order on a fresh validator to set up the proper state:

1. `00-setup.test.ts` - Initializes program configuration
2. `01-createSmartAccount.test.ts` - Creates a smart account and saves state
3. `02-solXferTransaction.test.ts` - Tests simple SOL transfer transaction (non-buffered)
4. `03-complexSwapBufferedTransaction.test.ts` - Tests complex buffered transaction with Jupiter swap and ALTs
5. `04-noSDKBufferedTransaction.test.ts` - Tests buffered transaction using raw instructions (no SDK helpers)
6. `05-addSignerTransaction.test.ts` - Tests adding a new signer/authority to the smart account

## Running Tests

### Run all tests in order (recommended):
```bash
cd sdk
npm test
```

### Run individual tests (manual order):
```bash
cd sdk
npm run test:setup          # Initialize program config
npm run test:create         # Create smart account
npm run test:simple         # Test simple SOL transfer (non-buffered)
npm run test:buffered       # Test complex buffered transaction (Jupiter swap with ALTs)
npm run test:noSDKbuffered  # Test buffered transaction without SDK helpers
npm run test:addSigner      # Test adding a new signer to the smart account
```

### Alternative individual test commands:
```bash
cd sdk
npx tsx tests/00-setup.test.ts
npx tsx tests/01-createSmartAccount.test.ts
npx tsx tests/02-solXferTransaction.test.ts
npx tsx tests/03-complexSwapBufferedTransaction.test.ts
npx tsx tests/04-noSDKBufferedTransaction.test.ts
npx tsx tests/07-addSignerTransaction.test.ts
```

## Test Files

- `00-setup.test.ts` - Initializes program configuration (must run first)
- `01-createSmartAccount.test.ts` - Tests smart account creation and saves state
- `02-solXferTransaction.test.ts` - Tests simple SOL transfer (non-buffered) using `createSimpleTransaction` SDK
- `03-complexSwapBufferedTransaction.test.ts` - Tests complex buffered transaction with Jupiter swap, ALTs, and USDC funding
- `04-noSDKBufferedTransaction.test.ts` - Tests buffered transaction using raw instructions (demonstrates manual construction)
- `07-addSignerTransaction.test.ts` - Tests adding a new signer to the smart account using `addPasskeyAuthorityTransaction` SDK
- `run-tests.ts` - Automated test runner that handles proper execution order
- `test-state.json` - Generated state file shared between tests (smart account settings and PDA)
- `buffered-test-state.json` - Generated state from buffered transaction test (transaction/proposal/buffer PDAs)
- `add-signer-test-state.json` - Generated state from add signer test (new signer address and count)

## Prerequisites

- **Surfpool (local Solana validator)** running on `http://localhost:8899` with mainnet state simulation
- Program deployed to the validator
- Keypair at `/Users/algorhythmic/.config/solana/id.json` with SOL balance
- Program config initializer keypair at `../../test-program-config-initializer-keypair.json`
- For test 03: Surfpool's `surfnet_setTokenAccount` RPC is used to fund test USDC

## Starting Fresh

To run tests on a completely fresh validator:

1. Stop any existing Surfpool instance
2. Start a new Surfpool instance (see Surfpool documentation)
3. Deploy the program to the local validator
4. Run: `cd sdk && npm test`

Note: Surfpool provides mainnet state forking, which is required for test 03 (Jupiter swap test).

## Notes

- These are **integration tests** that interact with a live blockchain
- Tests create actual accounts and execute real transactions
- The `01-createSmartAccount.test.ts` saves state to `test-state.json` for subsequent tests
- If tests fail, check that the validator is running and the program is deployed
