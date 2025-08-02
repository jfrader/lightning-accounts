#!/bin/bash
export NODE_ENV=development 

# Stop and restart containers
echo "Restarting Docker services..."
./init-stop-all.sh
docker compose up backend1 alice carol bob -d --build

# Start postgres and server
echo "Starting postgres and server..."
docker compose up postgres_ln server --build --abort-on-container-exit

echo "Channel setup complete with sufficient liquidity"
