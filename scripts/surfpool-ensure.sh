#!/bin/bash

# Surfpool State Ensure Script - Ensures system is ready for use
set -euo pipefail

VALIDATOR_RPC_URL="http://127.0.0.1:8899"
FEE_PAYER_PUBKEY="astroi1Rrf6rqtJ1BZg7tDyx1NiUaQkYp3uD8mmTeJQ"
PROGRAM_ACCOUNT="ASTRjN4RRXupfb6d2HD24ozu8Gbwqf6JmS32UnNeGQ6q"
CONFIG_SCRIPT="/home/ubuntu/astrolabe_smart_contract/sdk/examples/smartAccountProgramConfigInit-server.ts"

echo "🔧 Ensuring surfpool is ready for your backend..."

# 1. Check if service is running
if ! systemctl is-active --quiet surfpool; then
    echo "❌ Surfpool service not running. Starting..."
    sudo systemctl start surfpool
    sleep 10
else
    echo "✅ Surfpool service is running"
fi

# 2. Check if validator is responding
if curl -s -f "$VALIDATOR_RPC_URL" -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' > /dev/null 2>&1; then
    echo "✅ Validator is responding"
else
    echo "❌ Validator not responding. Restarting service..."
    sudo systemctl restart surfpool
    sleep 15
fi

# 3. Check if program is deployed
echo -n "📦 Program deployment: "
if solana account "$PROGRAM_ACCOUNT" --url "$VALIDATOR_RPC_URL" > /dev/null 2>&1; then
    echo "✅ Deployed"
else
    echo "⏳ Waiting for deployment..."
    # Wait up to 5 minutes for deployment
    for i in {1..20}; do
        sleep 15
        if solana account "$PROGRAM_ACCOUNT" --url "$VALIDATOR_RPC_URL" > /dev/null 2>&1; then
            echo "✅ Program deployed after waiting"
            break
        fi
        if [ $i -eq 20 ]; then
            echo "❌ Program failed to deploy within 5 minutes"
            exit 1
        fi
    done
fi

# 4. Check/ensure wallet balance
echo -n "💰 Wallet balance: "
current_balance=$(solana balance "$FEE_PAYER_PUBKEY" --url "$VALIDATOR_RPC_URL" 2>/dev/null | grep -oE '[0-9]+\.?[0-9]*' | head -1)

if [ -n "$current_balance" ] && (( $(echo "$current_balance >= 5" | bc -l) )); then
    echo "✅ ${current_balance} SOL"
else
    echo "⏳ Low/empty, airdropping..."
    cd /home/ubuntu/astrolabe_smart_contract
    solana airdrop 10 "$FEE_PAYER_PUBKEY" --url "$VALIDATOR_RPC_URL" >/dev/null 2>&1
    sleep 3
    
    new_balance=$(solana balance "$FEE_PAYER_PUBKEY" --url "$VALIDATOR_RPC_URL" 2>/dev/null | grep -oE '[0-9]+\.?[0-9]*' | head -1)
    echo "✅ Airdropped, new balance: ${new_balance} SOL"
fi

# 5. Ensure configuration
echo -n "⚙️  Program configuration: "
cd /home/ubuntu/astrolabe_smart_contract
if npx ts-node "$CONFIG_SCRIPT" 2>/dev/null >/dev/null; then
    echo "✅ Configured"
elif npx ts-node "$CONFIG_SCRIPT" 2>&1 | grep -q "already in use\|already initialized" >/dev/null; then
    echo "✅ Already configured"
else
    echo "❌ Configuration failed"
    exit 1
fi

echo ""
echo "🎉 Surfpool is ready!"
echo "   • RPC URL: $VALIDATOR_RPC_URL"
echo "   • Program: $PROGRAM_ACCOUNT" 
echo "   • Wallet: ${current_balance:-$new_balance} SOL available"
echo ""
echo "Your backend can now connect to the validator! 🚀"