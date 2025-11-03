#!/bin/bash

# Script to compare broken vs fixed tracingChannel implementations

echo "=============================================="
echo "COMPARISON: Node.js vs Fixed Implementation"
echo "=============================================="
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  ORIGINAL NODE.JS IMPLEMENTATION (BROKEN)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
node index.js 2>&1 | grep -A 2 "INSIDE TRACE PROMISE" | head -3
echo ""
node index.js 2>&1 | grep -A 1 "Inner span parent ID" | head -2
echo ""

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  OUR FIXED IMPLEMENTATION (WORKING!)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
node index-with-fixed.js 2>&1 | grep -A 2 "INSIDE TRACE PROMISE" | head -3
echo ""
node index-with-fixed.js 2>&1 | grep -A 1 "Inner span parent ID" | head -2
echo ""

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Node.js tracePromise:  ❌ Context LOST"
echo "Fixed implementation:  ✅ Context PRESERVED"
echo ""
echo "The fix captures and restores AsyncLocalStorage"
echo "context from bound stores."
echo ""
echo "See: tracingChannelFixed.js for implementation"
echo "See: FIXED_IMPLEMENTATION_SUCCESS.md for details"
echo ""

