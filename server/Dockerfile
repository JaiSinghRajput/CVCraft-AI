FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
RUN pnpm install --frozen-lockfile

COPY server server
RUN pnpm --filter server build

FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
RUN pnpm install --frozen-lockfile --prod --filter server...

COPY --from=builder /app/server/dist server/dist
COPY --from=builder /app/server/prisma server/prisma
COPY --from=builder /app/server/.env.example server/.env.example

EXPOSE 3001
CMD ["pnpm", "--filter", "server", "start"]
