#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .next/standalone/server.js ]]; then
  echo "缺少 .next/standalone/server.js，请先执行: pnpm build" >&2
  exit 1
fi

CTX="$ROOT/docker/context"
rm -rf "$CTX"
mkdir -p "$CTX/.next"

cp -a .next/standalone "$CTX/standalone"
cp -a .next/static "$CTX/static"
mkdir -p "$CTX/public"
touch "$CTX/public/.keep"
if [[ -d public ]] && [[ -n "$(ls -A public 2>/dev/null)" ]]; then
  cp -a public/. "$CTX/public/"
fi
cp docker/entrypoint.sh "$CTX/entrypoint.sh"
mkdir -p "$CTX/config"
cp .env.example "$CTX/config/.env.example"

echo "已生成 docker/context，可执行:"
echo "  docker build -f docker/Dockerfile.runtime -t babata:test docker/context"
echo "  docker save babata:test -o babata.tar"
