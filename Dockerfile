# syntax=docker/dockerfile:1

ARG NODE_VERSION=26
ARG PNPM_VERSION=12.14.0

FROM node:${NODE_VERSION}-bookworm-slim AS build

ARG PNPM_VERSION
RUN npm install --global pnpm@${PNPM_VERSION}
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
# SvelteKit's route analysis evaluates server modules. Supply synthetic values for this
# command only; real configuration is validated again when the runtime starts.
RUN ANALYTICS_FINGERPRINT_KEY=build-only-analytics-key-not-a-secret \
	APPROVED_GITHUB_PROVIDER_ID=0 \
	BETTER_AUTH_SECRET=build-only-authentication-key-not-a-secret \
	BETTER_AUTH_URL=http://localhost:3000 \
	DATABASE_CONNECTION_STRING=postgresql://build:build@127.0.0.1:5432/build \
	DATABASE_LISTEN_CONNECTION_STRING=postgresql://build:build@127.0.0.1:5432/build \
	DATABASE_SSL=false \
	GITHUB_CLIENT_ID=build-only \
	GITHUB_CLIENT_SECRET=build-only \
	OPENCODE_API_KEY=build-only \
	TYPESAFE_API_KEY=build-only \
	pnpm build

# The server bundle only imports the runtime dependencies, so keep the image free of tooling.
FROM node:${NODE_VERSION}-bookworm-slim AS prod-deps

ARG PNPM_VERSION
RUN npm install --global pnpm@${PNPM_VERSION}
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM node:${NODE_VERSION}-bookworm-slim AS runtime

# psql is required by scripts/migrate.mjs.
RUN apt-get update \
	&& apt-get install --yes --no-install-recommends postgresql-client \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=3000

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/migrations ./migrations

USER node
EXPOSE 3000

# Use Node's HTTP client: the slim image has neither curl nor wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "build"]
