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
    llvm \
    clang \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Solana CLI
RUN bash -c "$(curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"
# Install Anchor CLI using avm with specific version
RUN cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
RUN avm install 0.31.1
RUN avm use 0.31.1

# Create Solana config directory
RUN mkdir -p /root/.config/solana

# Set working directory
WORKDIR /workspace

# Copy project files
COPY . .

# Build command
CMD ["anchor", "build"] 