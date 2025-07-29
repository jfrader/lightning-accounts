#!/bin/bash
export NODE_ENV=test 

# Configuration
ALICE_CONTAINER="lightning-accounts-polar-alice"
CAROL_CONTAINER="lightning-accounts-polar-carol"
BOB_CONTAINER="lightning-accounts-polar-bob"
BACKEND_CONTAINER="lightning-accounts-polar-backend1"
SERVER_CONTAINER="lightning-accounts-server"
POSTGRES_CONTAINER="lightning-accounts-postgres-test"
ALICE_HOST="lightning-accounts-polar-alice"
CAROL_HOST="lightning-accounts-polar-carol"
BOB_HOST="lightning-accounts-polar-bob"
ALICE_PORT="9735"
CAROL_PORT="9735"
BOB_PORT="9735"
CHANNEL_AMOUNT="1000000"
PUSH_AMOUNT="500000"
RPC_USER="polaruser"
RPC_PASS="polarpass"
BACKEND_HOST="127.0.0.1:18443"
ALICE_MACAROON="/home/lnd/.lnd/data/chain/bitcoin/regtest/admin.macaroon"
ALICE_TLS="/home/lnd/.lnd/tls.cert"
CAROL_MACAROON="/home/lnd/.lnd/data/chain/bitcoin/regtest/admin.macaroon"
CAROL_TLS="/home/lnd/.lnd/tls.cert"
BOB_MACAROON="/home/lnd/.lnd/data/chain/bitcoin/regtest/admin.macaroon"
BOB_TLS="/home/lnd/.lnd/tls.cert"
WALLET_NAME="regtest"
REBALANCE_AMOUNT="250000"  # Amount to send for rebalancing

# Function to check if a container is healthy
wait_for_healthy() {
    local container=$1 timeout=$2 counter=0
    echo "Waiting for $container to be healthy..."
    while [ "$(docker inspect --format='{{.State.Health.Status}}' $container)" != "healthy" ]; do
        sleep 1
        counter=$((counter + 1))
        if [ $counter -ge $timeout ]; then
            echo "Error: $container not healthy after $timeout seconds"
            docker logs $container
            exit 1
        fi
    done
    echo "$container is healthy"
}

# Function to check if a file exists in a container
check_file() {
    local container=$1 file=$2 timeout=$3 counter=0
    echo "Checking for $file in $container..."
    while ! docker exec $container test -f "$file"; do
        sleep 1
        counter=$((counter + 1))
        if [ $counter -ge $timeout ]; then
            echo "Error: $file not found in $container after $timeout seconds"
            exit 1
        fi
    done
    echo "File $file exists in $container"
}

# Function to wait for LND to be fully synced
wait_for_lnd_sync() {
    local container=$1 host=$2 macaroon=$3 tls=$4 timeout=$5 expected_height=$6 counter=0
    echo "Waiting for $container to sync to at least height $expected_height..."
    while true; do
        GETINFO=$(docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls getinfo 2>/dev/null)
        SYNC_STATUS=$(echo "$GETINFO" | jq -r .synced_to_chain)
        BLOCK_HEIGHT=$(echo "$GETINFO" | jq -r .block_height)
        if [ "$SYNC_STATUS" = "true" ] && [ -n "$expected_height" ] && [ "$BLOCK_HEIGHT" -ge "$expected_height" ]; then
            echo "$container is synced (block height: $BLOCK_HEIGHT)"
            break
        fi
        echo "Waiting for $container to sync (synced: $SYNC_STATUS, height: $BLOCK_HEIGHT, attempt $((counter + 1)))..."
        sleep 1
        counter=$((counter + 1))
        if [ $counter -ge $timeout ]; then
            echo "Error: $container not synced after $timeout seconds"
            echo "Last getinfo: $GETINFO"
            echo "Attempting to generate a new block to trigger sync..."
            BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
            docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 1 "$BITCOIND_ADDRESS"
            sleep 5
            GETINFO=$(docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls getinfo 2>/dev/null)
            SYNC_STATUS=$(echo "$GETINFO" | jq -r .synced_to_chain)
            BLOCK_HEIGHT=$(echo "$GETINFO" | jq -r .block_height)
            if [ "$SYNC_STATUS" = "true" ] && [ -n "$expected_height" ] && [ "$BLOCK_HEIGHT" -ge "$expected_height" ]; then
                echo "$container is synced after generating new block (block height: $BLOCK_HEIGHT)"
                break
            fi
            echo "Error: $container still not synced after generating new block"
            echo "Last getinfo: $GETINFO"
            docker logs $container
            exit 1
        fi
    done
}

# Function to close inactive channels
close_inactive_channels() {
    local container=$1 host=$2 macaroon=$3 tls=$4
    echo "Checking for inactive channels in $container..."
    CHANNELS=$(docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls listchannels | jq -r '.channels[] | select(.active==false) | .chan_point' | grep -v '^null$' | grep -E '^[0-9a-f]{64}:[0-9]+$')
    if [ -n "$CHANNELS" ]; then
        echo "Found inactive channels in $container: $CHANNELS"
        while IFS= read -r chan_point; do
            if [[ "$chan_point" =~ ^[0-9a-f]{64}:[0-9]+$ ]]; then
                echo "Closing inactive channel: $chan_point"
                docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls closechannel --chan_point="$chan_point"
                sleep 2
                BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
                docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 1 "$BITCOIND_ADDRESS"
                sleep 2
            else
                echo "Skipping invalid channel point: $chan_point"
            fi
        done <<< "$CHANNELS"
        echo "Forcing wallet rescan for $container..."
        docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls wallet rescan --from_height=0 >/dev/null 2>&1
        sleep 5
    else
        echo "No valid inactive channels found in $container"
    fi
}

