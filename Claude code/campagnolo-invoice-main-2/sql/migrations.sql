-- ============================================================
-- Campagnolo Koper — Invoice Manager
-- SQL Migrations v1.0
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USERS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin','federico','varga','auditor')),
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CATEGORIES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT UNIQUE NOT NULL,
  cost_type     TEXT NOT NULL,
  responsible   TEXT NOT NULL CHECK (responsible IN ('FEDERICO','VARGA')),
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INVOICES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- e-računi data
  er_id                 TEXT UNIQUE NOT NULL,
  internal_number       TEXT,
  inv_number            TEXT,
  inv_date              DATE,
  receival_date         DATE,
  due_date              DATE,
  supply_date           DATE,
  supplier              TEXT,
  supplier_code         TEXT,
  net_amount            NUMERIC(12,2),
  vat                   NUMERIC(12,2),
  total                 NUMERIC(12,2),
  already_paid          NUMERIC(12,2) DEFAULT 0,
  left_to_pay           NUMERIC(12,2),
  currency              TEXT DEFAULT 'EUR',
  payment_method        TEXT,
  bank_account          TEXT,
  pay_reference         TEXT,
  remarks               TEXT,
  business_year         INTEGER,

  -- Workflow
  status                TEXT DEFAULT 'Pending'
                          CHECK (status IN ('Pending','Approved','Rejected')),
  category_id           UUID REFERENCES categories(id),
  cost_type             TEXT,
  responsible           TEXT CHECK (responsible IN ('FEDERICO','VARGA')),

  -- Verification flag (core workflow)
  verified_flag         BOOLEAN DEFAULT false,
  verified_by           TEXT,
  verified_by_name      TEXT,
  verified_at           TIMESTAMPTZ,
  verified_comment      TEXT,

  -- Payment
  payment_order         TEXT DEFAULT 'To Be Paid'
                          CHECK (payment_order IN ('To Be Paid','Payment Ordered','Paid')),
  payment_date          DATE,
  payment_source        TEXT CHECK (payment_source IN ('c/c','carta','cassa')),

  -- Meta
  imported_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  -- PDF refs
  original_pdf_id       UUID,
  approval_pdf_id       UUID
);

-- ─── INVOICE ITEMS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id        UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position          INTEGER,
  description       TEXT,
  net_amount        NUMERIC(12,2),
  vat_percentage    NUMERIC(5,2),
  cost_position     TEXT,
  gl_account        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INVOICE ATTACHMENTS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_attachments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  er_id           TEXT NOT NULL,
  attachment_type TEXT NOT NULL CHECK (attachment_type IN ('original','approval_report')),
  file_name       TEXT NOT NULL,
  file_type       TEXT DEFAULT 'pdf',
  contents_b64    TEXT NOT NULL,
  file_size_kb    INTEGER,
  er_uploaded     BOOLEAN DEFAULT false,
  er_uploaded_at  TIMESTAMPTZ,
  er_txn_id       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      TEXT
);

-- ─── AUDIT LOG ───────────────────────────────────────────────
-- Business events only: verified_flag changes
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id    UUID REFERENCES invoices(id),
  er_id         TEXT,
  inv_number    TEXT,
  supplier      TEXT,
  total         NUMERIC(12,2),
  action        TEXT NOT NULL,
  field_name    TEXT,
  old_value     TEXT,
  new_value     TEXT,
  user_email    TEXT NOT NULL,
  user_name     TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SYSTEM LOG ──────────────────────────────────────────────
-- Technical events: API calls, imports, PDF, auth, email, scheduler
CREATE TABLE IF NOT EXISTS system_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ts            TIMESTAMPTZ DEFAULT NOW(),
  level         TEXT NOT NULL CHECK (level IN ('INFO','WARN','ERROR','DEBUG')),
  category      TEXT NOT NULL CHECK (category IN (
                  'API_ER','IMPORT','PDF','AUTH','EMAIL','SCHEDULER','SYSTEM')),
  user_email    TEXT,
  invoice_id    UUID,
  er_id         TEXT,
  action        TEXT NOT NULL,
  detail        TEXT,
  method        TEXT,
  status_code   INTEGER,
  duration_ms   INTEGER,
  request_id    TEXT,
  error_msg     TEXT,
  stack_trace   TEXT,
  env           TEXT DEFAULT 'production',
  app_version   TEXT DEFAULT '1.0.0',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SETTINGS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  TEXT
);

