# Emergent Invoicing MVP

Monthly invoicing system for time tracking & invoice management with AI-powered features.

## Quick Start

**Live URL**: https://invoice-flow-35.preview.emergentagent.com

**Default Credentials**:
- Admin: `admin@local` / `Admin2025!`
- User: `user@local` / `User2025!`

## Features Implemented

✅ **Authentication**: JWT tokens, Argon2 hashing, rate limiting
✅ **XLSX Import**: Handles grouped structure (Projekt/Stranka as section headers)
✅ **Invoice Management**: Compose, edit, save invoices
✅ **AI Suggestions**: Grammar, fraud detection, GDPR masking (OpenAI GPT-4o)
✅ **eRačuni Stub**: Returns ER-STUB-{timestamp} for testing
✅ **Audit Trail**: Logs critical actions

## XLSX Format

Expected headers: `# | Projekt | Stranka | Datum | Tarifa | Delavec | Opombe | Porabljene ure | Vrednost | Št.računa`

- Projekt/Stranka are section headers (not per-row)
- Supports comma/dot decimal separators
- Handles missing values gracefully

## Tech Stack

- Backend: FastAPI + MongoDB + Pydantic v2
- Frontend: React + Tailwind + shadcn/ui
- AI: OpenAI GPT-4o (Emergent LLM key)

## Usage

1. Login with admin@local / Admin2025!
2. Import XLSX file
3. View/Edit invoices
4. Enable AI Suggestions toggle
5. Post to eRačuni (Admin only)

## API Endpoints

- `POST /api/auth/login`
- `POST /api/imports` (multipart)
- `POST /api/invoices/compose?batchId=...`
- `GET /api/invoices/:id`
- `PUT /api/invoices/:id`
- `POST /api/invoices/:id/post` (Admin)
- `POST /api/ai/suggest`

---
**Built with Emergent**
