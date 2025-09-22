#!/bin/bash

# Surfpool Setup Only Script - Just does setup, no runtime
set -euo pipefail

# Configuration  
PROGRAM_DIR="/home/ubuntu/astrolabe_smart_contract"
LOG_FILE="/var/log/surfpool-setup.log"
LOCK_FILE="/tmp/surfpool-setup.lock"
FEE_PAYER_PUBKEY="astroi1Rrf6rqtJ1BZg7tDyx1NiUaQkYp3uD8mmTeJQ"
VALIDATOR_RPC_URL="http://127.0.0.1:8899"
AIRDROP_AMOUNT="10"
CONFIG_SCRIPT="/home/ubuntu/astrolabe_smart_contract/sdk/examples/smartAccountProgramConfigInit-server.ts"
PROGRAM_ACCOUNT="ASTRjN4RRXupfb6d2HD24ozu8Gbwqf6JmS32UnNeGQ6q"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] SETUP: $1" | tee -a "$LOG_FILE"
}

# Cleanup function
cleanup() {
    rm -f "$LOCK_FILE" 2>/dev/null || true
    exit 0
}

trap cleanup EXIT

# Prevent multiple setup instances
if [ -f "$LOCK_FILE" ]; then
    lock_pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
        log "Another setup instance is running (PID: $lock_pid), skipping"
        exit 0
    fi
fi
echo $$ > "$LOCK_FILE"

log "Starting Surfpool setup (setup-only mode)..."

# Check if required commands are available
for cmd in solana npx bc curl; do
    if ! command -v "$cmd" &> /dev/null; then
        log "ERROR: $cmd command not found in PATH"
        exit 1
    fi
done

# Function to check wallet balance
check_wallet_balance() {
    local min_balance="$1"
    local current_balance
    current_balance=$(solana balance "$FEE_PAYER_PUBKEY" --url "$VALIDATOR_RPC_URL" 2>/dev/null | grep -oE '[0-9]+\.?[0-9]*' | head -1)
    
    if [ -n "$current_balance" ] && (( $(echo "$current_balance >= $min_balance" | bc -l) )); then
        return 0
    else
        return 1
    fi
}

# Check if there's already a surfpool running (setup already done)
if curl -s -f "$VALIDATOR_RPC_URL" -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' > /dev/null 2>&1; then
    log "Validator already running, checking program..."
    
    if solana account "$PROGRAM_ACCOUNT" --url "$VALIDATOR_RPC_URL" > /dev/null 2>&1; then
        log "Program already deployed, checking wallet balance..."
        
        # Even if setup is done, ensure wallet has sufficient balance
        if ! check_wallet_balance "5"; then
            log "Wallet balance insufficient, airdropping..."
            cd "$PROGRAM_DIR"
            solana airdrop "$AIRDROP_AMOUNT" "$FEE_PAYER_PUBKEY" --url "$VALIDATOR_RPC_URL" >/dev/null 2>&1 || log "Airdrop failed"
            sleep 3
            
            if check_wallet_balance "5"; then
                log "Wallet funded successfully"
            else
                log "WARNING: Wallet still has low balance"
            fi
        else
            log "Wallet balance sufficient"
        fi
        
        log "Setup verification complete - all requirements met"
        exit 0
    fi
fi

# Wait a moment for surfpool to initialize if it was just started
log "Waiting for validator to be ready..."
max_attempts=60  # Increased to 2 minutes (was 1 minute)
attempt=1

while [ $attempt -le $max_attempts ]; do
    if curl -s -f "$VALIDATOR_RPC_URL" -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' > /dev/null 2>&1; then
        log "Validator is ready!"
        break
    fi
    
    if [ $attempt -eq $max_attempts ]; then
        log "ERROR: Validator not ready within timeout"
        exit 1
    fi
    
    log "Waiting for validator... (attempt $attempt/$max_attempts)"
    sleep 2
    attempt=$((attempt + 1))
done

# Wait for program deployment
log "Waiting for program deployment..."
max_attempts=120  # Increased to 30 minutes (was 15 minutes)
attempt=1

while [ $attempt -le $max_attempts ]; do
    if solana account "$PROGRAM_ACCOUNT" --url "$VALIDATOR_RPC_URL" > /dev/null 2>&1; then
        log "Program deployed successfully! Address: $PROGRAM_ACCOUNT"
        break
    fi
    
    if [ $attempt -eq $max_attempts ]; then
        log "ERROR: Program failed to deploy within timeout"
        exit 1
    fi
    
    if (( attempt % 4 == 0 )); then
        log "Still waiting for program deployment... ($(( attempt * 15 / 60 )) minutes elapsed)"
    fi
    
    sleep 15
    attempt=$((attempt + 1))
done

# Airdrop SOL
log "Airdropping $AIRDROP_AMOUNT SOL to fee payer..."
cd "$PROGRAM_DIR"
solana airdrop "$AIRDROP_AMOUNT" "$FEE_PAYER_PUBKEY" --url "$VALIDATOR_RPC_URL" >/dev/null 2>&1 || log "Airdrop failed"
sleep 3

# Execute configuration
log "Executing program configuration..."
if npx ts-node "$CONFIG_SCRIPT" 2>/dev/null; then
    log "Configuration completed successfully"
elif npx ts-node "$CONFIG_SCRIPT" 2>&1 | grep -q "already in use\|already initialized"; then
    log "Configuration already exists (skipping)"
else
    log "ERROR: Configuration script failed"
    exit 1
fi

log "Setup completed successfully! Program Address: $PROGRAM_ACCOUNT"
exit 0
