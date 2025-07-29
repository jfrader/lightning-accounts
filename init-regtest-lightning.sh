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
REBALANCE_AMOUNT="250000"
TIMEOUT=30

# Function to check if a container is healthy
wait_for_healthy() {
    local container=$1 timeout=$2 counter=0
    echo "Waiting for $container to be healthy..."
    while [ "$(docker inspect --format='{{.State.Health.Status}}' $container)" != "healthy" ]; do
        sleep 1
        ((counter++))
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
        ((counter++))
        if [ $counter -ge $timeout ]; then
            echo "Error: $file not found in $container after $timeout seconds"
            exit 1
        fi
    done
    echo "File $file exists in $container"
}

# Function to wait for LND to be synced
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

        BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
        docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 6 "$BITCOIND_ADDRESS"

        sleep 1
        ((counter++))
        if [ $counter -ge $timeout ]; then
            echo "Error: $container not synced after $timeout seconds"
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
        sleep 2
        if ! docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls getinfo >/dev/null 2>&1; then
            echo "Error: Failed to initialize $name's wallet"
            cat /tmp/${name}_create.log
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
    if [ "$BALANCE" -lt "$amount" ]; then
        echo "Funding $name's wallet..."
        ADDRESS=$(docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls newaddress p2wkh | jq -r .address)
        if [ -z "$ADDRESS" ]; then
            echo "Error: Failed to get new address from $name"
            exit 1
        fi
        docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME sendtoaddress "$ADDRESS" 1.0
        BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
        docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 3 "$BITCOIND_ADDRESS"
        sleep 3
        BACKEND_HEIGHT=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getblockcount)
        wait_for_lnd_sync $container $host $macaroon $tls 30 $BACKEND_HEIGHT
        BALANCE=$(docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls walletbalance | jq -r .confirmed_balance)
        if [ "$BALANCE" -lt "$amount" ]; then
            echo "Error: Insufficient confirmed balance ($BALANCE satoshis) for channel funding"
            exit 1
        fi
    else
        echo "$name has sufficient balance ($BALANCE satoshis)"
    fi
}

# Function to connect nodes
connect_nodes() {
    local container=$1 host=$2 macaroon=$3 tls=$4 remote_pubkey=$5 remote_host=$6 remote_port=$7 from_name=$8 to_name=$9
    echo "Connecting $from_name to $to_name..."
    CONNECT_RESULT=$(docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls connect $remote_pubkey@$remote_host:$remote_port 2>&1)
    if echo "$CONNECT_RESULT" | grep -q "already connected" || [ -z "$CONNECT_RESULT" ]; then
        echo "$to_name already connected to $from_name"
    else
        sleep 1
        if ! docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls listpeers | jq -r ".peers[] | select(.pub_key==\"$remote_pubkey\")" | grep -q .; then
            echo "Error: Failed to connect $from_name to $to_name: $CONNECT_RESULT"
            exit 1
        fi
        echo "Successfully connected $from_name to $to_name"
    fi
}

# Function to open channel
open_channel() {
    local container=$1 host=$2 macaroon=$3 tls=$4 remote_pubkey=$5 from_name=$6 to_name=$7
    if ! docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls listchannels | jq -r ".channels[] | select(.remote_pubkey==\"$remote_pubkey\" and .active==true)" | grep -q .; then
        echo "Opening channel from $from_name to $to_name..."
        OPEN_RESULT=$(docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls openchannel --node_key=$remote_pubkey --local_amt=$CHANNEL_AMOUNT --push_amt=$PUSH_AMOUNT 2>&1)
        if echo "$OPEN_RESULT" | jq -e '.funding_txid' >/dev/null 2>&1; then
            BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
            docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 6 "$BITCOIND_ADDRESS"
            sleep 3
            BACKEND_HEIGHT=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getblockcount)
            wait_for_lnd_sync $container $host $macaroon $tls 30 $BACKEND_HEIGHT
            wait_for_lnd_sync $([ "$from_name" = "Alice" ] && echo $CAROL_CONTAINER || ([ "$from_name" = "Carol" ] && echo $BOB_CONTAINER || echo $ALICE_CONTAINER)) \
                $([ "$from_name" = "Alice" ] && echo $CAROL_HOST || ([ "$from_name" = "Carol" ] && echo $BOB_HOST || echo $ALICE_HOST)) \
                $([ "$from_name" = "Alice" ] && echo $CAROL_MACAROON || ([ "$from_name" = "Carol" ] && echo $BOB_MACAROON || echo $ALICE_MACAROON)) \
                $([ "$from_name" = "Alice" ] && echo $CAROL_TLS || ([ "$from_name" = "Carol" ] && echo $BOB_TLS || echo $ALICE_TLS)) 30 $BACKEND_HEIGHT
            if ! docker exec $container lncli --rpcserver=$host:10009 --macaroonpath=$macaroon --tlscertpath=$tls listchannels | jq -r ".channels[] | select(.remote_pubkey==\"$remote_pubkey\" and .active==true)" | grep -q .; then
                echo "Error: Channel from $from_name to $to_name not active"
                docker logs $container
                exit 1
            fi
            echo "Channel from $from_name to $to_name opened"
        else
            echo "Error: Failed to open channel from $from_name to $to_name: $OPEN_RESULT"
            exit 1
        fi
    else
        echo "Active channel from $from_name to $to_name already exists"
    fi
}

