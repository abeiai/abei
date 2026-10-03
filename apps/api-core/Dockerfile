FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN sed -i \
  -e "s|http://deb.debian.org/debian-security|https://mirrors.aliyun.com/debian-security|g" \
  -e "s|http://deb.debian.org/debian|https://mirrors.aliyun.com/debian|g" \
  /etc/apt/sources.list.d/debian.sources
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg openssl \
  && rm -rf /var/lib/apt/lists/*
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*
RUN npm config set registry https://registry.npmmirror.com \
  && npm install -g pnpm@10.33.0 \
  && pnpm config set registry https://registry.npmmirror.com

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api-core/package.json apps/api-core/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile --filter @xueleai/api-core... --filter @xueleai/database...

FROM deps AS builder
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:3604/placeholder?schema=public
COPY . .
RUN pnpm --filter @xueleai/database db:generate
RUN pnpm --filter @xueleai/database build
RUN pnpm --filter @xueleai/api-core build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api-core/package.json apps/api-core/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile --prod --filter @xueleai/api-core... --filter @xueleai/database...

FROM base AS runner
ARG APP_VERSION=0.0.0
ARG APP_RELEASE_SHA=unknown
LABEL org.opencontainers.image.version="${APP_VERSION}"
LABEL org.opencontainers.image.revision="${APP_RELEASE_SHA}"

ENV NODE_ENV=production
ENV API_CORE_PORT=3602
ENV LOG_DIR=/app/logs
ENV APP_VERSION="${APP_VERSION}"
ENV APP_RELEASE_SHA="${APP_RELEASE_SHA}"

RUN mkdir -p /app/logs /app/uploads \
  && chown -R node:node /app/logs /app/uploads

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/apps/api-core/node_modules ./apps/api-core/node_modules
COPY --from=prod-deps --chown=node:node /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder --chown=node:node /app/apps/api-core/dist ./apps/api-core/dist
COPY --from=builder --chown=node:node /app/apps/api-core/package.json ./apps/api-core/package.json
COPY --from=builder --chown=node:node /app/apps/web/public/picture-book-styles ./apps/web/public/picture-book-styles
COPY --from=builder --chown=node:node /app/apps/web/public/picture-book-characters ./apps/web/public/picture-book-characters
COPY --from=builder --chown=node:node /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=node:node /app/packages/database/generated ./packages/database/generated
COPY --from=builder --chown=node:node /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder --chown=node:node /app/packages/database/src ./packages/database/src
COPY --from=builder --chown=node:node /app/packages/database/package.json ./packages/database/package.json
COPY --from=builder --chown=node:node /app/packages/database/prisma.config.ts ./packages/database/prisma.config.ts
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

USER node
EXPOSE 3602

CMD ["node", "apps/api-core/dist/main.js"]
