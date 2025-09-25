#!/bin/bash

# Surfpool Debug Script
set -euo pipefail

VALIDATOR_RPC_URL="http://127.0.0.1:8899"
FEE_PAYER_PUBKEY="astroi1Rrf6rqtJ1BZg7tDyx1NiUaQkYp3uD8mmTeJQ"
PROGRAM_ACCOUNT="ASTRjN4RRXupfb6d2HD24ozu8Gbwqf6JmS32UnNeGQ6q"

echo "=== Surfpool Debug Information ==="
echo "Timestamp: $(date)"
echo "Current working directory: $(pwd)"
echo

echo "=== Process Status ==="
pgrep -f surfpool || echo "No surfpool processes found"
echo

echo "=== Port Status ==="
if command -v lsof &> /dev/null; then
    echo "Port 8899 usage:"
    lsof -i :8899 || echo "Port 8899 not in use"
else
    echo "lsof not available"
fi
echo

echo "=== Validator Health ==="
if curl -s -f "$VALIDATOR_RPC_URL" -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' > /dev/null 2>&1; then
    echo "✓ Validator is responding"
    
    # Get version info
    echo "Validator version info:"
    curl -s "$VALIDATOR_RPC_URL" -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"getVersion"}' | jq '.' 2>/dev/null || echo "Unable to get version"
    echo
    
    # Get slot info
    echo "Current slot:"
    curl -s "$VALIDATOR_RPC_URL" -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' | jq '.' 2>/dev/null || echo "Unable to get slot"
    echo
    
else
    echo "✗ Validator is not responding"
fi

echo "=== Program Status ==="
if solana account "$PROGRAM_ACCOUNT" --url "$VALIDATOR_RPC_URL" > /dev/null 2>&1; then
    echo "✓ Smart contract is deployed at $PROGRAM_ACCOUNT"
    echo "Program account details:"
    solana account "$PROGRAM_ACCOUNT" --url "$VALIDATOR_RPC_URL" 2>/dev/null || echo "Unable to get account details"
else
    echo "✗ Smart contract not found at $PROGRAM_ACCOUNT"
fi
echo

echo "=== Wallet Status ==="
if solana balance "$FEE_PAYER_PUBKEY" --url "$VALIDATOR_RPC_URL" > /dev/null 2>&1; then
    balance=$(solana balance "$FEE_PAYER_PUBKEY" --url "$VALIDATOR_RPC_URL" 2>/dev/null)
    echo "✓ Fee payer wallet balance: $balance"
else
    echo "✗ Unable to check fee payer wallet balance"
fi
echo

echo "=== Recent Logs ==="
echo "Setup log (last 10 lines):"
if [ -f "/var/log/surfpool-setup.log" ]; then
    tail -10 /var/log/surfpool-setup.log
else
    echo "No setup log found"
fi
echo

echo "Surfpool log (last 10 lines):"
if [ -f "/var/log/surfpool.log" ]; then
    tail -10 /var/log/surfpool.log
else
    echo "No surfpool log found"
fi
echo

echo "=== Configuration Test ==="
echo "Checking if we can run the configuration script..."
CONFIG_SCRIPT="/home/ubuntu/astrolabe_smart_contract/sdk/examples/smartAccountProgramConfigInit-server.ts"
if [ -f "$CONFIG_SCRIPT" ]; then
    echo "✓ Configuration script exists: $CONFIG_SCRIPT"
    
    # Check if we're in the right directory for running it
    cd /home/ubuntu/astrolabe_smart_contract
    echo "Changed to smart contract directory: $(pwd)"
    
    if command -v npx &> /dev/null; then
        echo "✓ npx is available"
        echo "Attempting dry-run of configuration script..."
        # Note: This might still fail, but will show us the actual error
        timeout 30s npx ts-node "$CONFIG_SCRIPT" || echo "Configuration script failed or timed out"
    else
        echo "✗ npx not available"
    fi
else
    echo "✗ Configuration script not found: $CONFIG_SCRIPT"
fi

echo
echo "=== Debug Complete ==="
