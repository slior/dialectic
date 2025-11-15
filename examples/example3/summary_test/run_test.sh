#!/bin/bash

# Check if output directory argument is provided
if [ -z "$1" ]; then
    echo "Error: Output directory argument is required" >&2
    exit 1
fi

OUTPUT_DIR="$1"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Base paths
BASE_DIR="examples/example3"

# Run debates with rounds 1-5
dialectic debate -r 3 -c "$BASE_DIR/debate-config.json" -o "$OUTPUT_DIR/all_agents_with_summary.json" -p "$BASE_DIR/problem.md" -v
dialectic debate -r 3 -c "$BASE_DIR/summary_test/debate-config_no_summary.json" -o "$OUTPUT_DIR/all_agents_no_summary.json" -p "$BASE_DIR/problem.md" -v

