#!/bin/sh
set -e
# 挂载卷 /app/data 常为 root 属主，nextjs(1001) 无法创建 storage.db（libsql 报错 14）
mkdir -p /app/data /app/config /app/logs
chown -R nextjs:nodejs /app/data
# 审计日志目录（compose 挂载的 logs 卷默认 root 属主，nextjs 无法写入会静默丢日志）
chown -R nextjs:nodejs /app/logs
# storage.db（含 babata_users）落在 /app/data（挂载卷需 chown 1001:1001）

# -v ./config:/app/config 会用宿主机空目录盖住镜像；从 defaults 种子到挂载目录（需可写）
if [ -f /app/config.defaults/.env.example ]; then
  if [ ! -f /app/config/.env.example ] && [ -w /app/config ]; then
    cp /app/config.defaults/.env.example /app/config/.env.example
    chown nextjs:nodejs /app/config/.env.example 2>/dev/null || true
  fi
  if [ ! -f /app/config/.env ] && [ -w /app/config ]; then
    cp /app/config.defaults/.env.example /app/config/.env
    chown nextjs:nodejs /app/config/.env 2>/dev/null || true
  fi
  if [ ! -f /app/config/.env ] && [ ! -w /app/config ]; then
    echo "babata: config 为只读且缺少 .env，请在宿主机执行: cp .env.example config/.env" >&2
  fi
fi

# Next 从 /app/.env 读配置
if [ -f /app/config/.env ]; then
  ln -sf /app/config/.env /app/.env
fi

exec runuser -u nextjs -g nodejs -- "$@"
