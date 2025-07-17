# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YouTube Clipper is a SaaS tool for extracting specific clips from YouTube videos using URLs with start/end timestamps. The application consists of a Next.js frontend and Express.js backend using Bun runtime.

## Architecture

### Frontend (Next.js)

- **Framework**: Next.js 15 with App Router
- **Styling**: TailwindCSS with Shadcn/UI components
- **Authentication**: better-auth with Google OAuth and email/password
- **Database**: Drizzle ORM with Postgres (Neon)
- **Payments**: DodoPayments integration
- **State Management**: Built-in Next.js patterns

### Backend (Express.js)

- **Runtime**: Bun with Express.js server
- **Video Processing**: yt-dlp for downloading, ffmpeg for processing
- **Storage**: Supabase Storage for video files
- **Database**: Supabase for job tracking
- **File Management**: Local uploads directory with cleanup

## Development Commands

### Backend

```bash
cd backend
bun install           # Install dependencies
bun run dev          # Start development server on port 3001
bun run build        # Build for production
```

### Frontend

```bash
cd frontend
bun install           # Install dependencies
bun run dev          # Start development server on port 3000
bun run build        # Build for production
bun run start        # Start production server
bun run lint         # Run ESLint
```

## Key File Locations

- **Backend entry**: `backend/src/index.ts`
- **Frontend auth**: `frontend/lib/auth.ts`
- **Database config**: `frontend/lib/db.ts`
- **Database schema**: `frontend/lib/schema.ts`
- **Main editor**: `frontend/app/(auth)/editor/editor.tsx`

## Required System Dependencies

The application requires these system tools to be installed:

- `yt-dlp` - YouTube video downloading
- `ffmpeg` - Video processing and encoding
- `bun` - JavaScript runtime (v1.2.7+)
- `node` - JavaScript runtime (v18+)

## Environment Variables

### Frontend (.env.local)

- `NEXT_PUBLIC_APP_URL` - Application URL
- `BETTER_AUTH_SECRET` - Auth secret key
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `DATABASE_URL` - Postgres connection string

### Backend (.env)

- `PORT` - Server port (default: 3001)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service key
- `SUPABASE_BUCKET` - Storage bucket name
- `PUBLIC_BACKEND_URL` - Backend URL for large file downloads

## Video Processing Flow

1. Frontend submits video URL with timestamps
2. Backend creates job in database with "processing" status
3. yt-dlp downloads video segment using `--download-sections`
4. ffmpeg processes video (subtitle burning if requested)
5. File uploaded to Supabase Storage (if under 50MB) or served locally
6. Job status updated to "ready" with download URL

## Database Schema

The application uses Drizzle ORM with the following key tables:

- Users (better-auth managed)
- Jobs (video processing tracking)
- Sessions (better-auth managed)

## API Endpoints

### Backend (port 3001)

- `POST /api/clip` - Create new video clip job
- `GET /api/clip/:id` - Check job status
- `GET /api/clip/:id/file` - Download large files directly
- `DELETE /api/clip/:id/cleanup` - Clean up job files
- `GET /api/formats` - Get available video formats
- `GET /api/ping` - Health check

### Frontend API Routes

- `/api/auth/[...all]` - Authentication endpoints
- `/api/metadata` - Video metadata fetching
- `/api/subscriptions` - Payment handling
