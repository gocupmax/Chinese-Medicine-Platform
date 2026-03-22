#!/bin/sh
# Initialize database tables on first run
npx drizzle-kit push --force 2>&1 || echo "DB init skipped"
# Start the server
node dist/index.cjs
