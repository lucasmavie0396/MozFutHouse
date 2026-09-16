# ---- Estágio 1: build do frontend ----
FROM node:24-slim AS build
WORKDIR /app

# Dependências de compile para o melhor-sqlite3 no Linux (prebuilds ou node-gyp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Permite scripts do npm no build para o melhor-sqlite3 (a .npmrc local desativa-os)
RUN echo "ignore-scripts=false" > /root/.npmrc

COPY package.json package-lock.json ./
RUN npm ci || npm install

COPY . .
RUN npm run build

# Remove devDependencies (vite, puppeteer, etc.) para tornar a imagem leve
RUN npm prune --omit=dev

# ---- Estágio 2: runtime ----
FROM node:24-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV MZF_DB_FILE=data/mozfuthouse.db

# Cria pasta de dados persistente
RUN mkdir -p /app/data

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/data/.gitkeep ./data/.gitkeep

# Executa como utilizador sem privilégios
RUN chown -R node:node /app && chmod -R u+rwX /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/state').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" || exit 1

CMD ["node", "server/index.mjs"]