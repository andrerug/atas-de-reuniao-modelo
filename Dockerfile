# Atas de Reunião: imagem de produção
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --legacy-peer-deps
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DIST_DIR=/app/dist \
    DADOS_DIR=/dados \
    ARQUIVOS_DIR=/dados/arquivos \
    PARTES_DIR=/dados/partes
# ffmpeg corta a gravação em partes e junta a versão comprimida
RUN apk add --no-cache ffmpeg
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
RUN mkdir -p /dados/arquivos && chown -R node:node /dados
USER node
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/sessao >/dev/null || exit 1
CMD ["node", "dist-server/server.mjs"]
