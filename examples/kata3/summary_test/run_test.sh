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
BASE_DIR="examples/kata3"

dialectic debate -r 3 -c "$BASE_DIR/summary_test/debate-config_no_summary.json" -o "$OUTPUT_DIR/all_agents_without_summary_without_tools.json" -p "$BASE_DIR/problem.md" -v
dialectic debate -r 3 -c "$BASE_DIR/summary_test/debate-config_context_search_no_history.json" -o "$OUTPUT_DIR/all_agents_context_search_no_history.json" -p "$BASE_DIR/problem.md" -v
# dialectic debate -r 3 -c "$BASE_DIR/summary_test/debate-config_no_context_search.json" -o "$OUTPUT_DIR/all_agents_only_summary.json" -p "$BASE_DIR/problem.md" -v


