#!/bin/bash

# Check if required arguments are provided
if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Error: Problem directory and output directory arguments are required" >&2
    echo "Usage: $0 <problem_dir> <output_dir> [test_dir]" >&2
    exit 1
fi

PROBLEM_DIR="$1"
OUTPUT_DIR="$2"
TEST_DIR="${3:-}"  # Optional third parameter

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Use test-specific eval config if TEST_DIR provided and config exists, otherwise use problem config
if [ -n "$TEST_DIR" ] && [ -f "$TEST_DIR/eval_config.json" ]; then
  EVAL_CONFIG="$TEST_DIR/eval_config.json"
else
  EVAL_CONFIG="$PROBLEM_DIR/eval_config.json"
fi

# Run evaluations for all debate outputs
dialectic eval -c "$EVAL_CONFIG" -d "$OUTPUT_DIR/arch-arch.json" -v -o "$OUTPUT_DIR/eval_arch-arch.eval.json"
dialectic eval -c "$EVAL_CONFIG" -d "$OUTPUT_DIR/arch-kiss.json" -v -o "$OUTPUT_DIR/eval_arch-kiss.eval.json"
dialectic eval -c "$EVAL_CONFIG" -d "$OUTPUT_DIR/arch-perf-kiss.json" -v -o "$OUTPUT_DIR/eval_arch-perf-kiss.eval.json"
dialectic eval -c "$EVAL_CONFIG" -d "$OUTPUT_DIR/arch-arch-kiss.json" -v -o "$OUTPUT_DIR/eval_arch-arch-kiss.eval.json"
dialectic eval -c "$EVAL_CONFIG" -d "$OUTPUT_DIR/arch-perf-sec-kiss.json" -v -o "$OUTPUT_DIR/eval_arch-perf-sec-kiss.eval.json"