-- ─── INDEXES ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_er_id        ON invoices(er_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date      ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status        ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_responsible   ON invoices(responsible);
CREATE INDEX IF NOT EXISTS idx_invoices_verified      ON invoices(verified_flag);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_order ON invoices(payment_order);
CREATE INDEX IF NOT EXISTS idx_invoices_imported_at   ON invoices(imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_invoice_id       ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_attachments_invoice    ON invoice_attachments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_attachments_er_id      ON invoice_attachments(er_id);
CREATE INDEX IF NOT EXISTS idx_attachments_type       ON invoice_attachments(attachment_type);
CREATE INDEX IF NOT EXISTS idx_audit_invoice_id       ON audit_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_audit_user             ON audit_log(user_email);
CREATE INDEX IF NOT EXISTS idx_audit_created          ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_syslog_ts              ON system_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_syslog_level           ON system_log(level);
CREATE INDEX IF NOT EXISTS idx_syslog_category        ON system_log(category);
CREATE INDEX IF NOT EXISTS idx_syslog_er_id           ON system_log(er_id);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────
ALTER TABLE invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings           ENABLE ROW LEVEL SECURITY;

-- Backend uses service_role key → bypasses RLS automatically
-- These policies protect direct DB access (e.g. Supabase Studio)

-- Invoices: service_role only
CREATE POLICY "service_role_invoices" ON invoices
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_items" ON invoice_items
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_attachments" ON invoice_attachments
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_audit" ON audit_log
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_syslog" ON system_log
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_categories" ON categories
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_users" ON users
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_settings" ON settings
  USING (auth.role() = 'service_role');

-- ─── SEED: DEFAULT SETTINGS ──────────────────────────────────
INSERT INTO settings (key, value) VALUES
  ('er_url',              'https://e-racuni.com/WebServicesSI/API'),
  ('er_user',             ''),
  ('er_secretkey',        ''),
  ('er_token',            ''),
  ('import_enabled',      'true'),
  ('import_interval_min', '60'),
  ('import_date_from',    '2026-01-01'),
  ('email_admin',         ''),
  ('email_federico',      ''),
  ('email_varga',         ''),
  ('email_errors',        ''),
  ('app_version',         '1.0.0')
ON CONFLICT (key) DO NOTHING;

-- ─── SEED: DEFAULT CATEGORIES ────────────────────────────────
INSERT INTO categories (name, cost_type, responsible) VALUES
  ('Assicurazioni',  'Assicurazioni',  'VARGA'),
  ('Banche',         'Banche',         'VARGA'),
  ('Carburante',     'Carburante',     'FEDERICO'),
  ('Consulenze',     'Consulenze',     'VARGA'),
  ('Leasing',        'Leasing',        'VARGA'),
  ('Manutenzione',   'Manutenzione',   'FEDERICO'),
  ('Materiali',      'Materiali',      'FEDERICO'),
  ('Noleggio',       'Noleggio',       'FEDERICO'),
  ('Servizi',        'Servizi',        'VARGA'),
  ('Spese generali', 'Spese generali', 'VARGA'),
  ('Telefonia',      'Telefonia',      'VARGA'),
  ('Utenze',         'Utenze',         'VARGA')
ON CONFLICT (name) DO NOTHING;

-- ─── SEED: USERS (update emails before running!) ─────────────
-- INSERT INTO users (email, name, role) VALUES
--   ('admin@jmmc.si',            'JMMC Admin',    'admin'),
--   ('federico@campagnolo.it',   'Federico Rossi','federico'),
--   ('varga@campagnolo.it',      'Varga Petra',   'varga'),
--   ('revisore@jmmc.si',         'Revisore',      'auditor');

-- ─── AUTO-CLEANUP FUNCTION (system_log > 90 days) ────────────
CREATE OR REPLACE FUNCTION cleanup_system_log()
RETURNS void AS $$
BEGIN
  DELETE FROM system_log
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Migration complete.
-- Next step: uncomment and run the SEED: USERS block above
-- after updating the email addresses.
-- ============================================================
