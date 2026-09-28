# SCRAPLINE API. Build context: the platform/ directory (the server imports the engine sources).
#   docker build -f server/Dockerfile -t scrapline-api platform
FROM node:22-slim AS build
WORKDIR /src
COPY engine/package.json engine/package-lock.json* engine/
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci
COPY engine engine
COPY server server
RUN cd server && npm run check && npm test && npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production LOG=json PORT=8787
WORKDIR /app
COPY --from=build /src/server/dist/main.mjs ./main.mjs
COPY --from=build /src/server/node_modules ./node_modules
COPY --from=build /src/server/package.json ./package.json
USER node
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--no-warnings=ExperimentalWarning", "main.mjs"]
