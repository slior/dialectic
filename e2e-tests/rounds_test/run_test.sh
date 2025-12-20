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

# Use test-specific config if TEST_DIR provided and config exists, otherwise use problem config
if [ -n "$TEST_DIR" ] && [ -f "$TEST_DIR/debate-config.json" ]; then
  CONFIG="$TEST_DIR/debate-config.json"
else
  CONFIG="$PROBLEM_DIR/debate-config.json"
fi

# Run debates with rounds 1-5
dialectic debate -r 1 -c "$CONFIG" -o "$OUTPUT_DIR/all_agents_1R_no_clarify.json" -p "$PROBLEM_DIR/problem.md" -v
dialectic debate -r 2 -c "$CONFIG" -o "$OUTPUT_DIR/all_agents_2R_no_clarify.json" -p "$PROBLEM_DIR/problem.md" -v
dialectic debate -r 3 -c "$CONFIG" -o "$OUTPUT_DIR/all_agents_3R_no_clarify.json" -p "$PROBLEM_DIR/problem.md" -v
dialectic debate -r 4 -c "$CONFIG" -o "$OUTPUT_DIR/all_agents_4R_no_clarify.json" -p "$PROBLEM_DIR/problem.md" -v
dialectic debate -r 5 -c "$CONFIG" -o "$OUTPUT_DIR/all_agents_5R_no_clarify.json" -p "$PROBLEM_DIR/problem.md" -v