# Function to close excess active channels
close_excess_channels() {
    local container=$1 host=$2 macaroon=$3 tls=$4 remote_pubkey=$5
    echo "Checking for excess active channels from $container to $remote_pubkey..."
    CHANNELS=$(docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls listchannels | jq -r ".channels[] | select(.remote_pubkey==\"$remote_pubkey\" and .active==true) | .channel_point" | tail -n +2)
    if [ -n "$CHANNELS" ]; then
        echo "Found excess active channels from $container to $remote_pubkey: $CHANNELS"
        while IFS= read -r chan_point; do
            if [[ "$chan_point" =~ ^[0-9a-f]{64}:[0-9]+$ ]]; then
                echo "Closing excess channel: $chan_point"
                docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls closechannel --chan_point="$chan_point"
                sleep 2
                BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
                docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 6 "$BITCOIND_ADDRESS"
                sleep 2
            else
                echo "Skipping invalid channel point: $chan_point"
            fi
        done <<< "$CHANNELS"
        echo "Forcing wallet rescan for $container..."
        docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls wallet rescan --from_height=0 >/dev/null 2>&1
        sleep 5
    else
        echo "No excess active channels found from $container to $remote_pubkey"
    fi
}

# Function to wait for channel to be active
wait_for_channel_active() {
    local container=$1 host=$2 macaroon=$3 tls=$4 remote_pubkey=$5 timeout=$6 counter=0
    echo "Waiting for channel to $remote_pubkey to be active in $container..."
    while true; do
        CHANNEL_STATUS=$(docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls listchannels | jq -r ".channels[] | select(.remote_pubkey==\"$remote_pubkey\") | .active")
        if [ "$CHANNEL_STATUS" = "true" ]; then
            echo "Channel to $remote_pubkey is active in $container"
            break
        fi
        echo "Waiting for channel to $remote_pubkey to be active in $container (attempt $((counter + 1)))..."
        sleep 1
        counter=$((counter + 1))
        if [ $counter -ge $timeout ]; then
            echo "Error: Channel to $remote_pubkey not active in $container after $timeout seconds"
            docker logs $container
            exit 1
        fi
    done
}

# Function to ensure wallet is ready
ensure_wallet_ready() {
    local container=$1 host=$2 macaroon=$3 tls=$4 name=$5
    echo "Ensuring $name's wallet is ready..."
    if ! docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls getinfo >/dev/null 2>&1; then
        echo "Creating or unlocking $name's wallet..."
        docker exec $container lncli --rpcserver=$host:10009 create --no_seed_passphrase >/tmp/${name}_create.log 2>&1 || \
        docker exec $container lncli --rpcserver=$host:10009 unlock --no_seed_passphrase >/tmp/${name}_create.log 2>&1
        cat /tmp/${name}_create.log
        sleep 2
        if ! docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls getinfo >/dev/null 2>&1; then
            echo "Error: Failed to initialize $name's wallet"
            exit 1
        fi
    fi
    echo "$name's wallet is ready"
}

# Function to fund wallet
fund_wallet() {
    local container=$1 host=$2 macaroon=$3 tls=$4 name=$5 amount=$6
    echo "Checking $name's wallet balance..."
    BALANCE=$(docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls walletbalance | jq -r .confirmed_balance)
    echo "$name wallet balance: $BALANCE satoshis"
    if [ "$BALANCE" -lt "$amount" ]; then
        echo "Funding $name's wallet..."
        ADDRESS=$(docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls newaddress p2wkh | jq -r .address)
        if [ -z "$ADDRESS" ]; then
            echo "Error: Failed to get new address from $name"
            exit 1
        fi
        echo "$name address: $ADDRESS"
        VALIDATE_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME validateaddress "$ADDRESS")
        if ! echo "$VALIDATE_ADDRESS" | jq -r .isvalid | grep -q "true"; then
            echo "Error: Invalid address for $name: $ADDRESS"
            echo "Validation result: $VALIDATE_ADDRESS"
            exit 1
        fi
        for i in $(seq 1 3); do
            SEND_RESULT=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME sendtoaddress "$ADDRESS" 1.0 2>&1)
            if [ $? -eq 0 ]; then
                echo "Successfully sent funds to $name's address"
                break
            else
                echo "Failed to send funds to $name's address (attempt $i/3): $SEND_RESULT"
                sleep 2
            fi
            if [ $i -eq 3 ]; then
                echo "Error: Failed to send funds to $name's address after 3 retries"
                exit 1
            fi
        done
        BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
        if [ -z "$BITCOIND_ADDRESS" ]; then
            echo "Error: Failed to get new address for bitcoind"
            exit 1
        fi
        echo "Bitcoind address for $name funding: $BITCOIND_ADDRESS"
        VALIDATE_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME validateaddress "$BITCOIND_ADDRESS")
        if ! echo "$VALIDATE_ADDRESS" | jq -r .isvalid | grep -q "true"; then
            echo "Error: Invalid bitcoind address: $BITCOIND_ADDRESS"
            echo "Validation result: $VALIDATE_ADDRESS"
            exit 1
        fi
        for i in $(seq 1 3); do
            GEN_RESULT=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 3 "$BITCOIND_ADDRESS" 2>&1)
            if [ $? -eq 0 ]; then
                echo "Successfully generated blocks for $name funding"
                break
            else
                echo "Failed to generate blocks for $name funding (attempt $i/3): $GEN_RESULT"
                sleep 2
            fi
            if [ $i -eq 3 ]; then
                echo "Error: Failed to generate blocks for $name funding after 3 retries"
                exit 1
            fi
        done
        BACKEND_HEIGHT=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getblockcount)
        echo "Backend block height after funding $name: $BACKEND_HEIGHT"
        sleep 3
        echo "Forcing wallet rescan for $name..."
        docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls wallet rescan --from_height=0 >/dev/null 2>&1
        sleep 5
        BALANCE=$(docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls walletbalance | jq -r .confirmed_balance)
        echo "$name wallet balance after funding: $BALANCE satoshis"
        if [ "$BALANCE" -lt "$amount" ]; then
            echo "Error: Insufficient confirmed balance ($BALANCE satoshis) for channel funding ($amount satoshis)"
            exit 1
        fi
        wait_for_lnd_sync $container $host $macaroon $tls 60 $BACKEND_HEIGHT
    else
        echo "$name has sufficient balance for channel funding"
    fi
}

