#!/bin/bash

AIRDROP_AMOUNT=10
FEE_PAYER_PUBKEY=astroi1Rrf6rqtJ1BZg7tDyx1NiUaQkYp3uD8mmTeJQ
VALIDATOR_RPC_URL=https://127.0.0.1:8899

solana airdrop "$AIRDROP_AMOUNT" "$FEE_PAYER_PUBKEY"
npx ts-node /home/ubuntu/astrolabe_smart_contract/sdk/examples/smartAccountProgramConfigInit-server.ts