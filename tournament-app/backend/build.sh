#!/bin/bash
set -e

echo "--- 🛠️ Starting Deterministic Build ---"

# 1. Ensure we are in the backend directory
# (Render sets the root directory, but we'll be explicit)
echo "Installing dependencies..."
npm install --production=false

# 2. Explicitly install the Prisma Client to ensure the binary is present
echo "Ensuring @prisma/client is installed..."
npm install @prisma/client

# 3. Generate the Prisma Client
echo "Generating Prisma Client..."
# We use npx but we also ensure the path is clear
npx prisma generate

# 4. Run the TypeScript compiler
echo "Compiling TypeScript..."
npm run build

echo "--- ✅ Build Completed Successfully ---"
