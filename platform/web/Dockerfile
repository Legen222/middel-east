# SCRAPLINE web app: static build served by nginx, /api proxied to the API service.
#   docker build -f web/Dockerfile -t scrapline-web platform
FROM node:22-slim AS build
WORKDIR /src
COPY web/package.json web/package-lock.json web/
COPY server/package.json server/package-lock.json server/
# the web typecheck covers the browser demo, which bundles server sources (and their types)
RUN cd web && npm ci && cd ../server && npm ci
COPY engine engine
COPY server server
COPY web web
RUN cd web && npm run typecheck && npm run build

FROM nginx:1.27-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY web/sse.inc /etc/nginx/conf.d/sse.inc
COPY --from=build /src/web/dist /usr/share/nginx/html
EXPOSE 8080
