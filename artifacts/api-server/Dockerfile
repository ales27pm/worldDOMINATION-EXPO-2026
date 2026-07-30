FROM node:22-bookworm-slim AS build

WORKDIR /app

ENV CI=1

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json

RUN pnpm install --frozen-lockfile

COPY artifacts/api-server artifacts/api-server
COPY artifacts/mobile/game artifacts/mobile/game
COPY lib/api-zod lib/api-zod
COPY lib/db lib/db

RUN pnpm --filter @workspace/api-server run build
RUN pnpm --filter @workspace/api-server deploy --prod --legacy /prod

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /prod ./

EXPOSE 3000

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
