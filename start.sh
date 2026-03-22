#!/bin/sh
# Push database schema to Turso/SQLite on startup
npx drizzle-kit push --force 2>&1 || echo "DB push skipped"
# Start the server
node dist/index.cjs