# Function to connect nodes
connect_nodes() {
    local container=$1 host=$2 macaroon=$3 tls=$4 remote_pubkey=$5 remote_host=$6 remote_port=$7 from_name=$8 to_name=$9
    echo "Connecting $from_name to $to_name..."
    for i in $(seq 1 3); do
        CONNECT_RESULT=$(docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls connect $remote_pubkey@$remote_host:$remote_port 2>&1)
        if echo "$CONNECT_RESULT" | grep -q "already connected"; then
            echo "$to_name already connected to $from_name"
            break
        elif echo "$CONNECT_RESULT" | grep -q "server is still in the process of starting"; then
            echo "Server starting, retrying ($i/3)..."
            sleep 2
        elif echo "$CONNECT_RESULT" | grep -q "connection.*initiated" || [ -z "$CONNECT_RESULT" ]; then
            sleep 1
            PEER_CHECK=$(docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls listpeers | jq -r ".peers[] | select(.pub_key==\"$remote_pubkey\")")
            if [ -n "$PEER_CHECK" ]; then
                echo "Successfully connected $to_name to $from_name"
                break
            else
                echo "Connection initiated, retrying ($i/3)..."
                sleep 2
            fi
        else
            echo "Error: Failed to connect: $CONNECT_RESULT"
            exit 1
        fi
        if [ $i -eq 3 ]; then
            echo "Error: Failed to connect after 3 retries"
            exit 1
        fi
    done
}

# Function to open channel
open_channel() {
    local container=$1 host=$2 macaroon=$3 tls=$4 remote_pubkey=$5 from_name=$6 to_name=$7
    CHANNEL_EXISTS=$(docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls listchannels | jq -r ".channels[] | select(.remote_pubkey==\"$remote_pubkey\" and .active==true) | .channel_point" | head -n 1)
    if [ -z "$CHANNEL_EXISTS" ]; then
        echo "Opening channel from $from_name to $to_name..."
        OPEN_RESULT=$(docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls openchannel --node_key=$remote_pubkey --local_amt=$CHANNEL_AMOUNT --push_amt=$PUSH_AMOUNT 2>&1)
        if echo "$OPEN_RESULT" | jq -e '.funding_txid' >/dev/null 2>&1; then
            echo "Successfully initiated channel from $from_name to $to_name: $OPEN_RESULT"
            BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
            docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 18 "$BITCOIND_ADDRESS" >/dev/null
            sleep 5
            BACKEND_HEIGHT=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getblockcount)
            wait_for_lnd_sync $container $host $macaroon $tls 60 $BACKEND_HEIGHT
            wait_for_lnd_sync $([ "$from_name" = "Alice" ] && echo $CAROL_CONTAINER || ([ "$from_name" = "Carol" ] && echo $BOB_CONTAINER || echo $ALICE_CONTAINER)) $([ "$from_name" = "Alice" ] && echo $CAROL_HOST || ([ "$from_name" = "Carol" ] && echo $BOB_HOST || echo $ALICE_HOST)) $([ "$from_name" = "Alice" ] && echo $CAROL_MACAROON || ([ "$from_name" = "Carol" ] && echo $BOB_MACAROON || echo $ALICE_MACAROON)) $([ "$from_name" = "Alice" ] && echo $CAROL_TLS || ([ "$from_name" = "Carol" ] && echo $BOB_TLS || echo $ALICE_TLS)) 60 $BACKEND_HEIGHT
            wait_for_channel_active $container $host $macaroon $tls $remote_pubkey 30
        else
            echo "Error: Failed to open channel from $from_name to $to_name: $OPEN_RESULT"
            docker logs $container
            exit 1
        fi
    else
        echo "Active channel from $from_name to $to_name already exists: $CHANNEL_EXISTS"
    fi
}

# Function to update channel policy
update_channel_policy() {
    local container=$1 host=$2 macaroon=$3 tls=$4 remote_pubkey=$5 chan_point=$6 from_name=$7 to_name=$8
    if [ -n "$chan_point" ]; then
        docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls updatechanpolicy --base_fee_msat=0 --fee_rate=0.000001 --time_lock_delta=18 --min_htlc_msat=1 --chan_point="$chan_point"
    else
        echo "Error: $from_name to $to_name channel point not found"
        exit 1
    fi
}

