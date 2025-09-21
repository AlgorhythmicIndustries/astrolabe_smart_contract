#!/bin/bash
set -e

echo "🧹 Cleaning up existing deployment directory..."

# Remove existing directory if it exists
if [ -d "/home/ubuntu/astrolabe_smart_contract" ]; then
    echo "📁 Removing existing directory..."
    rm -rf /home/ubuntu/astrolabe_smart_contract
    echo "✅ Directory cleaned"
else
    echo "📁 Directory doesn't exist, nothing to clean"
fi

# Ensure parent directory exists with correct permissions
mkdir -p /home/ubuntu
chown ubuntu:ubuntu /home/ubuntu

echo "✅ Cleanup complete"
