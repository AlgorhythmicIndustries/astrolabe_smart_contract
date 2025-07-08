#!/bin/bash

echo "🚀 Building Solana program with Docker (glibc 2.38 compatible)..."
echo ""

# Build using Docker Compose
docker-compose up --build

echo ""
echo "✅ Build completed!"
echo ""
echo "📁 Your compiled program is available at:"
echo "   - Binary: ./target/deploy/astrolabe_smart_account_program.so"
echo "   - IDL: ./target/idl/astrolabe_smart_account_program.json"
echo "   - Types: ./target/types/astrolabe_smart_account_program.ts"
echo ""
echo "🔧 To clean up Docker containers:"
echo "   docker-compose down" 