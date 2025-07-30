#!/bin/bash

# Stop and restart containers
echo "Restarting Docker services..."
./init-stop-all.sh
docker compose -f docker-compose.e2e.yml up backend1 alice carol bob -d --build

./init-regtest-lightning.sh

# Start postgres and server
echo "Starting postgres and server..."
docker compose -f docker-compose.e2e.yml up postgres_ln_test server --build --abort-on-container-exit

echo "Channel setup complete with sufficient liquidity"
