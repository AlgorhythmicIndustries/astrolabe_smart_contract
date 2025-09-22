#!/bin/bash
set -e

# Update Frontend SDK Dependency Script
# This script updates the frontend package.json with a new SDK commit hash

if [ $# -ne 1 ]; then
  echo "Usage: $0 <commit_hash>"
  echo "Example: $0 abc123def456..."
  exit 1
fi

NEW_HASH="$1"
FRONTEND_PACKAGE_JSON="../astrolabe-frontend/package.json"

if [ ! -f "$FRONTEND_PACKAGE_JSON" ]; then
  echo "❌ Error: Frontend package.json not found at $FRONTEND_PACKAGE_JSON"
  exit 1
fi

echo "🔧 Updating frontend SDK dependency..."
echo "📋 New hash: $NEW_HASH"

# Use Node.js to update the package.json
node -e "
const fs = require('fs');
const path = '$FRONTEND_PACKAGE_JSON';
const newHash = '$NEW_HASH';

const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
const oldDependency = pkg.dependencies['astrolabe-sc-sdk'];

// Update the dependency with new hash
pkg.dependencies['astrolabe-sc-sdk'] = \`git+ssh://git@github.com:Algorhythmic1/astrolabe-sdk.git#\${newHash}\`;

fs.writeFileSync(path, JSON.stringify(pkg, null, 2));

console.log('✅ Updated astrolabe-sc-sdk dependency');
console.log('📍 Old:', oldDependency);
console.log('📍 New:', pkg.dependencies['astrolabe-sc-sdk']);
"

echo ""
echo "🏗️  Next steps:"
echo "1. cd ../astrolabe-frontend"
echo "2. npm install"
echo "3. Commit the package.json change"