# New function to check channel balances and rebalance
rebalance_channel() {
    local sender_container=$1 sender_host=$2 sender_macaroon=$3 sender_tls=$4
    local receiver_container=$5 receiver_host=$6 receiver_macaroon=$7 receiver_tls=$8
    local sender_name=$9 receiver_name=${10} remote_pubkey=${11}
    local amount=$REBALANCE_AMOUNT
    local fee_limit=2000

    echo "Checking channel balance from $sender_name to $receiver_name..."
    CHANNEL_INFO=$(docker exec $sender_container lncli --rpcserver=$sender_host:10009 --macaroonpath=$sender_macaroon --tlscertpath=$sender_tls listchannels | jq -r ".channels[] | select(.remote_pubkey==\"$remote_pubkey\" and .active==true) | {local_balance: .local_balance, remote_balance: .remote_balance, chan_id: .chan_id}")
    if [ -n "$CHANNEL_INFO" ]; then
        LOCAL_BALANCE=$(echo "$CHANNEL_INFO" | jq -r .local_balance)
        REMOTE_BALANCE=$(echo "$CHANNEL_INFO" | jq -r .remote_balance)
        CHAN_ID=$(echo "$CHANNEL_INFO" | jq -r .chan_id)
        echo "$sender_name to $receiver_name channel - Local balance: $LOCAL_BALANCE, Remote balance: $REMOTE_BALANCE"
        
        # Check if rebalancing is needed (local balance too high or too low)
        TARGET_BALANCE=$((CHANNEL_AMOUNT / 2))  # Aim for 50/50 split
        BALANCE_THRESHOLD=$((CHANNEL_AMOUNT / 4))  # Allow some deviation
        if [ "$LOCAL_BALANCE" -gt $((TARGET_BALANCE + BALANCE_THRESHOLD)) ]; then
            echo "$sender_name has excess local balance ($LOCAL_BALANCE > $((TARGET_BALANCE + BALANCE_THRESHOLD))), sending $amount to $receiver_name..."
            INVOICE=$(docker exec $receiver_container lncli --rpcserver=$receiver_host:10009 --macaroonpath=$receiver_macaroon --tlscertpath=$receiver_tls addinvoice --amt=$amount | jq -r .payment_request)
            if [ -z "$INVOICE" ]; then
                echo "Error: Failed to create invoice for $receiver_name"
                return 1
            fi
            PAYMENT_LOG="/tmp/rebalance_${sender_name}_to_${receiver_name}.log"
            PAYMENT_RESULT=$(docker exec $sender_container lncli --rpcserver=$sender_host:10009 --macaroonpath=$sender_macaroon --tlscertpath=$sender_tls payinvoice --pay_req="$INVOICE" --fee_limit=$fee_limit > "$PAYMENT_LOG" 2>&1)
            PAYMENT_STATUS=$?
            if [ $PAYMENT_STATUS -eq 0 ] && grep -q "Payment.*status.*:.*SUCCEEDED" "$PAYMENT_LOG"; then
                echo "Successfully rebalanced by sending $amount from $sender_name to $receiver_name"
                cat "$PAYMENT_LOG"
                rm -f "$PAYMENT_LOG"
                # Generate blocks to confirm payment
                BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
                docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 6 "$BITCOIND_ADDRESS" >/dev/null
                sleep 5
                return 0
            else
                echo "Failed to rebalance from $sender_name to $receiver_name:"
                cat "$PAYMENT_LOG"
                rm -f "$PAYMENT_LOG"
                return 1
            fi
        elif [ "$LOCAL_BALANCE" -lt $((TARGET_BALANCE - BALANCE_THRESHOLD)) ]; then
            echo "$sender_name has low local balance ($LOCAL_BALANCE < $((TARGET_BALANCE - BALANCE_THRESHOLD))), attempting reverse rebalance..."
            INVOICE=$(docker exec $sender_container lncli --rpcserver=$sender_host:10009 --macaroonpath=$sender_macaroon --tlscertpath=$sender_tls addinvoice --amt=$amount | jq -r .payment_request)
            if [ -z "$INVOICE" ]; then
                echo "Error: Failed to create invoice for $sender_name"
                return 1
            fi
            PAYMENT_LOG="/tmp/rebalance_${receiver_name}_to_${sender_name}.log"
            PAYMENT_RESULT=$(docker exec $receiver_container lncli --rpcserver=$receiver_host:10009 --macaroonpath=$receiver_macaroon --tlscertpath=$receiver_tls payinvoice --pay_req="$INVOICE" --fee_limit=$fee_limit > "$PAYMENT_LOG" 2>&1)
            PAYMENT_STATUS=$?
            if [ $PAYMENT_STATUS -eq 0 ] && grep -q "Payment.*status.*:.*SUCCEEDED" "$PAYMENT_LOG"; then
                echo "Successfully rebalanced by sending $amount from $receiver_name to $sender_name"
                cat "$PAYMENT_LOG"
                rm -f "$PAYMENT_LOG"
                # Generate blocks to confirm payment
                BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
                docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 6 "$BITCOIND_ADDRESS" >/dev/null
                sleep 5
                return 0
            else
                echo "Failed to rebalance from $receiver_name to $sender_name:"
                cat "$PAYMENT_LOG"
                rm -f "$PAYMENT_LOG"
                return 1
            fi
        else
            echo "Channel between $sender_name and $receiver_name is sufficiently balanced"
            return 0
        fi
    else
        echo "No active channel found from $sender_name to $receiver_name"
        return 1
    fi
}

