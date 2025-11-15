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

# Run debates with different models
dialectic debate -r 2 -c "$BASE_DIR/different_models/debate-gemini-2.5-flashlite.json" -o "$OUTPUT_DIR/gemini-2.5-flashlite.json" -p "$BASE_DIR/problem.md" -v
dialectic debate -r 2 -c "$BASE_DIR/different_models/debate-gpt-51-codex-mini.json" -o "$OUTPUT_DIR/gpt-51-codex-mini.json" -p "$BASE_DIR/problem.md" -v
dialectic debate -r 2 -c "$BASE_DIR/different_models/debate-kimi-dev-72b.json" -o "$OUTPUT_DIR/kimi-dev-72b.json" -p "$BASE_DIR/problem.md" -v

