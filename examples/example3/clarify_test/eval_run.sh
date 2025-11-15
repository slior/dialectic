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
dialectic eval -c ./$BASE_DIR/eval_config.json -d "$OUTPUT_DIR/debate-with-clarify.json" -v -o "$OUTPUT_DIR/eval_with-clarify.eval.json"
dialectic eval -c ./$BASE_DIR/eval_config.json -d "$OUTPUT_DIR/debate-without-clarify.json" -v -o "$OUTPUT_DIR/eval_without-clarify.eval.json"


