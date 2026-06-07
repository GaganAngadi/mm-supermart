FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/package.json
COPY prisma prisma
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm --workspace server run prisma:generate
RUN npm --workspace server run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/server/package.json ./server/package.json
EXPOSE 4000
CMD ["node", "server/dist/server.js"]
