# MindFlow: one container serving the web app, REST API, live sync and MCP endpoint.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build -w client

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    MINDFLOW_DATA_DIR=/data/maps
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev -w server --include-workspace-root=false && npm cache clean --force
COPY shared shared
COPY server server
COPY --from=build /app/client/dist client/dist
RUN mkdir -p /data/maps && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "--import", "tsx", "server/src/index.ts"]