# Check for required host commands
command -v docker >/dev/null 2>&1 || { echo "Error: docker not found"; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "Error: docker-compose not found"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: jq not found; install with 'sudo apt-get install jq'"; exit 1; }

# Stop containers but keep volumes
echo "Stopping existing containers..."
docker compose -f docker-compose.test.yml down

# Start Docker services
echo "Starting Docker services for backend1, alice, carol, and bob..."
docker compose -f docker-compose.test.yml up backend1 alice carol bob -d --build --force-recreate

# Wait for containers to be healthy
wait_for_healthy $BACKEND_CONTAINER 30
wait_for_healthy $ALICE_CONTAINER 60
wait_for_healthy $CAROL_CONTAINER 60
wait_for_healthy $BOB_CONTAINER 60

# Create or load wallet in backend1
echo "Ensuring wallet is loaded in $BACKEND_CONTAINER..."
WALLET_LIST=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS listwallets 2>/dev/null)
if ! echo "$WALLET_LIST" | jq -e ".[] | select(.==\"$WALLET_NAME\")" >/dev/null 2>&1; then
    echo "Creating wallet '$WALLET_NAME'..."
    CREATE_RESULT=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS createwallet "$WALLET_NAME" 2>&1)
    if [ $? -ne 0 ]; then
        if echo "$CREATE_RESULT" | grep -q "Database already exists"; then
            echo "Wallet '$WALLET_NAME' exists, loading..."
            docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS loadwallet "$WALLET_NAME" >/dev/null 2>&1
            if [ $? -ne 0 ]; then
                echo "Error: Failed to load wallet '$WALLET_NAME': $CREATE_RESULT"
                exit 1
            fi
        else
            echo "Error: Failed to create wallet '$WALLET_NAME': $CREATE_RESULT"
            exit 1
        fi
    fi
else
    echo "Wallet '$WALLET_NAME' already exists"
    docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS loadwallet "$WALLET_NAME" >/dev/null 2>&1
fi
sleep 2

# Check bitcoind balance and fund if necessary
echo "Checking bitcoind wallet balance..."
BITCOIND_BALANCE=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getbalance)
echo "bitcoind wallet balance: $BITCOIND_BALANCE BTC"
if [ "$(echo "$BITCOIND_BALANCE < 3.0" | bc)" -eq 1 ]; then
    echo "Funding bitcoind wallet..."
    BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
    if [ -z "$BITCOIND_ADDRESS" ]; then
        echo "Error: Failed to get new address for bitcoind"
        exit 1
    fi
    echo "Bitcoind address: $BITCOIND_ADDRESS"
    VALIDATE_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME validateaddress "$BITCOIND_ADDRESS")
    if ! echo "$VALIDATE_ADDRESS" | jq -r .isvalid | grep -q "true"; then
        echo "Error: Invalid bitcoind address: $BITCOIND_ADDRESS"
        echo "Validation result: $VALIDATE_ADDRESS"
        exit 1
    fi
    docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 101 "$BITCOIND_ADDRESS" >/dev/null
    BITCOIND_BALANCE=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getbalance)
    echo "bitcoind wallet balance after funding: $BITCOIND_BALANCE BTC"
    if [ "$(echo "$BITCOIND_BALANCE < 3.0" | bc)" -eq 1 ]; then
        echo "Error: Insufficient bitcoind balance ($BITCOIND_BALANCE BTC) after funding"
        exit 1
    fi
fi
sleep 2

# Check for TLS and macaroon files
check_file $ALICE_CONTAINER $ALICE_TLS 30
check_file $ALICE_CONTAINER $ALICE_MACAROON 30
check_file $CAROL_CONTAINER $CAROL_TLS 30
check_file $CAROL_CONTAINER $CAROL_MACAROON 30
check_file $BOB_CONTAINER $BOB_TLS 30
check_file $BOB_CONTAINER $BOB_MACAROON 30

# Ensure wallets are ready
ensure_wallet_ready $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS "Alice"
ensure_wallet_ready $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS "Carol"
ensure_wallet_ready $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS "Bob"

# Get pubkeys
ALICE_PUBKEY=$(docker exec $ALICE_CONTAINER lncli --rpcserver=$ALICE_HOST:10009 --macaroonpath=$ALICE_MACAROON --tlscertpath=$ALICE_TLS getinfo | jq -r .identity_pubkey)
if [ -z "$ALICE_PUBKEY" ]; then echo "Error: Failed to retrieve Alice's pubkey"; exit 1; fi
echo "Alice pubkey: $ALICE_PUBKEY"
CAROL_PUBKEY=$(docker exec $CAROL_CONTAINER lncli --rpcserver=$CAROL_HOST:10009 --macaroonpath=$CAROL_MACAROON --tlscertpath=$CAROL_TLS getinfo | jq -r .identity_pubkey)
if [ -z "$CAROL_PUBKEY" ]; then echo "Error: Failed to retrieve Carol's pubkey"; exit 1; fi
echo "Carol pubkey: $CAROL_PUBKEY"
BOB_PUBKEY=$(docker exec $BOB_CONTAINER lncli --rpcserver=$BOB_HOST:10009 --macaroonpath=$BOB_MACAROON --tlscertpath=$BOB_TLS getinfo | jq -r .identity_pubkey)
if [ -z "$BOB_PUBKEY" ]; then echo "Error: Failed to retrieve Bob's pubkey"; exit 1; fi
echo "Bob pubkey: $BOB_PUBKEY"

# Get current block height
INITIAL_HEIGHT=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getblockcount)
echo "Initial block height: $INITIAL_HEIGHT"

# Sync to initial block height
wait_for_lnd_sync $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS 60 $INITIAL_HEIGHT
wait_for_lnd_sync $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS 60 $INITIAL_HEIGHT
wait_for_lnd_sync $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS 60 $INITIAL_HEIGHT

# Check channel balances and attempt rebalancing
echo "Checking and rebalancing channels..."
ALL_CHANNELS_BALANCED=true
rebalance_channel $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS \
                  $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS \
                  "Alice" "Carol" $CAROL_PUBKEY || ALL_CHANNELS_BALANCED=false
rebalance_channel $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS \
                  $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS \
                  "Carol" "Bob" $BOB_PUBKEY || ALL_CHANNELS_BALANCED=false
rebalance_channel $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS \
                  $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS \
                  "Bob" "Alice" $ALICE_PUBKEY || ALL_CHANNELS_BALANCED=false

