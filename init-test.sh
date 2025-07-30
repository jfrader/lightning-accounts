#!/bin/bash
export NODE_ENV=test 

# Stop and restart containers
echo "Restarting Docker services..."
./init-stop-all.sh
docker compose -f docker-compose.test.yml up backend1 alice carol bob -d --build

./init-regtest-lightning.sh
if [ $? -ne 0 ]; then
  echo "Error: init-regtest-lightning.sh failed. Aborting."
  exit 1
fi

# Start postgres and server
echo "Starting postgres and server..."
docker compose -f docker-compose.test.yml up postgres_ln_test server --build --abort-on-container-exit

echo "Channel setup complete with sufficient liquidity"
