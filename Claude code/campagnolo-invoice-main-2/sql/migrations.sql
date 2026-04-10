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

-- ─── INVOICE TRANSLATIONS (AI PDF translate cache) ──────────
CREATE TABLE IF NOT EXISTS invoice_translations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  lang        TEXT NOT NULL CHECK (lang IN ('it','sl','en')),
  translation TEXT NOT NULL,
  model       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  created_by  TEXT,
  UNIQUE(invoice_id, lang)
);
CREATE INDEX IF NOT EXISTS idx_translations_invoice ON invoice_translations(invoice_id);

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

-- ─── PATCH: add distinta_report to attachment_type constraint ─
-- Run this separately if the DB was already created with the old constraint:
ALTER TABLE invoice_attachments
  DROP CONSTRAINT invoice_attachments_attachment_type_check;
ALTER TABLE invoice_attachments
  ADD CONSTRAINT invoice_attachments_attachment_type_check
  CHECK (attachment_type IN ('original', 'approval_report', 'distinta_report'));

-- ─── PATCH: consolidate payment_order into payment_status ─────
-- Step 1: migrate existing payment_order values where payment_status is NULL
UPDATE invoices
  SET payment_status = CASE payment_order
    WHEN 'To Be Paid'      THEN 'da_pagare'
    WHEN 'Payment Ordered' THEN 'in_pagamento'
    WHEN 'Paid'            THEN 'pagato'
    ELSE NULL
  END
  WHERE payment_status IS NULL AND payment_order IS NOT NULL;

-- Step 2: update CHECK constraint on payment_status
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_payment_status_check
  CHECK (payment_status IN ('da_pagare', 'inviato', 'in_pagamento', 'pagato', 'parziale'));

-- Step 3: drop payment_order column and its index
DROP INDEX IF EXISTS idx_invoices_payment_order;
ALTER TABLE invoices DROP COLUMN IF EXISTS payment_order;

-- ─── PATCH: remove categories.name — use cost_type as primary label ──
-- Step 1: drop the UNIQUE constraint on name (conflict key for seed)
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key;
-- Step 2: drop the column
ALTER TABLE categories DROP COLUMN IF EXISTS name;
-- Note: seed INSERT now uses ON CONFLICT (cost_type) or plain INSERT

-- ─── PATCH: replace verified_flag with status-based tracking ──────────────
-- verified_flag removed; status_changed_* columns track who changed status and when;
-- status_note replaces both verified_comment and status_comment (merged).

-- Step 1: migrate existing status_comment (rejection reasons) into verified_comment
UPDATE invoices
  SET verified_comment = status_comment
  WHERE status = 'Rejected'
    AND status_comment IS NOT NULL
    AND (verified_comment IS NULL OR verified_comment = '');

-- Step 2: drop verified_flag and its index
DROP INDEX IF EXISTS idx_invoices_verified;
ALTER TABLE invoices DROP COLUMN IF EXISTS verified_flag;

-- Step 3: rename verified_* columns to status_changed_*
ALTER TABLE invoices RENAME COLUMN verified_by      TO status_changed_by;
ALTER TABLE invoices RENAME COLUMN verified_by_name TO status_changed_by_name;
ALTER TABLE invoices RENAME COLUMN verified_at      TO status_changed_at;
ALTER TABLE invoices RENAME COLUMN verified_comment TO status_note;

-- Step 4: drop old status_comment (merged into status_note)
ALTER TABLE invoices DROP COLUMN IF EXISTS status_comment;

