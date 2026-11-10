# Piyasa web: derlenmiş uygulama + /api (Yahoo vekili). Bağımlılıksız Node sunucusu.
#   docker build -t piyasa-web web && docker run -p 8080:8080 piyasa-web
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/dist ./dist
COPY server.mjs ./
COPY server ./server
COPY package.json ./
USER node
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://localhost:8080/api/health || exit 1
CMD ["node", "server.mjs"]
