#!/bin/bash

# Base paths
BASE_DIR="examples/example3"
OUTPUT_DIR="/mnt/c/tmp/dialectic/example3/rounds_test"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Run evaluations for all debate outputs
dialectic eval -c ./$BASE_DIR/eval_config2.json -d $OUTPUT_DIR/all_agents_1R_no_clarify.json -v -o $OUTPUT_DIR/eval2_all_agents_1R_no_clarify.json
dialectic eval -c ./$BASE_DIR/eval_config2.json -d $OUTPUT_DIR/all_agents_2R_no_clarify.json -v -o $OUTPUT_DIR/eval2_all_agents_2R_no_clarify.json
dialectic eval -c ./$BASE_DIR/eval_config2.json -d $OUTPUT_DIR/all_agents_3R_no_clarify.json -v -o $OUTPUT_DIR/eval2_all_agents_3R_no_clarify.json
dialectic eval -c ./$BASE_DIR/eval_config2.json -d $OUTPUT_DIR/all_agents_4R_no_clarify.json -v -o $OUTPUT_DIR/eval2_all_agents_4R_no_clarify.json
dialectic eval -c ./$BASE_DIR/eval_config2.json -d $OUTPUT_DIR/all_agents_5R_no_clarify.json -v -o $OUTPUT_DIR/eval2_all_agents_5R_no_clarify.json

