#!/bin/bash
set -e

echo "🔧 Starting Git Pull + Solana Program Deployment..."

# Navigate to the persistent directory (don't destroy it!)
cd /home/ubuntu/astrolabe_smart_contract

# Check and fix remote URL for public repo (avoid SSH authentication)
echo "🔍 Checking git remote configuration..."
CURRENT_REMOTE=$(git remote get-url origin)
echo "Current remote: $CURRENT_REMOTE"

# If using SSH, switch to HTTPS for public repo
if [[ "$CURRENT_REMOTE" == git@* ]]; then
    echo "🔧 Switching from SSH to HTTPS for public repo..."
    # Extract repo path from SSH URL and convert to HTTPS
    REPO_PATH=$(echo "$CURRENT_REMOTE" | sed 's/git@github.com://' | sed 's/\.git$//')
    HTTPS_URL="https://github.com/${REPO_PATH}.git"
    git remote set-url origin "$HTTPS_URL"
    echo "✅ Updated remote to: $HTTPS_URL"
fi

# Pull latest changes from dev branch
echo "📥 Pulling latest code changes from dev branch..."
git fetch origin
git reset --hard origin/dev
echo "✅ Code updated"

# Configuration
PROGRAM_NAME="astrolabe_smart_account"
PROGRAM_ID="ASTRjN4RRXupfb6d2HD24ozu8Gbwqf6JmS32UnNeGQ6q"
CLUSTER_URL="${SOLANA_CLUSTER_URL:-http://localhost:8899}"
KEYPAIR_PATH="${SOLANA_KEYPAIR_PATH:-$HOME/.config/solana/id.json}"

echo "📋 Configuration:"
echo "  Program: $PROGRAM_NAME"
echo "  Program ID: $PROGRAM_ID" 
echo "  Cluster: $CLUSTER_URL"
echo "  Keypair: $KEYPAIR_PATH"

# Set up environment for ubuntu user
echo "🔍 Setting up environment..."

# Source shell configuration files that might contain PATH additions
if [ -f "$HOME/.bashrc" ]; then
    echo "🔧 Sourcing .bashrc..."
    source "$HOME/.bashrc"
fi

if [ -f "$HOME/.profile" ]; then
    echo "🔧 Sourcing .profile..."
    source "$HOME/.profile"
fi

# Debug: Find where anchor is installed
echo "🔍 Searching for anchor binary..."
ANCHOR_LOCATIONS=(
    "$HOME/.avm/bin"
    "$HOME/.cargo/bin" 
    "$HOME/.local/bin"
    "/usr/local/bin"
)

ANCHOR_PATH=""
for loc in "${ANCHOR_LOCATIONS[@]}"; do
    if [ -f "$loc/anchor" ]; then
        ANCHOR_PATH="$loc"
        echo "✅ Found anchor in: $ANCHOR_PATH"
        break
    fi
done

# Also try using 'which' if available from interactive environment
if [ -z "$ANCHOR_PATH" ]; then
    echo "🔍 Trying to locate anchor via find..."
    ANCHOR_FIND=$(find $HOME -name "anchor" -type f -executable 2>/dev/null | head -1)
    if [ -n "$ANCHOR_FIND" ]; then
        ANCHOR_PATH=$(dirname "$ANCHOR_FIND")
        echo "✅ Found anchor via find: $ANCHOR_PATH"
    fi
fi

# Build PATH
PATH_ADDITIONS="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin"
if [ -n "$ANCHOR_PATH" ]; then
    PATH_ADDITIONS="$ANCHOR_PATH:$PATH_ADDITIONS"
fi

export PATH="$PATH_ADDITIONS:$PATH"
echo "📋 Updated PATH: $PATH"

# Verify tools are available
echo "🔧 Verifying tools..."
if ! command -v solana &> /dev/null; then
    echo "❌ solana command not found"
    echo "PATH: $PATH"
    exit 1
fi

if ! command -v anchor &> /dev/null; then
    echo "❌ anchor command not found"
    echo "PATH: $PATH"
    exit 1
fi

echo "✅ Tools verified: solana=$(which solana), anchor=$(which anchor)"

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

# Deploy/upgrade the program with retries and better blockhash handling
echo "🚀 Deploying program upgrade..."
DEPLOY_ATTEMPTS=3
for attempt in $(seq 1 $DEPLOY_ATTEMPTS); do
    echo "🔄 Deployment attempt $attempt/$DEPLOY_ATTEMPTS"
    
    # Wait a moment for fresh blockhash
    echo "🔄 Waiting for fresh blockhash..."
    sleep 5
    
    if timeout 300 solana program deploy "$PROGRAM_SO" --program-id "$PROGRAM_ID" --upgrade-authority "$KEYPAIR_PATH"; then
        echo "✅ Program upgrade successful on attempt $attempt!"
        break
    else
        echo "⚠️ Deployment attempt $attempt failed"
        if [ $attempt -eq $DEPLOY_ATTEMPTS ]; then
            echo "❌ All deployment attempts failed!"
            exit 1
        fi
        echo "⏳ Waiting 10 seconds before retry..."
        sleep 10
    fi
done

# Verify deployment
echo "✅ Verifying deployment..."
solana program show "$PROGRAM_ID"

echo "🎉 Git Pull + Solana Program Deployment Complete!"