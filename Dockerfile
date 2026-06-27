# Self-hosted Pumice: build the static app, then serve it + the vault /api.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/bin ./bin
COPY --from=build /app/package.json ./
ENV PORT=3000 VAULT_DIR=/vault
VOLUME /vault
EXPOSE 3000
CMD ["node", "bin/pumice-server.mjs"]
