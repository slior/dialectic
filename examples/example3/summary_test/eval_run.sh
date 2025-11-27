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

# Run evaluations for all debate outputs
# dialectic eval -c ./$BASE_DIR/summary_test/debate-config_no_context_search.json -d "$OUTPUT_DIR/all_agents_only_summary.json" -v -o "$OUTPUT_DIR/eval_all_agents_only_summary.eval.json"
dialectic eval -c ./$BASE_DIR/summary_test/debate-config_context_search_no_history.json -d "$OUTPUT_DIR/all_agents_context_search_no_history.json" -v -o "$OUTPUT_DIR/eval_all_agents_context_search_no_history.eval.json"
dialectic eval -c ./$BASE_DIR/summary_test/debate-config_no_summary.json -d "$OUTPUT_DIR/all_agents_without_summary_without_tools.json" -v -o "$OUTPUT_DIR/eval_all_agents_without_summary_without_tools.eval.json"


