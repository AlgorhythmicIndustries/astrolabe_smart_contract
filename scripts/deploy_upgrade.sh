#!/bin/bash
set -e

echo "🔧 Starting Solana Program Upgrade Pipeline..."

# Change to deployment directory
cd /home/ubuntu/astrolabe_smart_contract

# Configuration
PROGRAM_NAME="astrolabe_smart_account"
PROGRAM_ID="ASTRjN4RRXupfb6d2HD24ozu8Gbwqf6JmS32UnNeGQ6q"
CLUSTER_URL="${SOLANA_CLUSTER_URL:-http://localhost:8899}"
KEYPAIR_PATH="${SOLANA_KEYPAIR_PATH:-~/.config/solana/id.json}"

echo "📋 Configuration:"
echo "  Program: $PROGRAM_NAME"
echo "  Program ID: $PROGRAM_ID" 
echo "  Cluster: $CLUSTER_URL"
echo "  Keypair: $KEYPAIR_PATH"

# Set Solana configuration
echo "⚙️  Setting up Solana CLI..."
solana config set --url "$CLUSTER_URL"
solana config set --keypair "$KEYPAIR_PATH"

# Verify configuration
echo "✅ Solana config:"
solana config get

# Verify wallet has sufficient balance
echo "💰 Checking wallet balance..."
BALANCE=$(solana balance --keypair "$KEYPAIR_PATH")
echo "  Balance: $BALANCE"

# Build the program
echo "🔨 Building Anchor program..."
anchor build

# Verify build output exists
PROGRAM_SO="target/deploy/${PROGRAM_NAME}.so"
if [ ! -f "$PROGRAM_SO" ]; then
    echo "❌ Build failed - $PROGRAM_SO not found"
    exit 1
fi

echo "✅ Build successful - $PROGRAM_SO created"

# Check current program info
echo "🔍 Current program info:"
solana program show "$PROGRAM_ID" || echo "⚠️  Program not found or network error"

# Deploy/upgrade the program
echo "🚀 Deploying program upgrade..."
if solana program deploy "$PROGRAM_SO" --program-id "$PROGRAM_ID"; then
    echo "✅ Program upgrade successful!"
else
    echo "❌ Program upgrade failed!"
    exit 1
fi

# Verify deployment
echo "✅ Verifying deployment..."
solana program show "$PROGRAM_ID"

echo "🎉 Solana Program Upgrade Pipeline Complete!"
