#!/bin/bash

echo "Testing PNPM change detection..."
echo "================================"

# Simulate checking changes since last commit
echo ""
echo "Checking what would deploy if app/ changed:"
echo "pnpm list --filter '@cardtable2/app...' --depth=-1"
pnpm list --filter "@cardtable2/app..." --depth=-1

echo ""
echo "Checking what would deploy if server/ changed:"
echo "pnpm list --filter '@cardtable2/server...' --depth=-1"
pnpm list --filter "@cardtable2/server..." --depth=-1

echo ""
echo "Checking what would deploy if shared/ changed:"
echo "pnpm list --filter '@cardtable2/shared...' --depth=-1"
pnpm list --filter "@cardtable2/shared..." --depth=-1

echo ""
echo "================================"
echo "Summary:"
echo "- Change in app/ → deploys: app only"
echo "- Change in server/ → deploys: server only"
echo "- Change in shared/ → deploys: app AND server (both depend on shared)"