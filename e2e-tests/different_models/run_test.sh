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
CONFIG_GEMINI="$TEST_DIR/debate-gemini-2.5-flashlite.json"
CONFIG_GPT="$TEST_DIR/debate-gpt-51-codex-mini.json"
CONFIG_KIMI="$TEST_DIR/debate-kimi-dev-72b.json"

# Run debates with different models
dialectic debate -r 2 -c "$CONFIG_GEMINI" -o "$OUTPUT_DIR/gemini-2.5-flashlite.json" -p "$PROBLEM_DIR/problem.md" -v
dialectic debate -r 2 -c "$CONFIG_GPT" -o "$OUTPUT_DIR/gpt-51-codex-mini.json" -p "$PROBLEM_DIR/problem.md" -v
dialectic debate -r 2 -c "$CONFIG_KIMI" -o "$OUTPUT_DIR/kimi-dev-72b.json" -p "$PROBLEM_DIR/problem.md" -v