# Function to rebalance channel if needed
rebalance_channel() {
    local sender_container=$1 sender_host=$2 sender_macaroon=$3 sender_tls=$4
    local receiver_container=$5 receiver_host=$6 receiver_macaroon=$7 receiver_tls=$8
    local sender_name=$9 receiver_name=${10} remote_pubkey=${11}
    local amount=$REBALANCE_AMOUNT
    local fee_limit=1000

    CHANNEL_INFO=$(docker exec $sender_container lncli --rpcserver=$sender_host:10009 --macaroonpath=$sender_macaroon --tlscertpath=$sender_tls listchannels | jq -r ".channels[] | select(.remote_pubkey==\"$remote_pubkey\" and .active==true) | {local_balance: .local_balance, chan_id: .chan_id}")
    if [ -n "$CHANNEL_INFO" ]; then
        LOCAL_BALANCE=$(echo "$CHANNEL_INFO" | jq -r .local_balance)
        CHAN_ID=$(echo "$CHANNEL_INFO" | jq -r .chan_id)
        if [ "$LOCAL_BALANCE" -gt $((CHANNEL_AMOUNT - PUSH_AMOUNT)) ]; then
            echo "Rebalancing channel from $sender_name to $receiver_name (local balance: $LOCAL_BALANCE)..."
            INVOICE=$(docker exec $receiver_container lncli --rpcserver=$receiver_host:10009 --macaroonpath=$receiver_macaroon --tlscertpath=$receiver_tls addinvoice --amt=$amount | jq -r .payment_request)
            if [ -z "$INVOICE" ]; then
                echo "Error: Failed to create invoice for $receiver_name"
                return 1
            fi
            PAYMENT_RESULT=$(docker exec $sender_container lncli --rpcserver=$sender_host:10009 --macaroonpath=$sender_macaroon --tlscertpath=$sender_tls payinvoice --pay_req="$INVOICE" --fee_limit=$fee_limit 2>&1)
            if echo "$PAYMENT_RESULT" | grep -q "status.*:.*SUCCEEDED"; then
                echo "Successfully rebalanced channel from $sender_name to $receiver_name"
                BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
                docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 6 "$BITCOIND_ADDRESS"
                sleep 3
                return 0
            else
                echo "Failed to rebalance channel from $sender_name to $receiver_name: $PAYMENT_RESULT"
                return 1
            fi
        else
            echo "Channel from $sender_name to $receiver_name is balanced (local balance: $LOCAL_BALANCE)"
            return 0
        fi
    else
        echo "No active channel found from $sender_name to $receiver_name"
        return 1
    fi
}

# Check for required commands
command -v docker >/dev/null 2>&1 || { echo "Error: docker not found"; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "Error: docker-compose not found"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: jq not found; install with 'sudo apt-get install jq'"; exit 1; }

# Stop and restart containers
echo "Restarting Docker services..."
docker compose -f docker-compose.test.yml down
docker compose -f docker-compose.test.yml up backend1 alice carol bob -d --build --force-recreate

# Wait for containers to be healthy
wait_for_healthy $BACKEND_CONTAINER $TIMEOUT
wait_for_healthy $ALICE_CONTAINER $TIMEOUT
wait_for_healthy $CAROL_CONTAINER $TIMEOUT
wait_for_healthy $BOB_CONTAINER $TIMEOUT

# Ensure bitcoind wallet
echo "Ensuring bitcoind wallet..."
WALLET_LIST=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS listwallets 2>/dev/null)
if ! echo "$WALLET_LIST" | jq -e ".[] | select(.==\"$WALLET_NAME\")" >/dev/null; then
    docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS createwallet "$WALLET_NAME"
