#!/bin/bash

# Build script for glibc compatibility
set -e

echo "Setting up build environment..."

# Install required target if not already installed
rustup target add x86_64-unknown-linux-gnu

# Set environment variables for cross-compilation
export CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=x86_64-linux-gnu-gcc
export CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_RUNNER=

# Build with specific target
echo "Building with target x86_64-unknown-linux-gnu..."
anchor build --target x86_64-unknown-linux-gnu

echo "Build completed successfully!" 