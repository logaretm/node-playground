#!/bin/bash

# Script to run all reproductions in sequence
# This helps verify the issue across different contexts

set -e

echo "=================================================="
echo "Running All Tracing Channel Reproductions"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. Bare Node.js reproduction
echo -e "${BLUE}=================================================="
echo "1. BARE NODE.JS REPRODUCTION (No Dependencies)"
echo -e "==================================================${NC}"
echo ""
echo "Testing with only Node.js built-ins..."
echo ""

cd bare
node index.js 2>&1 | tee ../bare-output.log
cd ..

echo ""
echo -e "${GREEN}✓ Bare reproduction complete. Output saved to bare-output.log${NC}"
echo ""
read -p "Press Enter to continue to OpenTelemetry reproduction..."
echo ""

# 2. OpenTelemetry reproduction
echo -e "${BLUE}=================================================="
echo "2. OPENTELEMETRY REPRODUCTION"
echo -e "==================================================${NC}"
echo ""
echo "Installing dependencies..."

cd otel
npm install --silent
echo ""
echo "Testing with OpenTelemetry SDK..."
echo ""

node index.js 2>&1 | tee ../otel-output.log
cd ..

echo ""
echo -e "${GREEN}✓ OpenTelemetry reproduction complete. Output saved to otel-output.log${NC}"
echo ""

# Summary
echo ""
echo -e "${YELLOW}=================================================="
echo "SUMMARY"
echo -e "==================================================${NC}"
echo ""
echo "Output files created:"
echo "  - bare-output.log   (Pure Node.js test)"
echo "  - otel-output.log   (OpenTelemetry test)"
echo ""
echo "Next steps:"
echo ""
echo "1. Review the output logs above"
echo "2. Look for 'CONTEXT LOST' or missing parent IDs"
echo "3. Check if inner spans have correct parent relationships"
echo ""
echo -e "${YELLOW}Key things to verify:${NC}"
echo "  ❌ Are inner spans missing parent IDs?"
echo "  ❌ Does 'Active span in tracePromise callback' show NONE?"
echo "  ❌ Do span hierarchies show orphaned children?"
echo ""
echo "If YES to any of the above, the bug is confirmed."
echo ""
echo -e "${BLUE}See REPRODUCTION_GUIDE.md for detailed analysis instructions.${NC}"
echo ""

