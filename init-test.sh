#!/bin/bash

export NODE_ENV=test 
docker compose -f docker-compose.test.yml down && \
docker compose -f docker-compose.test.yml up --force-recreate alice carol bob backend1 -d && \
docker compose -f docker-compose.test.yml up postgres_ln_test --force-recreate -d && \
docker compose -f docker-compose.test.yml up server --build --force-recreate --abort-on-container-exit
