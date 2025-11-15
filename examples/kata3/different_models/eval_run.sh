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

# Run evaluations for all debate outputs
dialectic eval -c ./$BASE_DIR/eval_config.json -d "$OUTPUT_DIR/gemini-2.5-flashlite.json" -v -o "$OUTPUT_DIR/eval_gemini-2.5-flashlite.eval.json"
dialectic eval -c ./$BASE_DIR/eval_config.json -d "$OUTPUT_DIR/gpt-51-codex-mini.json" -v -o "$OUTPUT_DIR/eval_gpt-51-codex-mini.eval.json"
dialectic eval -c ./$BASE_DIR/eval_config.json -d "$OUTPUT_DIR/kimi-dev-72b.json" -v -o "$OUTPUT_DIR/eval_kimi-dev-72b.eval.json"