if [ "$ALL_CHANNELS_BALANCED" = true ]; then
    echo "All channels are balanced or already exist, proceeding to final setup..."
    # Update channel policies
    echo "Updating channel policies..."
    ALICE_TO_CAROL_CHAN_POINT=$(docker exec $ALICE_CONTAINER lncli --rpcserver=$ALICE_HOST:10009 --macaroonpath=$ALICE_MACAROON --tlscertpath=$ALICE_TLS listchannels | jq -r ".channels[] | select(.remote_pubkey==\"$CAROL_PUBKEY\" and .active==true) | .channel_point" | head -n 1)
    update_channel_policy $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS $CAROL_PUBKEY "$ALICE_TO_CAROL_CHAN_POINT" "Alice" "Carol"
    update_channel_policy $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS $ALICE_PUBKEY "$ALICE_TO_CAROL_CHAN_POINT" "Carol" "Alice"

    CAROL_TO_BOB_CHAN_POINT=$(docker exec $CAROL_CONTAINER lncli --rpcserver=$CAROL_HOST:10009 --macaroonpath=$CAROL_MACAROON --tlscertpath=$CAROL_TLS listchannels | jq -r ".channels[] | select(.remote_pubkey==\"$BOB_PUBKEY\" and .active==true) | .channel_point" | head -n 1)
    update_channel_policy $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS $BOB_PUBKEY "$CAROL_TO_BOB_CHAN_POINT" "Carol" "Bob"
    update_channel_policy $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS $CAROL_PUBKEY "$CAROL_TO_BOB_CHAN_POINT" "Bob" "Carol"

    BOB_TO_ALICE_CHAN_POINT=$(docker exec $BOB_CONTAINER lncli --rpcserver=$BOB_HOST:10009 --macaroonpath=$BOB_MACAROON --tlscertpath=$BOB_TLS listchannels | jq -r ".channels[] | select(.remote_pubkey==\"$ALICE_PUBKEY\" and .active==true) | .channel_point" | head -n 1)
    update_channel_policy $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS $ALICE_PUBKEY "$BOB_TO_ALICE_CHAN_POINT" "Bob" "Alice"
    update_channel_policy $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS $BOB_PUBKEY "$BOB_TO_ALICE_CHAN_POINT" "Alice" "Bob"

    # Mine additional blocks to propagate channel updates
    echo "Mining additional blocks to propagate channel updates..."
    BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
    docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 100 "$BITCOIND_ADDRESS" >/dev/null
    sleep 10
    BACKEND_HEIGHT=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getblockcount)
    echo "Backend block height after channel update propagation: $BACKEND_HEIGHT"

    # Sync to new block height
    wait_for_lnd_sync $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS 60 $BACKEND_HEIGHT
    wait_for_lnd_sync $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS 60 $BACKEND_HEIGHT
    wait_for_lnd_sync $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS 60 $BACKEND_HEIGHT

    # Force gossip sync
    echo "Forcing gossip sync for all nodes..."
    docker exec $ALICE_CONTAINER lncli --rpcserver=$ALICE_HOST:10009 --macaroonpath=$ALICE_MACAROON --tlscertpath=$ALICE_TLS describegraph >/dev/null
    docker exec $CAROL_CONTAINER lncli --rpcserver=$CAROL_HOST:10009 --macaroonpath=$CAROL_MACAROON --tlscertpath=$CAROL_TLS describegraph >/dev/null
    docker exec $BOB_CONTAINER lncli --rpcserver=$BOB_HOST:10009 --macaroonpath=$BOB_MACAROON --tlscertpath=$BOB_TLS describegraph >/dev/null
    sleep 5

    # Skip to self-payment test
    echo "Channels already exist and are balanced, skipping to self-payment test..."
