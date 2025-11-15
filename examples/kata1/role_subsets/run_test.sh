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
BASE_DIR="examples/kata1"

# Run debates with different role subsets
dialectic debate -r 2 -c "$BASE_DIR/debate-config.json" -o "$OUTPUT_DIR/arch-perf-sec-kiss.json" -p "$BASE_DIR/problem.md" -v
dialectic debate -r 2 -c "$BASE_DIR/role_subsets/debate-arch-arch.json" -o "$OUTPUT_DIR/arch-arch.json" -p "$BASE_DIR/problem.md" -v
dialectic debate -r 2 -c "$BASE_DIR/role_subsets/debate-arch-kiss.json" -o "$OUTPUT_DIR/arch-kiss.json" -p "$BASE_DIR/problem.md" -v
dialectic debate -r 2 -c "$BASE_DIR/role_subsets/debate-arch-perf-kiss.json" -o "$OUTPUT_DIR/arch-perf-kiss.json" -p "$BASE_DIR/problem.md" -v
dialectic debate -r 2 -c "$BASE_DIR/role_subsets/debate-arch-arch-kiss.json" -o "$OUTPUT_DIR/arch-arch-kiss.json" -p "$BASE_DIR/problem.md" -v

