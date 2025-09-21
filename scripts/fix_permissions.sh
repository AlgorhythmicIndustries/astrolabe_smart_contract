#!/bin/bash
set -e

echo "🔧 Fixing file permissions and ownership..."

# Fix ownership of deployment directory
if [ -d "/home/ubuntu/astrolabe_smart_contract" ]; then
    echo "📁 Setting ownership of deployment directory to ubuntu:ubuntu"
    chown -R ubuntu:ubuntu /home/ubuntu/astrolabe_smart_contract
    
    echo "📁 Setting directory permissions"
    find /home/ubuntu/astrolabe_smart_contract -type d -exec chmod 755 {} \;
    
    echo "📄 Setting file permissions" 
    find /home/ubuntu/astrolabe_smart_contract -type f -exec chmod 644 {} \;
    
    echo "🔧 Making scripts executable"
    find /home/ubuntu/astrolabe_smart_contract/scripts -name "*.sh" -exec chmod +x {} \;
    
    echo "✅ Permissions fixed"
else
    echo "❌ Deployment directory not found"
    exit 1
fi

echo "✅ Permission fixing complete"