else
    echo "Some channels need setup or rebalancing failed, proceeding with full channel setup..."

    # Close inactive channels
    close_inactive_channels $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS
    close_inactive_channels $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS
    close_inactive_channels $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS

    # Generate a block to trigger ZMQ notifications
    echo "Generating a block to trigger ZMQ notifications..."
    BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
    docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 1 "$BITCOIND_ADDRESS"
    sleep 5
    INITIAL_HEIGHT=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getblockcount)
    echo "Updated initial block height: $INITIAL_HEIGHT"

    # Sync to initial block height
    wait_for_lnd_sync $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS 60 $INITIAL_HEIGHT
    wait_for_lnd_sync $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS 60 $INITIAL_HEIGHT
    wait_for_lnd_sync $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS 60 $INITIAL_HEIGHT

    # Fund wallets
    fund_wallet $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS "Alice" $CHANNEL_AMOUNT
    fund_wallet $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS "Carol" $CHANNEL_AMOUNT
    fund_wallet $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS "Bob" $CHANNEL_AMOUNT

    # Connect nodes
    connect_nodes $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS $CAROL_PUBKEY $CAROL_HOST $CAROL_PORT "Alice" "Carol"
    connect_nodes $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS $BOB_PUBKEY $BOB_HOST $BOB_PORT "Carol" "Bob"
    connect_nodes $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS $ALICE_PUBKEY $ALICE_HOST $ALICE_PORT "Bob" "Alice"

    # Close excess active channels
    close_excess_channels $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS $CAROL_PUBKEY
    close_excess_channels $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS $BOB_PUBKEY
    close_excess_channels $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS $ALICE_PUBKEY

    # Open channels
    open_channel $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS $CAROL_PUBKEY "Alice" "Carol"
    open_channel $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS $BOB_PUBKEY "Carol" "Bob"
    open_channel $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS $ALICE_PUBKEY "Bob" "Alice"

    # Update channel policies
    echo "Updating channel policies..."
    ALICE_TO_CAROL_CHAN_POINT=$(docker exec $ALICE_CONTAINER lncli --rpcserver=$ALICE_HOST:10009 --macaroonpath=$ALICE_MACAROON --tlscertpath=$ALICE_TLS listchannels | jq -r ".channels[] | select(.remote_pubkey==\"$CAROL_PUBKEY\" and .active==true) | .channel_point" | head -n 1)
    update_channel_policy $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS $CAROL_PUBKEY "$ALICE_TO_CAROL_CHAN_POINT" "Alice" "Carol"
    update_channel_policy $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS $ALICE_PUBKEY "$ALICE_TO_CAROL_CHAN_POINT" "Carol" "Alice"

    CAROL_TO_BOB_CHAN_POINT=$(docker exec $CAROL_CONTAINER lncli --rpcserver=$CAROL_HOST:10009 --macaroonpath=$CAROL_MACAROON --tlscertpath=$CAROL_TLS listchannels | jq -r ".channels[] | select(.remote_pubkey==\"$BOB_PUBKEY\" and .active==true) | .channel_point" | head -n 1)
    update_channel_policy $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS $BOB_PUBKEY "$CAROL_TO_BOB_CHAN_POINT" "Carol" "Bob"
    update_channel_policy $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS $CAROL_PUBKEY "$CAROL_TO_BOB_CHAN_POINT" "Bob" "Carol"

    BOB_TO_ALICE_CHAN_POINT=$(docker exec $BOB_CONTAINER lncli --rpcserver=$BOB_HOST:10009 --macaroonpath=$BOB_MACAROON --tlscertpath=$BOB_TLS listchannels | jq -r ".channels[] | select(.remote_pubkey==\"$ALICE_PUBKEY\" and .active==true) | .channel_point" | head -n 1)
    update_channel_policy $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS $ALICE_PUBKEY "$BOB_TO_ALICE_CHAN_POINT" "Bob" "Alice"
    update_channel_policy $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS $BOB_PUBKEY "$BOB_TO_ALICE_CHAN_POINT" "Alice" "Bob"

    # Mine additional blocks to propagate channel updates
    echo "Mining additional blocks to propagate channel updates..."
    BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
    docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 100 "$BITCOIND_ADDRESS" >/dev/null
    sleep 10
    BACKEND_HEIGHT=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getblockcount)
    echo "Backend block height after channel update propagation: $BACKEND_HEIGHT"

    # Sync to new block height
    wait_for_lnd_sync $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS 60 $BACKEND_HEIGHT
    wait_for_lnd_sync $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS 60 $BACKEND_HEIGHT
    wait_for_lnd_sync $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS 60 $BACKEND_HEIGHT

    # Force gossip sync
    echo "Forcing gossip sync for all nodes..."
    docker exec $ALICE_CONTAINER lncli --rpcserver=$ALICE_HOST:10009 --macaroonpath=$ALICE_MACAROON --tlscertpath=$ALICE_TLS describegraph >/dev/null
    docker exec $CAROL_CONTAINER lncli --rpcserver=$CAROL_HOST:10009 --macaroonpath=$CAROL_MACAROON --tlscertpath=$CAROL_TLS describegraph >/dev/null
    docker exec $BOB_CONTAINER lncli --rpcserver=$BOB_HOST:10009 --macaroonpath=$BOB_MACAROON --tlscertpath=$BOB_TLS describegraph >/dev/null
    sleep 5
fi

# Debug channel balances
echo "Debugging channel balances..."
ALICE_CHANNELS=$(docker exec $ALICE_CONTAINER lncli --rpcserver=$ALICE_HOST:10009 --macaroonpath=$ALICE_MACAROON --tlscertpath=$ALICE_TLS listchannels | jq '.channels[] | {chan_id: .chan_id, remote_pubkey: .remote_pubkey, local_balance: .local_balance, remote_balance: .remote_balance}')
CAROL_CHANNELS=$(docker exec $CAROL_CONTAINER lncli --rpcserver=$CAROL_HOST:10009 --macaroonpath=$CAROL_MACAROON --tlscertpath=$CAROL_TLS listchannels | jq '.channels[] | {chan_id: .chan_id, remote_pubkey: .remote_pubkey, local_balance: .local_balance, remote_balance: .remote_balance}')
BOB_CHANNELS=$(docker exec $BOB_CONTAINER lncli --rpcserver=$BOB_HOST:10009 --macaroonpath=$BOB_MACAROON --tlscertpath=$BOB_TLS listchannels | jq '.channels[] | {chan_id: .chan_id, remote_pubkey: .remote_pubkey, local_balance: .local_balance, remote_balance: .remote_balance}')
echo "Alice channels: $ALICE_CHANNELS"
echo "Carol channels: $CAROL_CHANNELS"
echo "Bob channels: $BOB_CHANNELS"

# Debug routing table
echo "Debugging routing table..."
ALICE_GRAPH=$(docker exec $ALICE_CONTAINER lncli --rpcserver=$ALICE_HOST:10009 --macaroonpath=$ALICE_MACAROON --tlscertpath=$ALICE_TLS describegraph | jq '.edges[] | select(.node1_pub == "'$ALICE_PUBKEY'" or .node2_pub == "'$ALICE_PUBKEY'")')
CAROL_GRAPH=$(docker exec $CAROL_CONTAINER lncli --rpcserver=$CAROL_HOST:10009 --macaroonpath=$CAROL_MACAROON --tlscertpath=$CAROL_TLS describegraph | jq '.edges[] | select(.node1_pub == "'$CAROL_PUBKEY'" or .node2_pub == "'$CAROL_PUBKEY'")')
BOB_GRAPH=$(docker exec $BOB_CONTAINER lncli --rpcserver=$BOB_HOST:10009 --macaroonpath=$BOB_MACAROON --tlscertpath=$BOB_TLS describegraph | jq '.edges[] | select(.node1_pub == "'$BOB_PUBKEY'" or .node2_pub == "'$BOB_PUBKEY'")')
echo "Alice routing table: $ALICE_GRAPH"
echo "Carol routing table: $CAROL_GRAPH"
echo "Bob routing table: $BOB_GRAPH"

