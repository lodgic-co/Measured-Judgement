FROM node:20-alpine
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 5001

# IMPORTANT: preload OTel before app imports for auto-instrumentation
CMD ["node","--import","./dist/observability/otel-preload.js","dist/index.js"]
