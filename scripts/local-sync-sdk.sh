#!/bin/bash
set -e

# Local SDK Sync Script
# This script syncs the embedded SDK to the separate repository for development

echo "🔄 Starting local SDK sync..."

# Check if we're in the right directory
if [ ! -d "astrolabe_smart_contract/sdk" ]; then
  echo "❌ Error: Must be run from the project root directory"
  exit 1
fi

# Configuration
SDK_SOURCE_DIR="astrolabe_smart_contract/sdk"
REMOTE_REPO="git@github.com:Algorhythmic1/astrolabe-sdk.git"
REMOTE_NAME="astrolabe-sdk-remote"
BRANCH="sdk_rewrite"

echo "📋 Syncing from: $SDK_SOURCE_DIR"
echo "📋 To repository: $REMOTE_REPO"

# Check if we have uncommitted changes in SDK
if ! git diff --quiet HEAD -- $SDK_SOURCE_DIR; then
  echo "⚠️  Warning: You have uncommitted changes in the SDK directory"
  echo "   Please commit your changes first, then run this script"
  exit 1
fi

# Add remote if it doesn't exist
if ! git remote get-url $REMOTE_NAME >/dev/null 2>&1; then
  echo "📡 Adding remote: $REMOTE_NAME"
  git remote add $REMOTE_NAME $REMOTE_REPO
fi

# Fetch the remote to ensure we have latest
echo "⬇️ Fetching latest from remote..."
git fetch $REMOTE_NAME

# Push the subtree
echo "🚀 Pushing SDK subtree to remote repository..."
if git subtree push --prefix=$SDK_SOURCE_DIR $REMOTE_NAME $BRANCH; then
  # Get the latest commit hash
  LATEST_HASH=$(git ls-remote $REMOTE_REPO HEAD | cut -f1)
  
  echo "✅ SDK sync complete!"
  echo "📍 Latest commit hash: $LATEST_HASH"
  echo ""
  echo "🔧 To update frontend dependency, use:"
  echo "   astrolabe-sc-sdk: \"git+ssh://git@github.com:Algorhythmic1/astrolabe-sdk.git#$LATEST_HASH\""
  echo ""
  echo "💡 Or run: ./scripts/update-frontend-sdk.sh $LATEST_HASH"
else
  echo "❌ Failed to push SDK subtree"
  exit 1
fi
