#!/bin/bash

# Check if output directory argument is provided
if [ -z "$1" ]; then
    echo "Error: Output directory argument is required" >&2
    exit 1
fi

OUTPUT_DIR="$1"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# dialectic eval -c ./examples/kata2/eval_config1.json -d "$OUTPUT_DIR/all_sum-length-1250.json" -v -o "$OUTPUT_DIR/eval_all_sum-length-1250.eval.json" -v
# dialectic eval -c ./examples/kata2/eval_config1.json -d "$OUTPUT_DIR/all_sum-length-2500.json" -v -o "$OUTPUT_DIR/eval_all_sum-length-2500.eval.json" -v
# dialectic eval -c ./examples/kata2/eval_config1.json -d "$OUTPUT_DIR/all_sum-length-5000.json" -v -o "$OUTPUT_DIR/eval_all_sum-length-5000.eval.json" -v
# dialectic eval -c ./examples/kata2/eval_config1.json -d "$OUTPUT_DIR/all_sum-length-10000.json" -v -o "$OUTPUT_DIR/eval_all_sum-length-10000.eval.json" -v
# dialectic eval -c ./examples/kata2/eval_config1.json -d "$OUTPUT_DIR/all_sum-length-15000.json" -v -o "$OUTPUT_DIR/eval_all_sum-length-15000.eval.json" -v

dialectic eval -c ./examples/kata2/eval_config1.json -d "$OUTPUT_DIR/all_sum-length-1250.json" -v -o "$OUTPUT_DIR/eval2_all_sum-length-1250.eval.json" -v
dialectic eval -c ./examples/kata2/eval_config1.json -d "$OUTPUT_DIR/all_sum-length-2500.json" -v -o "$OUTPUT_DIR/eval2_all_sum-length-2500.eval.json" -v
dialectic eval -c ./examples/kata2/eval_config1.json -d "$OUTPUT_DIR/all_sum-length-5000.json" -v -o "$OUTPUT_DIR/eval2_all_sum-length-5000.eval.json" -v
dialectic eval -c ./examples/kata2/eval_config1.json -d "$OUTPUT_DIR/all_sum-length-10000.json" -v -o "$OUTPUT_DIR/eval2_all_sum-length-10000.eval.json" -v
dialectic eval -c ./examples/kata2/eval_config1.json -d "$OUTPUT_DIR/all_sum-length-15000.json" -v -o "$OUTPUT_DIR/eval2_all_sum-length-15000.eval.json" -v