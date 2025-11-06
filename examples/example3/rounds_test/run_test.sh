#!/bin/bash

# Base paths
BASE_DIR="examples/example3"
OUTPUT_DIR="/c/tmp/dialectic/example3/rounds_test"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Run debates with rounds 1-5
dialectic debate -r 1 -c "$BASE_DIR/debate-config.json" -o "$OUTPUT_DIR/all_agents_1R_no_clarify.json" -p "$BASE_DIR/problem.md" -v
dialectic debate -r 2 -c "$BASE_DIR/debate-config.json" -o "$OUTPUT_DIR/all_agents_2R_no_clarify.json" -p "$BASE_DIR/problem.md" -v
dialectic debate -r 3 -c "$BASE_DIR/debate-config.json" -o "$OUTPUT_DIR/all_agents_3R_no_clarify.json" -p "$BASE_DIR/problem.md" -v
# dialectic debate -r 4 -c "$BASE_DIR/debate-config.json" -o "$OUTPUT_DIR/all_agents_4R_no_clarify.json" -p "$BASE_DIR/problem.md" -v
# dialectic debate -r 5 -c "$BASE_DIR/debate-config.json" -o "$OUTPUT_DIR/all_agents_5R_no_clarify.json" -p "$BASE_DIR/problem.md" -v

