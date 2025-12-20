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

# Use problem's default config for first run
DEFAULT_CONFIG="$PROBLEM_DIR/debate-config.json"

# Use test-specific configs from TEST_DIR (required for this test)
CONFIG_ARCH_ARCH="$TEST_DIR/debate-arch-arch.json"
CONFIG_ARCH_KISS="$TEST_DIR/debate-arch-kiss.json"
CONFIG_ARCH_PERF_KISS="$TEST_DIR/debate-arch-perf-kiss.json"
CONFIG_ARCH_ARCH_KISS="$TEST_DIR/debate-arch-arch-kiss.json"

# Run debates with different role subsets
dialectic debate -r 2 -c "$DEFAULT_CONFIG" -o "$OUTPUT_DIR/arch-perf-sec-kiss.json" -p "$PROBLEM_DIR/problem.md" -v
dialectic debate -r 2 -c "$CONFIG_ARCH_ARCH" -o "$OUTPUT_DIR/arch-arch.json" -p "$PROBLEM_DIR/problem.md" -v
dialectic debate -r 2 -c "$CONFIG_ARCH_KISS" -o "$OUTPUT_DIR/arch-kiss.json" -p "$PROBLEM_DIR/problem.md" -v
dialectic debate -r 2 -c "$CONFIG_ARCH_PERF_KISS" -o "$OUTPUT_DIR/arch-perf-kiss.json" -p "$PROBLEM_DIR/problem.md" -v
dialectic debate -r 2 -c "$CONFIG_ARCH_ARCH_KISS" -o "$OUTPUT_DIR/arch-arch-kiss.json" -p "$PROBLEM_DIR/problem.md" -v

