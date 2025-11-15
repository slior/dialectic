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

# Run debates with and without clarify
dialectic debate -r 2 -c "$BASE_DIR/debate-config.json" -o "$OUTPUT_DIR/debate-with-clarify.json" -p "$BASE_DIR/problem.md" -v --clarify
dialectic debate -r 2 -c "$BASE_DIR/debate-config.json" -o "$OUTPUT_DIR/debate-without-clarify.json" -p "$BASE_DIR/problem.md" -v

