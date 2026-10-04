FROM node:26-slim

# Install tini for proper signal handling
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*

# Node 26 ships no corepack
RUN npm install -g pnpm@12.8.1

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
COPY server/src ./server/src

# --ignore-scripts: root prepare script is husky
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter @cardtable2/server...

ENV NODE_ENV=production

# Railway overrides with PORT env var
EXPOSE 3001

WORKDIR /app/server

USER node

ENTRYPOINT ["tini", "--"]

# Node runs the TypeScript sources directly (no build step)
CMD ["node", "src/index.ts"]
