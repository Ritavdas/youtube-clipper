FROM oven/bun:1.2.7-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install all dependencies (including devDependencies for build)
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application with temporary env vars for DodoPayments
ENV DODO_PAYMENTS_API_KEY=dummy_key_for_build
ENV DODO_PAYMENTS_WEBHOOK_KEY=ZHVtbXlfd2ViaG9va19rZXlfZm9yX2J1aWxk
RUN bun run build

# Remove devDependencies after build
RUN bun install --frozen-lockfile --production

# Expose port
EXPOSE 3000

# Start the application
CMD ["bun", "run", "start"]