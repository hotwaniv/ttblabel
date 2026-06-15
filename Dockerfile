FROM node:20-alpine AS base
RUN npm install -g bun
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bunx next build

EXPOSE 3000

CMD ["sh", "-c", "bun run db:migrate && bun run start"]
