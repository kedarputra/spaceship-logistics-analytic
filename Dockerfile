# The app as one image (ticket 36, B4): built in one stage, run from a second that holds only what the
# server needs. Configuration comes only from the environment at run time (README, "Run with Docker"):
# no secret, key or users file is ever copied in. The server deploy (ADR 0010) does not use this file,
# and next.config keeps its default output, so it builds and runs exactly as before.

# One exact release of Node 22, the LTS line CI builds with, for both stages.
ARG NODE_IMAGE=node:22.23.5-bookworm-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# next/font downloads Figtree from Google Fonts during the build, so building needs the network; the
# image serves it from .next. The build cache is not needed to run.
RUN npm run build && rm -rf .next/cache

FROM ${NODE_IMAGE} AS runtime
# The same folder as the build stage, so any path the build recorded is still right.
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# What the server reads from disk: its config (serverExternalPackages, the proxy's body limit), the build,
# the dataset (ADR 0005), and the fonts the report PDF embeds. The repo has no public/ folder. All of it
# stays root's, so the server cannot change it; as on the server (ADR 0010), it may write only .next/cache.
COPY next.config.ts ./
COPY data ./data
COPY assets/fonts ./assets/fonts
COPY --from=build /app/.next ./.next
RUN mkdir -p .next/cache && chown node:node .next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# What `npm start` runs, called with node directly as the server's service does, so `docker stop`'s
# SIGTERM reaches Next itself. 0.0.0.0, so the published port reaches it.
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
