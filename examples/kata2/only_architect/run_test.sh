#!/bin/bash

# Check if output directory argument is provided
if [ -z "$1" ]; then
    echo "Error: Output directory argument is required" >&2
    exit 1
fi

OUTPUT_DIR="$1"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

dialectic debate -r 1 -c examples/kata2/only_architect/debate-config.json -o "$OUTPUT_DIR/all_agents_1R_no_clarify.json" -p examples/kata2/problem.md -v
dialectic debate -r 2 -c examples/kata2/only_architect/debate-config.json -o "$OUTPUT_DIR/all_agents_2R_no_clarify.json" -p examples/kata2/problem.md -v
dialectic debate -r 3 -c examples/kata2/only_architect/debate-config.json -o "$OUTPUT_DIR/all_agents_3R_no_clarify.json" -p examples/kata2/problem.md -v
dialectic debate -r 4 -c examples/kata2/only_architect/debate-config.json -o "$OUTPUT_DIR/all_agents_4R_no_clarify.json" -p examples/kata2/problem.md -v
dialectic debate -r 5 -c examples/kata2/only_architect/debate-config.json -o "$OUTPUT_DIR/all_agents_5R_no_clarify.json" -p examples/kata2/problem.md -v
