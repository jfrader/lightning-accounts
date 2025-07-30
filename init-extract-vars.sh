#!/bin/bash

# Configuration
PROJECT_ROOT="$(pwd)"
LND_DATA_DIR="$PROJECT_ROOT/volumes/lnd/alice"
TLS_CERT_PATH="$LND_DATA_DIR/tls.cert"
ADMIN_MACAROON_PATH="$LND_DATA_DIR/data/chain/bitcoin/regtest/admin.macaroon"
LND_SOCKET=${LND_SOCKET:-"10.29.0.13:10009"}

# Function to check if a file exists and is readable
check_file() {
    local file=$1 name=$2
    if [ ! -f "$file" ]; then
        echo "Error: $name file not found at $file"
        exit 1
    fi
    if [ ! -r "$file" ]; then
        echo "Error: $name file at $file is not readable"
        exit 1
    fi
}

# Check for required commands
command -v base64 >/dev/null 2>&1 || { echo "Error: base64 command not found"; exit 1; }

# Check if files exist and are readable
check_file "$TLS_CERT_PATH" "TLS certificate"
check_file "$ADMIN_MACAROON_PATH" "Admin macaroon"

# Read and encode files
LND_CERT=$(cat "$TLS_CERT_PATH" | base64 -w 0)
LND_ADMIN_MACAROON=$(cat "$ADMIN_MACAROON_PATH" | base64 -w 0)

# Output environment variables
echo "LND_CERT=\"$LND_CERT\""
echo "LND_ADMIN_MACAROON=\"$LND_ADMIN_MACAROON\""
echo "LND_SOCKET=\"$LND_SOCKET\""

# Optionally, export variables for use in the current shell
# export LND_CERT
# export LND_ADMIN_MACAROON
# export LND_SOCKET
# echo "Environment variables set. You can use them in your shell or copy them to your configuration."