# Debug proposed route
echo "Debugging proposed route for self-payment..."
PROPOSED_ROUTE=$(docker exec $ALICE_CONTAINER lncli --rpcserver=$ALICE_HOST:10009 --macaroonpath=$ALICE_MACAROON --tlscertpath=$ALICE_TLS queryroutes --dest=$ALICE_PUBKEY --amt=100000 --fee_limit=2000 2>&1)
echo "Proposed route: $PROPOSED_ROUTE"

# Test self-payment
echo "Testing self-payment from Alice to herself..."
ALICE_INVOICE=$(docker exec $ALICE_CONTAINER lncli --rpcserver=$ALICE_HOST:10009 --macaroonpath=$ALICE_MACAROON --tlscertpath=$ALICE_TLS addinvoice --amt=100000 | jq -r .payment_request)
if [ -z "$ALICE_INVOICE" ]; then
    echo "Error: Failed to create invoice for Alice"
    exit 1
fi
echo "Alice invoice: $ALICE_INVOICE"

RETRY_COUNT=0
RETRY_MAX=3
while [ $RETRY_COUNT -lt $RETRY_MAX ]; do
    PAYMENT_LOG="/tmp/payinvoice_$RETRY_COUNT.log"
    PAYMENT_RESULT=$(docker exec $ALICE_CONTAINER lncli --rpcserver=$ALICE_HOST:10009 --macaroonpath=$ALICE_MACAROON --tlscertpath=$ALICE_TLS payinvoice --pay_req="$ALICE_INVOICE" --allow_self_payment --force --fee_limit=2000 > "$PAYMENT_LOG" 2>&1)
    PAYMENT_STATUS=$?
    if [ $PAYMENT_STATUS -eq 0 ] && grep -q "Payment.*status.*:.*SUCCEEDED" "$PAYMENT_LOG"; then
        echo "Self-payment from Alice succeeded:"
        cat "$PAYMENT_LOG"
        rm -f "$PAYMENT_LOG"
        break
    else
        echo "Self-payment attempt $((RETRY_COUNT + 1))/$RETRY_MAX failed:"
        cat "$PAYMENT_LOG"
        echo "Debugging proposed route after failure..."
        PROPOSED_ROUTE=$(docker exec $ALICE_CONTAINER lncli --rpcserver=$ALICE_HOST:10009 --macaroonpath=$ALICE_MACAROON --tlscertpath=$ALICE_TLS queryroutes --dest=$ALICE_PUBKEY --amt=100000 --fee_limit=2000 2>&1)
        echo "Proposed route: $PROPOSED_ROUTE"
        echo "Checking Alice's logs for payment errors..."
        docker logs $ALICE_CONTAINER | tail -n 50 > /tmp/alice_logs_$RETRY_COUNT.log
        echo "Last 50 lines of Alice's logs saved to /tmp/alice_logs_$RETRY_COUNT.log"
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -lt $RETRY_MAX ]; then
            echo "Mining additional blocks to resolve potential CLTV or sync issues..."
            BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
            docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 100 "$BITCOIND_ADDRESS" >/dev/null
            sleep 10
            BACKEND_HEIGHT=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getblockcount)
            echo "Backend block height after retry $((RETRY_COUNT + 1)): $BACKEND_HEIGHT"
            wait_for_lnd_sync $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS 60 $BACKEND_HEIGHT
            wait_for_lnd_sync $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS 60 $BACKEND_HEIGHT
            wait_for_lnd_sync $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS 60 $BACKEND_HEIGHT
            echo "Forcing gossip sync for all nodes..."
            docker exec $ALICE_CONTAINER lncli --rpcserver=$ALICE_HOST:10009 --macaroonpath=$ALICE_MACAROON --tlscertpath=$ALICE_TLS describegraph >/dev/null
            docker exec $CAROL_CONTAINER lncli --rpcserver=$CAROL_HOST:10009 --macaroonpath=$CAROL_MACAROON --tlscertpath=$CAROL_TLS describegraph >/dev/null
            docker exec $BOB_CONTAINER lncli --rpcserver=$BOB_HOST:10009 --macaroonpath=$BOB_MACAROON --tlscertpath=$BOB_TLS describegraph >/dev/null
            sleep 5
        else
            echo "Error: Self-payment failed after $RETRY_MAX retries"
            echo "Last payment attempt output:"
            cat "$PAYMENT_LOG"
            echo "Last proposed route: $PROPOSED_ROUTE"
            echo "Checking logs for all nodes..."
            docker logs $ALICE_CONTAINER | tail -n 50 > /tmp/alice_logs_final.log
            docker logs $CAROL_CONTAINER | tail -n 50 > /tmp/carol_logs_final.log
            docker logs $BOB_CONTAINER | tail -n 50 > /tmp/bob_logs_final.log
            echo "Final logs saved to /tmp/alice_logs_final.log, /tmp/carol_logs_final.log, /tmp/bob_logs_final.log"
            exit 1
        fi
    fi
done

# Start postgres and server
echo "Starting postgres and server..."
docker compose -f docker-compose.test.yml up postgres_ln_test server --build --force-recreate --abort-on-container-exit

echo "Channel setup and self-payment test complete"