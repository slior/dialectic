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
BASE_DIR="examples/kata2"

# Run evaluations for all debate outputs
dialectic eval -c ./$BASE_DIR/eval_config.json -d "$OUTPUT_DIR/arch-arch.json" -v -o "$OUTPUT_DIR/eval_arch-arch.eval.json"
dialectic eval -c ./$BASE_DIR/eval_config.json -d "$OUTPUT_DIR/arch-kiss.json" -v -o "$OUTPUT_DIR/eval_arch-kiss.eval.json"
dialectic eval -c ./$BASE_DIR/eval_config.json -d "$OUTPUT_DIR/arch-perf-kiss.json" -v -o "$OUTPUT_DIR/eval_arch-perf-kiss.eval.json"
dialectic eval -c ./$BASE_DIR/eval_config.json -d "$OUTPUT_DIR/arch-arch-kiss.json" -v -o "$OUTPUT_DIR/eval_arch-arch-kiss.eval.json"
dialectic eval -c ./$BASE_DIR/eval_config.json -d "$OUTPUT_DIR/arch-perf-sec-kiss.json" -v -o "$OUTPUT_DIR/eval_arch-perf-sec-kiss.eval.json"


