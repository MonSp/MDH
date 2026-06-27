FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY tsconfig.json ./
COPY src/ ./src/
COPY templates/ ./templates/
ENV DIST_DIR=/dist
EXPOSE 9090
CMD ["node", "--import", "tsx", "src/cli.ts", "--port=9090", "--executor=http://host.docker.internal:8767", "--workspace=/workspace"]
