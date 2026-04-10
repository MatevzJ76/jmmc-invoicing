// ── users.js ─────────────────────────────────────────────────
const express  = require('express');
const bcrypt   = require('bcryptjs');
const supabase = require('../utils/supabase');
const { requireAuth, isStrongPassword } = require('./auth');
const { invalidateUserCache } = require('../utils/responsibleResolve');

const usersRouter = express.Router();

function isMissingResponsibleUserIdError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  return msg.includes('responsible_user_id') ||
         (msg.toLowerCase().includes('column') && msg.toLowerCase().includes('does not exist'));
}

usersRouter.get('/', requireAuth('admin'), async (req, res) => {
  // Try with ai_enabled; fall back without it if column doesn't exist yet
  let { data, error } = await supabase.from('users').select('id,email,name,role,responsible,active,ai_enabled,created_at').order('name');
  if (error && error.message && error.message.includes('ai_enabled')) {
    ({ data, error } = await supabase.from('users').select('id,email,name,role,responsible,active,created_at').order('name'));
    if (data) data = data.map(u => ({ ...u, ai_enabled: false }));
  }
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

usersRouter.post('/', requireAuth('admin'), async (req, res) => {
  const { email, name, role, responsible } = req.body;
  // Alias (responsible) è deprecato dall'UI: se non fornito, usa il Name come chiave
  // di collegamento con invoices/categories per non rompere i filtri revisore.
  const aliasValue = (responsible && responsible.trim()) || (name && name.trim()) || null;
  const { data, error } = await supabase.from('users')
    .insert({ email: email.toLowerCase(), name, role, responsible: aliasValue })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  invalidateUserCache();
  res.json({ data });
});

usersRouter.put('/:id', requireAuth('admin'), async (req, res) => {
  const { email, name, role, responsible, active, ai_enabled } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (email       !== undefined) updates.email       = email.toLowerCase().trim();
  if (name        !== undefined) updates.name        = name;
  if (role        !== undefined) updates.role        = role;
  if (responsible !== undefined) updates.responsible = responsible || null;
  if (active      !== undefined) updates.active      = active;
  if (ai_enabled  !== undefined) updates.ai_enabled  = ai_enabled;
  let { data, error } = await supabase.from('users').update(updates).eq('id', req.params.id).select().single();
  // If ai_enabled column doesn't exist yet, retry without it
  if (error && error.message && error.message.includes('ai_enabled')) {
    delete updates.ai_enabled;
    ({ data, error } = await supabase.from('users').update(updates).eq('id', req.params.id).select().single());
  }
  if (error) return res.status(400).json({ error: error.message });
  invalidateUserCache();
  res.json({ data });
});

// ── Set / change password (admin only) ───────────────────────
usersRouter.put('/:id/password', requireAuth('admin'), async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password obbligatoria' });
  if (!isStrongPassword(password))
    return res.status(400).json({
      error: 'Password troppo debole. Minimo 12 caratteri con maiuscola, minuscola, numero e carattere speciale.',
    });
  const hash = await bcrypt.hash(password, 12);
  const { error } = await supabase.from('users')
    .update({ password_hash: hash, updated_at: new Date().toISOString() })
    .eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// ── Remove password (admin only) ─────────────────────────────
usersRouter.delete('/:id/password', requireAuth('admin'), async (req, res) => {
  const { error } = await supabase.from('users')
    .update({ password_hash: null, updated_at: new Date().toISOString() })
    .eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// ── DELETE /api/users/:id — hard delete with safety checks ──────
// Blocks if the user is referenced by any category or invoice
// (matched on the user's alias = responsible || name).
usersRouter.delete('/:id', requireAuth('admin'), async (req, res) => {
  try {
    const id = req.params.id;

    // Prevent deleting own account
    if (req.user?.id && String(req.user.id) === String(id)) {
      return res.status(409).json({ error: 'Non puoi eliminare il tuo stesso account.', code: 'self_delete' });
    }

    // Load the user to know their alias
    const { data: user, error: uErr } = await supabase
      .from('users')
      .select('id, email, name, responsible, role')
      .eq('id', id)
      .single();
    if (uErr || !user) return res.status(404).json({ error: 'Utente non trovato.' });

    const alias = (user.responsible && user.responsible.trim()) || (user.name && user.name.trim()) || null;

    // ── Step 1: prefer FK-based safety check (responsible_user_id = id).
    // Falls back to alias-based matching when the FK column does not yet
    // exist in the DB (FAZA B: SQL migration may not be applied).
    let useFkPath = true;

    // 1a) Categories referencing this user via FK
    {
      const { data: catRows, error: cErr } = await supabase
        .from('categories')
        .select('id, cost_type, active')
        .eq('responsible_user_id', id);
      if (cErr && isMissingResponsibleUserIdError(cErr)) {
        useFkPath = false;
      } else if (cErr) {
        throw cErr;
      } else if ((catRows || []).length > 0) {
        const cats = catRows;
        const names = cats.map(c => c.cost_type).filter(Boolean);
        return res.status(409).json({
          error: `Impossibile eliminare: ${cats.length} categori${cats.length === 1 ? 'a usa' : 'e usano'} questo utente come responsabile: ${names.join(', ')}. Riassegna prima queste categorie a un altro utente.`,
          code: 'used_in_categories',
          count: cats.length,
          items: names,
          alias,
        });
      }
    }

    // 1b) Invoices referencing this user via FK
    if (useFkPath) {
      const { data: invRows, error: iErr } = await supabase
        .from('invoices')
        .select('id, supplier, inv_number')
        .eq('responsible_user_id', id)
        .limit(20);
      if (iErr && isMissingResponsibleUserIdError(iErr)) {
        useFkPath = false;
      } else if (iErr) {
        throw iErr;
      } else {
        const invs = invRows || [];
        const { count: invCountAll } = await supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('responsible_user_id', id);
        const total = invCountAll || invs.length;
        if (total > 0) {
          const sample = invs.slice(0, 5).map(i => i.supplier || i.inv_number || `#${i.id}`).filter(Boolean);
          const more = total > sample.length ? ` … (+${total - sample.length} altre)` : '';
          return res.status(409).json({
            error: `Impossibile eliminare: ${total} fattur${total === 1 ? 'a è assegnata' : 'e sono assegnate'} a questo utente: ${sample.join(', ')}${more}. Riassegna o elimina queste fatture prima di procedere.`,
            code: 'used_in_invoices',
            count: total,
            items: sample,
            alias,
          });
        }
      }
    }

    // ── Step 2: legacy alias-based fallback (only when FK column missing).
    if (!useFkPath && alias) {
      // Check if ANOTHER user shares the same alias (responsible OR name).
      // If yes, deleting this user is safe wrt rows that reference the alias
      // as a string — the alias still has an owner after deletion.
      let aliasSharedByOther = false;
      const { data: siblings } = await supabase
        .from('users')
        .select('id, name, responsible')
        .or(`responsible.ilike.${alias},name.ilike.${alias}`)
        .neq('id', id);
      aliasSharedByOther = (siblings || []).some(s => {
        const sAlias = (s.responsible && s.responsible.trim()) || (s.name && s.name.trim()) || '';
        return sAlias.toLowerCase() === alias.toLowerCase();
      });

      if (!aliasSharedByOther) {
        const { data: catRows, error: cErr } = await supabase
          .from('categories')
          .select('id, cost_type, active')
          .ilike('responsible', alias);
        if (cErr) throw cErr;
        const cats = catRows || [];
        if (cats.length > 0) {
          const names = cats.map(c => c.cost_type).filter(Boolean);
          return res.status(409).json({
            error: `Impossibile eliminare: ${cats.length} categori${cats.length === 1 ? 'a usa' : 'e usano'} questo utente come responsabile (alias "${alias}"): ${names.join(', ')}. Riassegna prima queste categorie a un altro utente.`,
            code: 'used_in_categories',
            count: cats.length,
            items: names,
            alias,
          });
        }

        const { data: invRows, error: iErr } = await supabase
          .from('invoices')
          .select('id, supplier, inv_number')
          .ilike('responsible', alias)
          .limit(20);
        if (iErr) throw iErr;
        const { count: invCountAll } = await supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .ilike('responsible', alias);
        const invs = invRows || [];
        const total = invCountAll || invs.length;
        if (total > 0) {
          const sample = invs.slice(0, 5).map(i => i.supplier || i.inv_number || `#${i.id}`).filter(Boolean);
          const more = total > sample.length ? ` … (+${total - sample.length} altre)` : '';
          return res.status(409).json({
            error: `Impossibile eliminare: ${total} fattur${total === 1 ? 'a è assegnata' : 'e sono assegnate'} a questo utente (alias "${alias}"): ${sample.join(', ')}${more}. Riassegna o elimina queste fatture prima di procedere.`,
            code: 'used_in_invoices',
            count: total,
            items: sample,
            alias,
          });
        }
      }
    }

    // Safe to hard delete
    const { error: delErr } = await supabase
      .from('users')
      .delete()
      .eq('id', id);
    if (delErr) throw delErr;

    invalidateUserCache();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = usersRouter;
