# syntax=docker/dockerfile:1

ARG NODE_VERSION=24
ARG PNPM_VERSION=12.14.0

FROM node:${NODE_VERSION}-bookworm-slim AS build

RUN npm install --global pnpm@${PNPM_VERSION}
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# The server bundle only imports the runtime dependencies, so keep the image free of tooling.
FROM node:${NODE_VERSION}-bookworm-slim AS prod-deps

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
	PORT=3000

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/migrations ./migrations

USER node
EXPOSE 3000

CMD ["node", "build"]
