FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN npm config set registry https://registry.npmmirror.com \
  && npm install -g pnpm@10.33.0 \
  && pnpm config set registry https://registry.npmmirror.com

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile --filter @xueleai/web...

FROM deps AS builder
ARG API_BASE_URL=http://127.0.0.1:3602/api
ENV API_BASE_URL="${API_BASE_URL}"
ARG APP_VERSION=0.0.0
ARG APP_RELEASE_SHA=unknown
ENV APP_VERSION="${APP_VERSION}"
ENV APP_RELEASE_SHA="${APP_RELEASE_SHA}"
COPY . .
RUN pnpm --filter @xueleai/web build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ARG APP_VERSION=0.0.0
ARG APP_RELEASE_SHA=unknown
LABEL org.opencontainers.image.version="${APP_VERSION}"
LABEL org.opencontainers.image.revision="${APP_RELEASE_SHA}"

ENV NODE_ENV=production
ENV PORT=3601
ENV HOSTNAME=0.0.0.0
ENV APP_VERSION="${APP_VERSION}"
ENV APP_RELEASE_SHA="${APP_RELEASE_SHA}"

COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3601

CMD ["node", "apps/web/server.js"]
