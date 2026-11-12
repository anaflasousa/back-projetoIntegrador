FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY src/data ./src/data

RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 3333
CMD ["node", "dist/server.js"]