FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY api/package.json ./api/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace @careloop/api --include-workspace-root
COPY api ./api
RUN npm run build --workspace @careloop/api
RUN npm prune --omit=dev --workspace @careloop/api
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/api/package.json ./api/package.json
COPY --from=build --chown=node:node /app/api/dist ./api/dist
COPY --from=build --chown=node:node /app/api/drizzle ./api/drizzle
USER node
EXPOSE 4000
CMD ["node", "api/dist/server.js"]
