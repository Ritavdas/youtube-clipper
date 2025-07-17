FROM oven/bun:1.2.7

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install --no-cache-dir yt-dlp

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Build the application
RUN bun run build

# Expose port
EXPOSE 3001

# Start the application
CMD ["bun", "run", "src/index.ts"]