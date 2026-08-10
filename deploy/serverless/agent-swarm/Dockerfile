# Minimal container for Cloud Run MCP swarm edge (proxies or echoes)
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev 2>/dev/null || true
COPY server.js ./
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
