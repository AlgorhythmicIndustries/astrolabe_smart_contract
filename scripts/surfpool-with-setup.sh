#!/bin/bash

# Surfpool wrapper script that starts surfpool and runs setup after it's ready
set -euo pipefail

# Configuration
PROGRAM_DIR="/home/ubuntu/astrolabe_smart_contract"
SETUP_SCRIPT="/home/ubuntu/astrolabe_smart_contract/scripts/surfpool-setup-only.sh"
SURFPOOL_BIN="/home/ubuntu/.cargo/bin/surfpool"
SURFPOOL_PID_FILE="/tmp/surfpool.pid"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WRAPPER: $1"
}

# Cleanup function
cleanup() {
    log "Cleanup initiated..."
    if [ -f "$SURFPOOL_PID_FILE" ]; then
        local surfpool_pid=$(cat "$SURFPOOL_PID_FILE" 2>/dev/null || echo "")
        if [ -n "$surfpool_pid" ] && kill -0 "$surfpool_pid" 2>/dev/null; then
            log "Stopping surfpool (PID: $surfpool_pid)..."
            kill -TERM "$surfpool_pid" 2>/dev/null || true
            sleep 5
            if kill -0 "$surfpool_pid" 2>/dev/null; then
                log "Force killing surfpool..."
                kill -KILL "$surfpool_pid" 2>/dev/null || true
            fi
        fi
        rm -f "$SURFPOOL_PID_FILE"
    fi
    exit 0
}

# Set up signal handlers
trap cleanup EXIT INT TERM

log "Starting surfpool wrapper..."

# Change to program directory
cd "$PROGRAM_DIR"

# Start surfpool in the background
log "Starting surfpool in background..."
"$SURFPOOL_BIN" start --no-tui &
SURFPOOL_PID=$!

# Save the PID
echo "$SURFPOOL_PID" > "$SURFPOOL_PID_FILE"
log "Surfpool started with PID: $SURFPOOL_PID"

# Wait a moment for surfpool to start
sleep 3

# Check if surfpool is still running
if ! kill -0 "$SURFPOOL_PID" 2>/dev/null; then
    log "ERROR: Surfpool failed to start"
    exit 1
fi

# Run the setup script
log "Running setup script..."
if "$SETUP_SCRIPT"; then
    log "Setup completed successfully"
else
    log "WARNING: Setup script failed, but continuing with surfpool running"
fi

# Now wait for surfpool to finish (keep it in foreground for systemd)
log "Setup complete, monitoring surfpool..."
wait "$SURFPOOL_PID"
SURFPOOL_EXIT_CODE=$?

log "Surfpool exited with code: $SURFPOOL_EXIT_CODE"
exit $SURFPOOL_EXIT_CODE
