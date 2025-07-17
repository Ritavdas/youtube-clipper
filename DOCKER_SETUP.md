# Docker Setup Guide

This guide will help you run the YouTube Clipper application using Docker.

## Prerequisites

1. **Docker & Docker Compose** installed on your system
2. **Environment files** configured (see below)

## Environment Setup

### Backend Environment (.env)

Create `backend/.env` with:

```env
PORT=3001
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
SUPABASE_BUCKET=your_bucket_name
PUBLIC_BACKEND_URL=http://localhost:3001
```

### Frontend Environment (.env.local)

Create `frontend/.env.local` with:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
BETTER_AUTH_SECRET=your_auth_secret_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
DATABASE_URL=postgresql://postgres:postgres@db:5432/youtube_clipper
```

## Running the Application

### Method 1: Using Docker Compose (Recommended)

```bash
# Build and start all services
docker-compose up --build

# Run in detached mode
docker-compose up --build -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Method 2: Individual Container Build

```bash
# Build backend
cd backend
docker build -t youtube-clipper-backend .

# Build frontend
cd ../frontend
docker build -t youtube-clipper-frontend .

# Run with custom network (optional)
docker network create youtube-clipper-network
docker run -d --name backend --network youtube-clipper-network -p 3001:3001 youtube-clipper-backend
docker run -d --name frontend --network youtube-clipper-network -p 3000:3000 youtube-clipper-frontend
```

## Accessing the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Database**: localhost:5432 (if using docker-compose)

## Troubleshooting

### Common Issues:

1. **Port conflicts**: Change ports in docker-compose.yml if 3000/3001 are in use
2. **Environment variables**: Ensure all required env vars are set
3. **Database connection**: Check DATABASE_URL points to `db:5432` in container
4. **Build failures**: Clear Docker cache with `docker system prune`

### Useful Commands:

```bash
# Check container status
docker-compose ps

# View container logs
docker-compose logs [service_name]

# Restart specific service
docker-compose restart [service_name]

# Clean up
docker-compose down -v  # Remove volumes
docker system prune -a  # Clean all unused images
```

## Development Mode

For development with file watching:

```bash
# Backend development
cd backend
docker build -t youtube-clipper-backend-dev .
docker run -v $(pwd):/app -p 3001:3001 youtube-clipper-backend-dev bun run dev

# Frontend development
cd frontend
docker build -t youtube-clipper-frontend-dev .
docker run -v $(pwd):/app -p 3000:3000 youtube-clipper-frontend-dev npm run dev
```

## Production Deployment

For production, consider:

1. Use proper secrets management
2. Set up reverse proxy (nginx)
3. Configure SSL certificates
4. Use external database instead of containerized PostgreSQL
5. Set up proper logging and monitoring