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

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(function(r){process.exit(r.ok?0:1)}).catch(function(){process.exit(1)})"

CMD ["node", "server/dist/index.js"]
