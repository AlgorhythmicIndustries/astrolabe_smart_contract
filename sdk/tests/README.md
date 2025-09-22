# SDK Tests

This directory contains integration tests for the Astrolabe Smart Account SDK that run in a specific order to set up the proper blockchain state.

## Test Execution Order

⚠️ **IMPORTANT**: Tests must run in order on a fresh validator to set up the proper state:

1. `00-setup.test.ts` - Initializes program configuration
2. `01-createSmartAccount.test.ts` - Creates a smart account and saves state
3. `02-simpleTransaction.test.ts` - Tests transaction execution using the created smart account

## Running Tests

### Run all tests in order (recommended):
```bash
cd sdk
npm test
```

### Run individual tests (manual order):
```bash
cd sdk
npm run test:setup      # Initialize program config
npm run test:create     # Create smart account
npm run test:simple     # Test transactions
```

### Alternative individual test commands:
```bash
cd sdk
npx tsx tests/00-setup.test.ts
npx tsx tests/01-createSmartAccount.test.ts
npx tsx tests/02-simpleTransaction.test.ts
```

## Test Files

- `00-setup.test.ts` - Initializes program configuration (must run first)
- `01-createSmartAccount.test.ts` - Tests smart account creation and saves state
- `02-simpleTransaction.test.ts` - Tests transaction execution using created account
- `run-tests.ts` - Automated test runner that handles proper execution order
- `test-state.json` - Generated state file shared between tests

## Prerequisites

- **Fresh Solana validator** running on `http://localhost:8899`
- Program deployed to the validator
- Keypair at `/Users/algorhythmic/.config/solana/id.json`
- Program config initializer keypair at `../../test-program-config-initializer-keypair.json`

## Starting Fresh

To run tests on a completely fresh validator:

1. Stop any existing validator
2. Start a new validator: `solana-test-validator --reset`
3. Deploy the program
4. Run: `cd sdk && npm test`

## Notes

- These are **integration tests** that interact with a live blockchain
- Tests create actual accounts and execute real transactions
- The `01-createSmartAccount.test.ts` saves state to `test-state.json` for subsequent tests
- If tests fail, check that the validator is running and the program is deployed
