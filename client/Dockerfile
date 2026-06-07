FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY client/package.json client/package.json
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm --workspace client run build

FROM node:22-alpine AS runner
WORKDIR /app/client
ENV NODE_ENV=production
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/client/.next ./.next
COPY --from=builder /app/client/public ./public
COPY --from=builder /app/client/package.json ./package.json
EXPOSE 3000
CMD ["node", "../../node_modules/next/dist/bin/next", "start"]
