#!/bin/bash

# Check if required arguments are provided
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then
    echo "Error: Problem directory, output directory, and test directory arguments are required" >&2
    echo "Usage: $0 <problem_dir> <output_dir> <test_dir>" >&2
    exit 1
fi

PROBLEM_DIR="$1"
OUTPUT_DIR="$2"
TEST_DIR="$3"  # Required third parameter

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Use test-specific configs from TEST_DIR (required for this test)
CONFIG_NO_SUMMARY="$TEST_DIR/debate-config_no_summary.json"
CONFIG_CONTEXT_SEARCH="$TEST_DIR/debate-config_context_search_no_history.json"

dialectic debate -r 3 -c "$CONFIG_NO_SUMMARY" -o "$OUTPUT_DIR/all_agents_without_summary_without_tools.json" -p "$PROBLEM_DIR/problem.md" -v
dialectic debate -r 3 -c "$CONFIG_CONTEXT_SEARCH" -o "$OUTPUT_DIR/all_agents_context_search_no_history.json" -p "$PROBLEM_DIR/problem.md" -v
# dialectic debate -r 3 -c "$CONFIG_NO_CONTEXT_SEARCH" -o "$OUTPUT_DIR/all_agents_only_summary.json" -p "$PROBLEM_DIR/problem.md" -v

