FROM node:20-slim

WORKDIR /app

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code 2>/dev/null || true

COPY package.json package-lock.json ./
RUN npm ci --production 2>/dev/null || npm install --production

COPY tsconfig.json ./
COPY src/ ./src/

EXPOSE 9091

CMD ["node", "--import", "tsx", "src/index.ts"]
