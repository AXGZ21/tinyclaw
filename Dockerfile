FROM node:20-alpine

WORKDIR /app

# Install dependencies for native modules and tools
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    bash \
    jq \
    curl

# Copy package files and install root dependencies
COPY package*.json ./
RUN npm ci

# Copy tinyoffice package files and install its dependencies
COPY tinyoffice/package*.json ./tinyoffice/
RUN cd tinyoffice && npm install

# Copy all source
COPY . .

# Build TypeScript (main app)
RUN npm run build

# Build TinyOffice Next.js app at build time (not runtime)
RUN cd tinyoffice && npm run build

# Create data directory
RUN mkdir -p /.tinyclaw

# Set environment
ENV NODE_ENV=production

# Expose ports: 3000 = TinyOffice, 3777 = API server
EXPOSE 3000 3777

# Run the startup script
CMD ["./scripts/railway-start.sh"]