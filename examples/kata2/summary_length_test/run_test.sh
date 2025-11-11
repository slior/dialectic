#!/bin/bash

# Check if output directory argument is provided
if [ -z "$1" ]; then
    echo "Error: Output directory argument is required" >&2
    exit 1
fi

OUTPUT_DIR="$1"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

dialectic debate -r 3 -c examples/kata2/summary_length_test/debate-config-sum-t-1250.json -o "$OUTPUT_DIR/all_sum-length-1250.json" -p examples/kata2/problem.md -v
dialectic debate -r 3 -c examples/kata2/summary_length_test/debate-config-sum-t-2500.json -o "$OUTPUT_DIR/all_sum-length-2500.json" -p examples/kata2/problem.md -v
dialectic debate -r 3 -c examples/kata2/summary_length_test/debate-config-sum-t-5000.json -o "$OUTPUT_DIR/all_sum-length-5000.json" -p examples/kata2/problem.md -v
dialectic debate -r 3 -c examples/kata2/summary_length_test/debate-config-sum-t-10000.json -o "$OUTPUT_DIR/all_sum-length-10000.json" -p examples/kata2/problem.md -v
dialectic debate -r 3 -c examples/kata2/summary_length_test/debate-config-sum-t-15000.json -o "$OUTPUT_DIR/all_sum-length-15000.json" -p examples/kata2/problem.md -v
