#!/bin/bash

# Surfpool Management Script
set -euo pipefail

SERVICE_NAME="surfpool"
LOG_FILE="/var/log/surfpool-setup.log"
SERVICE_LOG="/var/log/surfpool-service.log"
ERROR_LOG="/var/log/surfpool-service-error.log"
SURFPOOL_LOG="/var/log/surfpool.log"
PID_FILE="/tmp/surfpool.pid"

usage() {
    cat << EOF
Usage: $0 {start|stop|restart|status|logs|clean}

Commands:
    start       Start the surfpool service
    stop        Stop the surfpool service  
    restart     Restart the surfpool service
    status      Show service status
    logs        Show recent logs
    clean       Clean up any stuck processes and files
    health      Check if validator is responding
EOF
    exit 1
}

check_validator_health() {
    echo "Checking validator health..."
    if curl -s -f "http://127.0.0.1:8899" -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' > /dev/null 2>&1; then
        echo "✓ Validator is responding"
        
        # Check if our program is deployed
        if solana account "ASTRjN4RRXupfb6d2HD24ozu8Gbwqf6JmS32UnNeGQ6q" \
            --url "http://127.0.0.1:8899" > /dev/null 2>&1; then
            echo "✓ Smart contract is deployed"
        else
            echo "⚠ Smart contract not found"
        fi
    else
        echo "✗ Validator is not responding"
    fi
}

show_logs() {
    echo "=== Recent Surfpool Setup Logs ==="
    if [ -f "$LOG_FILE" ]; then
        tail -50 "$LOG_FILE"
    else
        echo "No setup log found at $LOG_FILE"
    fi
    
    echo -e "\n=== Recent Service Logs ==="
    if [ -f "$SERVICE_LOG" ]; then
        tail -30 "$SERVICE_LOG"
    else
        echo "No service log found at $SERVICE_LOG"
    fi
    
    echo -e "\n=== Recent Error Logs ==="
    if [ -f "$ERROR_LOG" ]; then
        tail -20 "$ERROR_LOG"
    else
        echo "No error log found at $ERROR_LOG"
    fi
}

clean_processes() {
    echo "Cleaning up surfpool processes and files..."
    
    # Stop the service first
    sudo systemctl stop surfpool 2>/dev/null || true
    
    # Kill any remaining surfpool processes
    echo "Killing surfpool processes..."
    sudo pkill -f "surfpool" 2>/dev/null || true
    sudo pkill -f "surfpool-setup" 2>/dev/null || true
    
    # Wait a moment
    sleep 3
    
    # Force kill if needed
    sudo pkill -9 -f "surfpool" 2>/dev/null || true
    
    # Clean up files
    echo "Removing PID and lock files..."
    sudo rm -f "$PID_FILE" /tmp/surfpool.lock
    
    # Clean up any stuck network connections
    echo "Checking for stuck connections on port 8899..."
    local stuck_procs=$(sudo lsof -ti:8899 2>/dev/null || true)
    if [ -n "$stuck_procs" ]; then
        echo "Killing processes using port 8899: $stuck_procs"
        echo "$stuck_procs" | xargs -r sudo kill -9
    fi
    
    echo "Cleanup completed"
}

case "${1:-}" in
    start)
        echo "Starting surfpool service..."
        sudo systemctl start surfpool
        sleep 2
        sudo systemctl status surfpool
        ;;
    stop)
        echo "Stopping surfpool service..."
        sudo systemctl stop surfpool
        ;;
    restart)
        echo "Restarting surfpool service..."
        clean_processes
        sleep 5
        sudo systemctl start surfpool
        sleep 2
        sudo systemctl status surfpool
        ;;
    status)
        sudo systemctl status surfpool
        echo -e "\nValidator Health:"
        check_validator_health
        ;;
    logs)
        show_logs
        ;;
    clean)
        clean_processes
        ;;
    health)
        check_validator_health
        ;;
    *)
        usage
        ;;
esac