fi
docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS loadwallet "$WALLET_NAME"

# Fund bitcoind if needed
BITCOIND_BALANCE=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getbalance)
if [ "$(echo "$BITCOIND_BALANCE < 3.0" | bc)" -eq 1 ]; then
    echo "Funding bitcoind wallet..."
    BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
    docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 101 "$BITCOIND_ADDRESS"
fi

# Check TLS and macaroon files
check_file $ALICE_CONTAINER $ALICE_TLS $TIMEOUT
check_file $ALICE_CONTAINER $ALICE_MACAROON $TIMEOUT
check_file $CAROL_CONTAINER $CAROL_TLS $TIMEOUT
check_file $CAROL_CONTAINER $CAROL_MACAROON $TIMEOUT
check_file $BOB_CONTAINER $BOB_TLS $TIMEOUT
check_file $BOB_CONTAINER $BOB_MACAROON $TIMEOUT

# Ensure wallets are ready
ensure_wallet_ready $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS "Alice"
ensure_wallet_ready $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS "Carol"
ensure_wallet_ready $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS "Bob"

# Get pubkeys
ALICE_PUBKEY=$(docker exec $ALICE_CONTAINER lncli --rpcserver=$ALICE_HOST:10009 --macaroonpath=$ALICE_MACAROON --tlscertpath=$ALICE_TLS getinfo | jq -r .identity_pubkey)
CAROL_PUBKEY=$(docker exec $CAROL_CONTAINER lncli --rpcserver=$CAROL_HOST:10009 --macaroonpath=$CAROL_MACAROON --tlscertpath=$CAROL_TLS getinfo | jq -r .identity_pubkey)
BOB_PUBKEY=$(docker exec $BOB_CONTAINER lncli --rpcserver=$BOB_HOST:10009 --macaroonpath=$BOB_MACAROON --tlscertpath=$BOB_TLS getinfo | jq -r .identity_pubkey)

# Fund wallets
BACKEND_HEIGHT=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getblockcount)
fund_wallet $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS "Alice" $CHANNEL_AMOUNT
fund_wallet $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS "Carol" $CHANNEL_AMOUNT
fund_wallet $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS "Bob" $CHANNEL_AMOUNT

# Sync nodes
wait_for_lnd_sync $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS $TIMEOUT $BACKEND_HEIGHT
wait_for_lnd_sync $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS $TIMEOUT $BACKEND_HEIGHT
wait_for_lnd_sync $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS $TIMEOUT $BACKEND_HEIGHT

# Connect nodes
connect_nodes $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS $CAROL_PUBKEY $CAROL_HOST $CAROL_PORT "Alice" "Carol"
connect_nodes $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS $BOB_PUBKEY $BOB_HOST $BOB_PORT "Carol" "Bob"
connect_nodes $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS $ALICE_PUBKEY $ALICE_HOST $ALICE_PORT "Bob" "Alice"

# Open channels
open_channel $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS $CAROL_PUBKEY "Alice" "Carol"
open_channel $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS $BOB_PUBKEY "Carol" "Bob"
open_channel $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS $ALICE_PUBKEY "Bob" "Alice"

# Rebalance channels if needed
rebalance_channel $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS \
                  $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS \
                  "Alice" "Carol" $CAROL_PUBKEY
rebalance_channel $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS \
                  $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS \
                  "Carol" "Bob" $BOB_PUBKEY
rebalance_channel $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS \
                  $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS \
                  "Bob" "Alice" $ALICE_PUBKEY

