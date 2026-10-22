#!/bin/bash
echo "=== Build Starting ==="
rm -rf dist
mkdir -p dist
cp -r public/* dist/
echo "=== Build Complete ==="
find dist -type f | wc -l
