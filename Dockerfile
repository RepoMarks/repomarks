# ---------- 构建阶段 ----------
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

COPY server server
COPY web web
RUN npm run build

# ---------- 运行阶段 ----------
FROM node:24-alpine
RUN apk add --no-cache git git-lfs chromium nss freetype harfbuzz ca-certificates ttf-freefont

ENV NODE_ENV=production \
    DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=3000 \
    ARCHIVE_BROWSER_ARGS=--no-sandbox,--disable-dev-shm-usage

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev --workspace server --include-workspace-root && npm cache clean --force

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist

VOLUME /data
EXPOSE 3000

CMD ["node", "server/dist/index.js"]