# Update channel policies
ALICE_TO_CAROL_CHAN_POINT=$(docker exec $ALICE_CONTAINER lncli --rpcserver=$ALICE_HOST:10009 --macaroonpath=$ALICE_MACAROON --tlscertpath=$ALICE_TLS listchannels | jq -r ".channels[] | select(.remote_pubkey==\"$CAROL_PUBKEY\" and .active==true) | .channel_point" | head -n 1)
docker exec $ALICE_CONTAINER lncli --rpcserver=$ALICE_HOST:10009 --macaroonpath=$ALICE_MACAROON --tlscertpath=$ALICE_TLS updatechanpolicy --base_fee_msat=0 --fee_rate=0.000001 --time_lock_delta=18 --min_htlc_msat=1 --chan_point="$ALICE_TO_CAROL_CHAN_POINT"
docker exec $CAROL_CONTAINER lncli --rpcserver=$CAROL_HOST:10009 --macaroonpath=$CAROL_MACAROON --tlscertpath=$CAROL_TLS updatechanpolicy --base_fee_msat=0 --fee_rate=0.000001 --time_lock_delta=18 --min_htlc_msat=1 --chan_point="$ALICE_TO_CAROL_CHAN_POINT"

CAROL_TO_BOB_CHAN_POINT=$(docker exec $CAROL_CONTAINER lncli --rpcserver=$CAROL_HOST:10009 --macaroonpath=$CAROL_MACAROON --tlscertpath=$CAROL_TLS listchannels | jq -r ".channels[] | select(.remote_pubkey==\"$BOB_PUBKEY\" and .active==true) | .channel_point" | head -n 1)
docker exec $CAROL_CONTAINER lncli --rpcserver=$CAROL_HOST:10009 --macaroonpath=$CAROL_MACAROON --tlscertpath=$CAROL_TLS updatechanpolicy --base_fee_msat=0 --fee_rate=0.000001 --time_lock_delta=18 --min_htlc_msat=1 --chan_point="$CAROL_TO_BOB_CHAN_POINT"
docker exec $BOB_CONTAINER lncli --rpcserver=$BOB_HOST:10009 --macaroonpath=$BOB_MACAROON --tlscertpath=$BOB_TLS updatechanpolicy --base_fee_msat=0 --fee_rate=0.000001 --time_lock_delta=18 --min_htlc_msat=1 --chan_point="$CAROL_TO_BOB_CHAN_POINT"

BOB_TO_ALICE_CHAN_POINT=$(docker exec $BOB_CONTAINER lncli --rpcserver=$BOB_HOST:10009 --macaroonpath=$BOB_MACAROON --tlscertpath=$BOB_TLS listchannels | jq -r ".channels[] | select(.remote_pubkey==\"$ALICE_PUBKEY\" and .active==true) | .channel_point" | head -n 1)
docker exec $BOB_CONTAINER lncli --rpcserver=$BOB_HOST:10009 --macaroonpath=$BOB_MACAROON --tlscertpath=$BOB_TLS updatechanpolicy --base_fee_msat=0 --fee_rate=0.000001 --time_lock_delta=18 --min_htlc_msat=1 --chan_point="$BOB_TO_ALICE_CHAN_POINT"
docker exec $ALICE_CONTAINER lncli --rpcserver=$ALICE_HOST:10009 --macaroonpath=$ALICE_MACAROON --tlscertpath=$ALICE_TLS updatechanpolicy --base_fee_msat=0 --fee_rate=0.000001 --time_lock_delta=18 --min_htlc_msat=1 --chan_point="$BOB_TO_ALICE_CHAN_POINT"

# Propagate channel updates
BITCOIND_ADDRESS=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getnewaddress)
docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME generatetoaddress 6 "$BITCOIND_ADDRESS"
sleep 3
BACKEND_HEIGHT=$(docker exec $BACKEND_CONTAINER bitcoin-cli -rpcconnect=$BACKEND_HOST -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS -rpcwallet=$WALLET_NAME getblockcount)
wait_for_lnd_sync $ALICE_CONTAINER $ALICE_HOST $ALICE_MACAROON $ALICE_TLS $TIMEOUT $BACKEND_HEIGHT
wait_for_lnd_sync $CAROL_CONTAINER $CAROL_HOST $CAROL_MACAROON $CAROL_TLS $TIMEOUT $BACKEND_HEIGHT
wait_for_lnd_sync $BOB_CONTAINER $BOB_HOST $BOB_MACAROON $BOB_TLS $TIMEOUT $BACKEND_HEIGHT

# Start postgres and server
echo "Starting postgres and server..."
docker compose -f docker-compose.test.yml up postgres_ln_test server --build --force-recreate

echo "Channel setup complete with sufficient liquidity"