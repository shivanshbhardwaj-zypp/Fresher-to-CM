#!/usr/bin/env bash
#
# Bano Zypp Ke CM — deploy to the zypp.app host.
#
#   ./deploy/deploy.sh
#
# Run from the project root, on the server (or over SSH). Assumes nginx is
# already serving zypp.app and has the two blocks from deploy/nginx.conf.

# -e  stop on the first failure, so a broken build never reaches the web root
# -u  an unset variable is a bug, not an empty string
# -o pipefail  a failure mid-pipeline fails the pipeline
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/bano-zypp-ke-cm}"

echo "==> Verifying the API before anything is published"
cd "$ROOT/api"
npm ci
npm run typecheck
npm test

echo "==> Building the API image"
docker compose -f "$ROOT/deploy/docker-compose.yml" build api

echo "==> Building the frontend"
cd "$ROOT/web"
npm ci
npm run build

# The build must carry the /bano-zypp-ke-cm/ prefix or every asset 404s once
# it is behind the path. Cheap to assert, miserable to debug in production.
if ! grep -q "/bano-zypp-ke-cm/assets/" "$ROOT/web/dist/index.html"; then
  echo "ERROR: built index.html has no /bano-zypp-ke-cm/ asset prefix." >&2
  echo "       Check 'base' in web/vite.config.ts." >&2
  exit 1
fi

echo "==> Publishing static files to $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
# --delete clears out assets from previous builds, whose filenames are
# fingerprinted and would otherwise accumulate forever.
sudo rsync -a --delete "$ROOT/web/dist/" "$WEB_ROOT/"

echo "==> Restarting the API"
docker compose -f "$ROOT/deploy/docker-compose.yml" up -d api

echo "==> Waiting for readiness"
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3001/health/ready >/dev/null 2>&1; then
    echo "    ready after ${attempt}s"
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "ERROR: API did not become ready in 30s. Logs:" >&2
    docker compose -f "$ROOT/deploy/docker-compose.yml" logs --tail=50 api >&2
    exit 1
  fi
  sleep 1
done

echo "==> Reloading nginx"
# Validate before reloading: a bad config pushed straight to `reload` takes the
# whole of zypp.app down, not just this page.
sudo nginx -t
sudo nginx -s reload

echo
echo "Done. https://zypp.app/bano-zypp-ke-cm/"
