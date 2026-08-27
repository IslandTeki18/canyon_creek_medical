#!/bin/sh
# With CONVEX_DEPLOY_KEY: push Convex functions, then build (Convex injects
# VITE_CONVEX_URL). Without it: build against whatever VITE_CONVEX_URL is set
# in Vercel, e.g. the dev deployment.
set -e
if [ -n "$CONVEX_DEPLOY_KEY" ]; then
  npx convex deploy --cmd 'pnpm build'
else
  [ -n "$VITE_CONVEX_URL" ] || { echo "Set CONVEX_DEPLOY_KEY or VITE_CONVEX_URL"; exit 1; }
  pnpm build
fi
