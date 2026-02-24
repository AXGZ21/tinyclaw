FROM node:18-alpine

WORKDIR /app

# Install dependencies for native modules and tools
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    bash \
    jq \
    curl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production=false

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create data directory
RUN mkdir -p /.tinyclaw

# Set environment
ENV NODE_ENV=production

# Expose ports for TinyOffice
EXPOSE 3000 3777

# Run the startup script
CMD ["./scripts/railway-start.sh"]
