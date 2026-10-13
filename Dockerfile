# syntax=docker/dockerfile:1
# 需要 Docker 17.05+（支持 FROM ... AS 多阶段）。旧版请用:
#   docker build -f Dockerfile.legacy -t babata:test .
#
# 若在目标机上 node 一启动就 Aborted (uv_thread_create)，完整构建无法在该机完成：
#   1) 先试: docker build --ulimit nproc=65535:65535 --security-opt seccomp=unconfined -t babata:test .
#   2) 或在 Windows/CI 上 pnpm build + scripts/docker-package-runtime.sh + docker/Dockerfile.runtime
#   3) docker save 后拷到服务器 docker load
#
# 镜像源：默认官方 npm（Next 16 等新包在 npmmirror 上可能 404）
#   docker build -t babata:test .
# 仅当确认源已同步时再改用 npmmirror：
#   docker build --build-arg NPM_REGISTRY=https://registry.npmmirror.com -t babata:test .

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# 不用 corepack / apt（内网 apt Post-Invoke 常失败；node 镜像自带 npm）
ARG PNPM_VERSION=9.15.4
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm install -g "pnpm@${PNPM_VERSION}" --registry="${NPM_REGISTRY}" \
  && pnpm --version

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN pnpm config set registry "${NPM_REGISTRY}" \
  && pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 空目录不会进入 stage 产物；占位文件保证后续 COPY 成功
RUN mkdir -p public && touch public/.keep
# builder 镜像还用于一次性命令（docker compose run cli pnpm user:create ...），
# 预先建好 /app/data 并交给 1001，使挂载的数据卷首次初始化后可被 nextjs(1001) 读写
RUN mkdir -p /app/data && chown 1001:1001 /app/data
RUN pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# 使用绝对路径，避免 standalone 进程 cwd 与 WORKDIR 不一致
ENV BABATA_STORAGE_URL=file:/app/data/storage.db

# 宿主机持久化（勿 COPY 真实 .env 进镜像）:
#   mkdir -p ./data ./config
#   docker run -v ./data:/app/data -v ./config:/app/config ...
# 说明: 挂载 ./config 会盖住镜像内 /app/config；模板在 /app/config.defaults。
# 首次启动且 config 可写时，entrypoint 会复制 .env.example、.env 到宿主机 ./config/
# 若使用 :ro，请先在宿主机: cp .env.example config/.env

# node:22-bookworm-slim 已含 ca-certificates，避免 apt-get（Post-Invoke 清理脚本易报错）
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs \
  && mkdir -p /app/data /app/logs /app/config /app/config.defaults \
  && chown -R nextjs:nodejs /app

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Agent Skills 目录：运行时按 AGENT_SKILLS_ROOT（默认 <cwd>/workspace）读取，standalone 产物不会带上它
COPY --from=builder --chown=nextjs:nodejs /app/workspace ./workspace
COPY .env.example /app/config.defaults/.env.example
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
VOLUME ["/app/data", "/app/config"]
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
