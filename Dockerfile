FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node server ./server

ENV MARKETPLACE_FILES_DIR=/data/marketplace-files
RUN mkdir -p /data/marketplace-files && chown -R node:node /data
VOLUME ["/data/marketplace-files"]

ENV API_HOST=0.0.0.0
ENV API_PORT=8788
EXPOSE 8788
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8788/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "server/index.mjs"]
