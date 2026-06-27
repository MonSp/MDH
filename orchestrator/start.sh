#!/bin/bash
set -a
source /home/test/MDH/.env
set +a
cd /home/test/MDH/orchestrator
exec node --import tsx src/cli.ts --port=9090 --executor=http://localhost:8767 --workspace=/workspace
