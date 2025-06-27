# Getting Started
- Make sure anchor and solana-cli are installed, following instructions associated places

## Compile account
- run anchor build

## Run and deploy the account
- run 'solana-test-validator'
- run 'solana program-v4 deploy ./target/deploy/squads_smart_account_program.so --program-keypair ./target/deploy/squads_smart_account_program-keypair.json'
- solana config set --url localhost
- solana airdrop 10 AxgywBv9kDVxEYuctmoQoEx5GLGZhgbbPe1x2G9jrboA
    - If program deploys correctly should return a program-id

## Actual Testing
- run npm install
- npm install --save-dev @types/bn.js
- npx ts-node createSmartAccount.ts 