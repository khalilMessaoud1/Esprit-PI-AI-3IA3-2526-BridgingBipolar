# BridgingBipolar

A clinically-informed mental health tracking platform for bipolar disorder patients.

## Stack

- Frontend: Next.js, Tailwind CSS, Framer Motion
- Backend: NestJS, PostgreSQL (Prisma)
- Storage: AWS S3 (presigned uploads)

## Architecture

- apps/web: Next.js UI, assessment flows, dashboard, settings, chatbot widget
- apps/api: NestJS REST API with JWT auth, Prisma ORM, modular domains
- PostgreSQL: users, assessments, mood entries, medications, activity logs

## Getting Started

1. Install dependencies:
   - `npm install`
2. Configure environment variables:
   - Copy `apps/api/.env.example` to `apps/api/.env`
   - Copy `apps/web/.env.example` to `apps/web/.env`
3. Start the dev stack:
   - `npm run dev`

## Workspace Scripts

- `npm run dev` - start API and web
- `npm run build` - build API and web
- `npm run lint` - lint API and web

## Notes

- Replace placeholder keys in the env files before production.
- The chatbot uses a safe, non-diagnostic response template by default.