-- ─── PATCH: add payment_sort_order generated column ───────────
-- Maps payment_status string → numeric order for correct column sort.
-- NULL payment_status treated as 'da_pagare' (1).
-- Logical order: da_pagare(1) < inviato(2) < in_pagamento(3) < parziale(4) < pagato(5)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_sort_order SMALLINT
  GENERATED ALWAYS AS (
    CASE COALESCE(payment_status, 'da_pagare')
      WHEN 'da_pagare'    THEN 1
      WHEN 'inviato'      THEN 2
      WHEN 'in_pagamento' THEN 3
      WHEN 'parziale'     THEN 4
      WHEN 'pagato'       THEN 5
      ELSE 1
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_invoices_payment_sort ON invoices(payment_sort_order);

-- ─── SUPPLIER CATEGORY HINTS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_category_hints (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier      TEXT NOT NULL,
  supplier_code TEXT,
  category_id   UUID REFERENCES categories(id),
  cost_type     TEXT,
  responsible   TEXT,
  match_pattern TEXT,
  source        TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual')),
  usage_count   INTEGER DEFAULT 1,
  last_used_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hints_supplier ON supplier_category_hints(supplier);
CREATE INDEX IF NOT EXISTS idx_hints_source   ON supplier_category_hints(source);

-- ─── PATCH: add match_pattern + source to existing supplier_category_hints ──
ALTER TABLE supplier_category_hints ADD COLUMN IF NOT EXISTS match_pattern TEXT;
ALTER TABLE supplier_category_hints ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'auto';

-- ─── RPC: upsert_supplier_hint (updated for source='auto') ──
CREATE OR REPLACE FUNCTION upsert_supplier_hint(
  p_supplier    TEXT,
  p_category_id UUID,
  p_cost_type   TEXT DEFAULT NULL,
  p_responsible TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO supplier_category_hints (supplier, category_id, cost_type, responsible, source, usage_count, last_used_at)
  VALUES (p_supplier, p_category_id, p_cost_type, p_responsible, 'auto', 1, NOW())
  ON CONFLICT (supplier, category_id) WHERE match_pattern IS NULL AND source = 'auto'
  DO UPDATE SET
    cost_type    = COALESCE(EXCLUDED.cost_type, supplier_category_hints.cost_type),
    responsible  = COALESCE(EXCLUDED.responsible, supplier_category_hints.responsible),
    usage_count  = supplier_category_hints.usage_count + 1,
    last_used_at = NOW(),
    updated_at   = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── PATCH: cleanup invoices with cost_type but no responsible ───
-- Records with category data but no delegato → reset to Nessuna
UPDATE invoices
  SET cost_type   = NULL,
      category_id = NULL
  WHERE responsible IS NULL
    AND (cost_type IS NOT NULL OR category_id IS NOT NULL);

-- ─── PATCH: pattern-aware unique constraint on supplier_category_hints ──
-- Stara full UNIQUE(supplier, category_id) je prepovedovala več pravil z
-- različnimi match_pattern za isti par supplier+categoria. Zamenjamo jo z
-- dvema parcialnima indeksoma:
--   1) maks. ENO pravilo brez patterna na (supplier, category_id)
--   2) pattern-based pravila morajo biti unikatna po (supplier, category_id, match_pattern)
ALTER TABLE supplier_category_hints
  DROP CONSTRAINT IF EXISTS supplier_category_hints_supplier_category_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS supplier_category_hints_no_pattern_uniq
  ON supplier_category_hints (supplier, category_id)
  WHERE match_pattern IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS supplier_category_hints_with_pattern_uniq
  ON supplier_category_hints (supplier, category_id, match_pattern)
  WHERE match_pattern IS NOT NULL;

-- Posodobimo upsert_supplier_hint, da ON CONFLICT cilja nov parcialni indeks.
-- WHERE klavzula se mora ujemati z indeksom → odstranimo "source = 'auto'".
CREATE OR REPLACE FUNCTION upsert_supplier_hint(
  p_supplier    TEXT,
  p_category_id UUID,
  p_cost_type   TEXT DEFAULT NULL,
  p_responsible TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO supplier_category_hints (supplier, category_id, cost_type, responsible, source, usage_count, last_used_at)
  VALUES (p_supplier, p_category_id, p_cost_type, p_responsible, 'auto', 1, NOW())
  ON CONFLICT (supplier, category_id) WHERE match_pattern IS NULL
  DO UPDATE SET
    cost_type    = COALESCE(EXCLUDED.cost_type, supplier_category_hints.cost_type),
    responsible  = COALESCE(EXCLUDED.responsible, supplier_category_hints.responsible),
    usage_count  = supplier_category_hints.usage_count + 1,
    last_used_at = NOW(),
    updated_at   = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
