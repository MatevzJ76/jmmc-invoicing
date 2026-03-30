# Campagnolo Koper — Invoice Manager
## Deployment Guide

---

## Predpogoji

Pred deployment-om potrebuješ:
- [ ] GitHub račun
- [ ] Supabase Pro projekt (URL + anon key + service key)
- [ ] Google Cloud OAuth 2.0 credentials (Client ID + Secret)
- [ ] Railway račun
- [ ] Vercel račun
- [ ] Resend API key (opcijsko — za email notifikacije)
- [ ] e-računi kredenciale (ER_USER, ER_SECRETKEY, ER_TOKEN)

---

## Korak 1 — GitHub repozitorij

### 1a. Ustvari repozitorij
1. Pojdi na [github.com](https://github.com) → **New repository**
2. Ime: `campagnolo-invoice`
3. Visibility: **Private** ⚠️
4. Klikni **Create repository**

### 1b. Naloži kodo
```bash
# V mapi s kodo (kjer je ta README)
git init
git add .
git commit -m "Initial commit — Campagnolo Invoice Manager v1.0"
git branch -M main
git remote add origin https://github.com/TVOJ_USERNAME/campagnolo-invoice.git
git push -u origin main
```

---

## Korak 2 — Supabase SQL migracije

1. Pojdi na [supabase.com](https://supabase.com) → tvoj projekt
2. Leva navigacija → **SQL Editor**
3. Klikni **New query**
4. Odpri datoteko `sql/migrations.sql` in kopiraj vso vsebino
5. Prilepi v SQL Editor → klikni **Run**
6. Preveri: v levem meniju → **Table Editor** moraš videti tabele:
   `invoices`, `categories`, `users`, `audit_log`, `system_log`, itd.

### 2a. Dodaj uporabnike
V SQL Editorju poženi (prilagodi emaile!):
```sql
INSERT INTO users (email, name, role) VALUES
  ('admin@jmmc.si',          'JMMC Admin',  'admin'),
  ('federico@campagnolo.it', 'Federico',    'federico'),
  ('varga@campagnolo.it',    'Varga',       'varga'),
  ('revisore@jmmc.si',       'Revisore',    'auditor');
```

---

## Korak 3 — Backend na Railway

1. Pojdi na [railway.app](https://railway.app) → **New Project**
2. Klikni **Deploy from GitHub repo**
3. Poveži GitHub račun → izberi `campagnolo-invoice`
4. Railway bo zaznal Node.js projekt

### 3a. Nastavi root directory
- Settings → **Root Directory**: `/backend`
- Start command: `node server.js`

### 3b. Nastavi environment spremenljivke
V Railway projektu → **Variables** → dodaj vse vrednosti:

```
PORT=3001
NODE_ENV=production
APP_VERSION=1.0.0
FRONTEND_URL=https://TVOJ_APP.vercel.app  ← dopolni po Vercel deploymentu

JWT_SECRET=GENERIRAJ_DOLG_NAKLJUČNI_NIZ
JWT_EXPIRES_IN=8h

GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_KEY=xxx

ER_URL=https://e-racuni.com/WebServicesSI/API
ER_USER=xxx
ER_SECRETKEY=xxx
ER_TOKEN=xxx

RESEND_API_KEY=re_xxx
EMAIL_FROM=noreply@jmmc.si
EMAIL_ADMIN=admin@jmmc.si
EMAIL_FEDERICO=federico@campagnolo.it
EMAIL_VARGA=varga@campagnolo.it
EMAIL_ERRORS=errors@jmmc.si

IMPORT_ENABLED=true
IMPORT_INTERVAL_MINUTES=60
IMPORT_DATE_FROM=2026-01-01
```

> 💡 Za `JWT_SECRET` generiraj naključni niz:
> `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

4. Railway bo avtomatsko deployiral → počakaj ~2 min
5. Shrani Railway URL (npr. `https://campagnolo-invoice-production.up.railway.app`)

---

## Korak 4 — Frontend na Vercel

1. Pojdi na [vercel.com](https://vercel.com) → **Add New Project**
2. Import iz GitHub → izberi `campagnolo-invoice`
3. Framework: **Create React App**
4. Root Directory: `frontend`

### 4a. Environment spremenljivke v Vercel
```
REACT_APP_API_URL=https://TVOJ_RAILWAY_URL.up.railway.app
```

5. Klikni **Deploy** → počakaj ~3 min
6. Shrani Vercel URL (npr. `https://campagnolo-invoice.vercel.app`)

---

## Korak 5 — Posodobi FRONTEND_URL v Railway

Ko imaš Vercel URL:
1. Railway → Variables → posodobi:
   ```
   FRONTEND_URL=https://campagnolo-invoice.vercel.app
   ```
2. Railway bo avtomatsko re-deployiral

---

## Korak 6 — Google OAuth redirect URI

1. Pojdi na [console.cloud.google.com](https://console.cloud.google.com)
2. Credentials → tvoj OAuth 2.0 client
3. **Authorized redirect URIs** → dodaj:
   ```
   https://campagnolo-invoice.vercel.app/login
   ```
4. Shrani

---

## Korak 7 — Test

### 7a. Backend health check
Odpri v brskalniku:
```
https://TVOJ_RAILWAY_URL.up.railway.app/health
```
Moraš dobiti:
```json
{"status":"ok","version":"1.0.0","env":"production"}
```

### 7b. Prijava
1. Odpri Vercel URL
2. Klikni **Accedi con Google**
3. Prijavi se z admin@jmmc.si Google računom
4. Moraš priti na Dashboard

### 7c. Test import
1. Impostazioni → Test API → preveri da e-računi odgovori
2. Dashboard ali Fatture → **Importa** → preveri da se fakture uvozijo

---

## Struktura projekta

```
campagnolo-invoice/
├── backend/
│   ├── server.js              # Express entry point
│   ├── package.json
│   ├── .env.example           # Template za env spremenljivke
│   ├── routes/
│   │   ├── auth.js            # Google OAuth + JWT
│   │   ├── invoices.js        # CRUD + verify workflow
│   │   ├── distinta.js        # Payment schedule
│   │   ├── categories.js      # Categories CRUD
│   │   ├── audit.js           # Audit log
│   │   ├── syslog.js          # System log
│   │   ├── users.js           # User management
│   │   ├── settings.js        # App settings
│   │   └── dashboard.js       # KPI stats
│   ├── services/
│   │   ├── erClient.js        # e-računi API client (retry logic)
│   │   ├── importService.js   # Invoice sync
│   │   ├── pdfService.js      # Approval PDF generation
│   │   ├── emailService.js    # Resend notifications
│   │   └── scheduler.js       # Auto-import cron
│   └── utils/
│       ├── supabase.js        # Supabase client
│       └── logger.js          # sysLog + auditLog
│
├── frontend/
│   ├── package.json
│   ├── public/
│   └── src/
│       ├── App.js
│       ├── pages/
│       │   ├── Login.js
│       │   ├── Dashboard.js
│       │   ├── Invoices.js
│       │   ├── Distinta.js
│       │   ├── OtherPages.js  # Categories, AuditLog, SysLog, Users, Settings
│       │   └── ...
│       ├── components/
│       │   ├── Layout.js      # Sidebar + navigation
│       │   └── InvoiceModal.js
│       ├── hooks/
│       │   ├── useAuth.js
│       │   └── useLang.js
│       ├── i18n/
│       │   └── translations.js  # IT / SL / EN
│       └── utils/
│           └── api.js           # Axios client + all API calls
│
└── sql/
    └── migrations.sql         # Run once in Supabase SQL Editor

```

---

## Mesečni stroški

| Storitev | Plan    | Mesečno |
|----------|---------|---------|
| Supabase | Pro     | $25     |
| Railway  | Hobby   | $5      |
| Vercel   | Free    | $0      |
| Resend   | Free    | $0      |
| **Total**|         | **~$30**|

---

## Troubleshooting

**Login ne deluje (403)**
→ Preveri da je email v tabeli `users` z ustrezno `role`

**Import ne vrne faktur**
→ Impostazioni → Test API → preveri kredenciale
→ System Log → filtriraj `API_ER` za napake

**PDF ni generiran**
→ System Log → filtriraj `PDF` → poišči ERROR vnose

**CORS napaka**
→ Preveri da `FRONTEND_URL` v Railway točno ustreza Vercel URL (brez trailing slash)

---

## Kontakt

Razvoj: JMMC | `admin@jmmc.si`
