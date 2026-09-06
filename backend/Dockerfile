# Multi-stage build — compiles TypeScript, then ships only the compiled
# output + production deps so the final image stays small.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# local-data is gitignored dev-only data; create an empty dir so the
# in-memory-store fallback + uploads middleware have somewhere to write.
RUN mkdir -p ./local-data/uploads
EXPOSE 3000
CMD ["node", "dist/main.js"]
