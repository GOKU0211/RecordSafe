# RecordSafe backend

Starter API for the RecordSafe college prototype. It includes citizen registration/login, JWT authentication, complaint submission and tracking, and a limited police review workflow.

## Requirements
- Node.js 18+
- MongoDB Community Server running locally, or a MongoDB Atlas connection string

## Setup (Windows PowerShell, from this folder)
```powershell
npm install
Copy-Item .env.example .env
```
Edit `.env`, set a long random `JWT_SECRET`, and verify `MONGODB_URI`.

Start the API:
```powershell
npm run dev
```
Open `http://localhost:5000/api/health`. Expected response:
```json
{"ok":true,"service":"RecordSafe API"}
```

## API endpoints
- `POST /api/auth/register` — public registration; creates citizen accounts only
- `POST /api/auth/login` — login
- `GET /api/auth/me` — current authenticated user
- `POST /api/complaints` — citizen submits a complaint (requires Bearer token)
- `GET /api/complaints/mine` — citizen's own complaints
- `GET /api/complaints/:id` — complaint detail, scoped for citizens
- `GET /api/complaints/inbox` — police/admin inbox
- `PATCH /api/complaints/:id/review-status` — police review statuses only

## Important prototype boundaries
- Submitting a complaint does **not** register an FIR.
- Police/admin accounts must be provisioned by a trusted setup process; public registration cannot create them.
- Blockchain fields are prepared for later integration, but no on-chain transaction is claimed by this starter.
- Evidence upload, formal FIR registration, investigator assignment, audit logging, station management, and admin controls still need to be implemented and tested.
- This is a college prototype, not a production system for real police or sensitive legal records.
