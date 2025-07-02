FROM ubuntu:24.04

# Install required packages
RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    pkg-config \
    libssl-dev \
    libudev-dev \
    libsystemd-dev \
    zlib1g-dev \
    libgcc-s1 \
    libc6-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Solana CLI
RUN sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

# Install Anchor CLI using avm with specific version
RUN cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
RUN avm install 0.31.1
RUN avm use 0.31.1
WORKDIR /workspace

# Copy project files
COPY . .

# Build command
CMD ["anchor", "build"] 