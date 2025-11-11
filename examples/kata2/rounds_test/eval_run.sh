#!/bin/bash

# Check if output directory argument is provided
if [ -z "$1" ]; then
    echo "Error: Output directory argument is required" >&2
    exit 1
fi

OUTPUT_DIR="$1"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# dialectic eval -c ./examples/kata2/eval_config1.json -d "$OUTPUT_DIR/all_agents_1R_no_clarify.json" -v -o "$OUTPUT_DIR/eval_all_agents_1R_no_clarify.eval.json" -v
# dialectic eval -c ./examples/kata2/eval_config1.json -d "$OUTPUT_DIR/all_agents_2R_no_clarify.json" -v -o "$OUTPUT_DIR/eval_all_agents_2R_no_clarify.eval.json" -v
# dialectic eval -c ./examples/kata2/eval_config1.json -d "$OUTPUT_DIR/all_agents_3R_no_clarify.json" -v -o "$OUTPUT_DIR/eval_all_agents_3R_no_clarify.eval.json" -v
# dialectic eval -c ./examples/kata2/eval_config1.json -d "$OUTPUT_DIR/all_agents_4R_no_clarify.json" -v -o "$OUTPUT_DIR/eval_all_agents_4R_no_clarify.eval.json" -v
# dialectic eval -c ./examples/kata2/eval_config1.json -d "$OUTPUT_DIR/all_agents_5R_no_clarify.json" -v -o "$OUTPUT_DIR/eval_all_agents_5R_no_clarify.eval.json" -v

dialectic eval -c ./examples/kata2/eval_config2.json -d "$OUTPUT_DIR/all_agents_1R_no_clarify.json" -v -o "$OUTPUT_DIR/eval2_all_agents_1R_no_clarify.eval.json" -v
dialectic eval -c ./examples/kata2/eval_config2.json -d "$OUTPUT_DIR/all_agents_2R_no_clarify.json" -v -o "$OUTPUT_DIR/eval2_all_agents_2R_no_clarify.eval.json" -v
dialectic eval -c ./examples/kata2/eval_config2.json -d "$OUTPUT_DIR/all_agents_3R_no_clarify.json" -v -o "$OUTPUT_DIR/eval2_all_agents_3R_no_clarify.eval.json" -v
dialectic eval -c ./examples/kata2/eval_config2.json -d "$OUTPUT_DIR/all_agents_4R_no_clarify.json" -v -o "$OUTPUT_DIR/eval2_all_agents_4R_no_clarify.eval.json" -v
dialectic eval -c ./examples/kata2/eval_config2.json -d "$OUTPUT_DIR/all_agents_5R_no_clarify.json" -v -o "$OUTPUT_DIR/eval2_all_agents_5R_no_clarify.eval.json" -v