FROM node:20-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
RUN npm install --production

FROM base
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["node", "--import", "tsx", "bot.ts"]
