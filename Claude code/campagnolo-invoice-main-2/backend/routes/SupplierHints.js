const express  = require('express');
const supabase = require('../utils/supabase');
const { requireAuth } = require('./auth');
const { auditLog } = require('../utils/logger');
const { responsibleColumns } = require('../utils/responsibleResolve');

const router = express.Router();

function isMissingResponsibleUserIdError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  return msg.includes('responsible_user_id') ||
         (msg.toLowerCase().includes('column') && msg.toLowerCase().includes('does not exist'));
}

// ── Normalizzazione fornitore (per dedup case/spacing-insensitive) ──
// Esempio: "OMV - International Services Ges.m.b.H." → "OMV INTERNATIONAL SERVICES GES M B H"
function normalizeSupplier(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[\s\-\.,]+/g, ' ')
    .trim();
}

// ── Validazione conflitti ──
// Kolizija obstaja SAMO, če že obstaja drug zapis z ZNAK-ZA-ZNAK enakim
// fornitore (case-sensitive, vključno s presledki, pikami, vezaji) IN
// istim match_pattern-om (oba brez patterna se štejeta za enaka).
// Različna kategorija NE omili kolizije.
// Različne velike/male črke, dodatni presledki ali ločila → ni kolizije
// (različni dobavitelji veljajo za različne zapise).
async function validateNoConflict({ supplier, matchPattern, excludeId }) {
  const supNew = String(supplier || '');
  if (!supNew) return null;
  const patNew = (matchPattern || '').trim();

  const { data: all, error } = await supabase
    .from('supplier_category_hints')
    .select('id, supplier, match_pattern');
  if (error) throw error;

  const collision = (all || []).find(h => {
    if (h.id === excludeId) return false;
    if (String(h.supplier || '') !== supNew) return false;   // strict equality
    const patExisting = (h.match_pattern || '').trim();
    return patExisting === patNew;
  });

  if (collision) {
    if (!patNew) {
      return `Esiste già una regola per "${supplier}" senza Pattern fattura. Specifica un Pattern fattura per differenziare.`;
    }
    return `Esiste già una regola per "${supplier}" con Pattern fattura "${patNew}". Usa un pattern diverso.`;
  }

  return null;
}

// ── GET /api/supplier-hints — seznam vseh zapisov ─────────────
// usage_count in last_used_at se izračunata v živo iz tabele `invoices`,
// da se zrcalita dejansko stanje (shranjeni counter se je namreč samo inkrementiral
// ob dodelitvi kategorije in se ni zmanjševal ob brisanju/spreminjanju fattur).
router.get('/', requireAuth('admin','supervisor'), async (req, res) => {
  try {
    const { data: hints, error } = await supabase
      .from('supplier_category_hints')
      .select('*, categories(id, cost_type)')
      .order('usage_count', { ascending: false });
    if (error) throw error;

    // Naloži vse fatture s kategorijo v paketih (Supabase default je 1000).
    // PostgREST vrne 416/"Range Not Satisfiable", ko range preseže velikost
    // tabele — to pomeni "konec podatkov", ne napaka → prekinemo in ohranimo
    // kar smo že naložili.
    let invs = null;
    let liveFallbackReason = null;
    try {
      invs = [];
      const pageSize = 1000;
      for (let from = 0; from <= 200000; from += pageSize) {
        const { data: page, error: pErr } = await supabase
          .from('invoices')
          .select('id, supplier, category_id, inv_number, inv_date, imported_at')
          .not('category_id', 'is', null)
          .range(from, from + pageSize - 1);
        if (pErr) {
          const msg = String(pErr.message || '').toLowerCase();
          const code = String(pErr.code || '');
          // 416 / PGRST103 = range not satisfiable → just stop
          if (code === 'PGRST103' || msg.includes('range not satisfiable') || msg.includes('requested range')) {
            break;
          }
          throw pErr;
        }
        if (!page || page.length === 0) break;
        invs.push(...page);
        if (page.length < pageSize) break;
      }
    } catch (liveErr) {
      console.warn('[supplier-hints] live count fallback:', liveErr.message);
      liveFallbackReason = liveErr.message || 'unknown';
      invs = null;
    }

    const rows = (hints || []).map(h => {
      if (!invs) {
        // fallback: vrni hint kakor je (stari stored counter)
        return h;
      }
      const matches = invs.filter(inv => {
        if (inv.supplier !== h.supplier) return false;
        if (inv.category_id !== h.category_id) return false;
        if (h.match_pattern && !String(inv.inv_number || '').includes(h.match_pattern)) return false;
        return true;
      });

      let lastUsed = null;
      for (const m of matches) {
        const t = m.inv_date || m.imported_at || null;
        if (t && (!lastUsed || t > lastUsed)) lastUsed = t;
      }

      return {
        ...h,
        usage_count: matches.length,
        last_used_at: lastUsed,
      };
    });

    if (invs) {
      // Razvrsti po dejanski uporabi (največ najprej).
      rows.sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
    }

    res.json({
      data: rows,
      _meta: {
        live: !!invs,
        invoicesLoaded: invs ? invs.length : null,
        fallbackReason: liveFallbackReason,
      },
    });
  } catch (err) {
    console.error('[supplier-hints GET]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/supplier-hints/:id — posodobi cost_type ──────────
router.put('/:id', requireAuth('admin'), async (req, res) => {
  try {
    const { costType, categoryId, matchPattern } = req.body;

    // Fetch existing record to know supplier (PUT non aggiorna supplier)
    const { data: existing, error: exErr } = await supabase
      .from('supplier_category_hints')
      .select('supplier, match_pattern')
      .eq('id', req.params.id)
      .single();
    if (exErr || !existing) return res.status(404).json({ error: 'Hint not found' });

    // Validate no conflict with sibling rules for same normalized supplier
    const effectivePattern = matchPattern !== undefined ? matchPattern : existing.match_pattern;
    const conflictMsg = await validateNoConflict({
      supplier:     existing.supplier,
      matchPattern: effectivePattern,
      excludeId:    req.params.id,
    });
    if (conflictMsg) return res.status(400).json({ error: conflictMsg });

    const updates = { updated_at: new Date().toISOString() };
    if (costType   !== undefined) updates.cost_type   = costType;
    if (categoryId !== undefined) updates.category_id = categoryId;
    if (matchPattern !== undefined) updates.match_pattern = matchPattern || null;

    // Če se category_id spremeni, posodobi tudi cost_type iz kategorije
    if (categoryId) {
      const { data: cat } = await supabase
        .from('categories')
        .select('cost_type, responsible')
        .eq('id', categoryId)
        .single();
      if (cat?.cost_type)   updates.cost_type  = cat.cost_type;
      if (cat?.responsible) {
        const respCols = await responsibleColumns(cat.responsible);
        updates.responsible         = respCols.responsible;
        updates.responsible_user_id = respCols.responsible_user_id;
      }
    }

    let { error } = await supabase
      .from('supplier_category_hints')
      .update(updates)
      .eq('id', req.params.id);
    if (error && isMissingResponsibleUserIdError(error)) {
      const fallback = { ...updates };
      delete fallback.responsible_user_id;
      ({ error } = await supabase
        .from('supplier_category_hints')
        .update(fallback)
        .eq('id', req.params.id));
    }

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/supplier-hints — ročno pravilo ────────────────
router.post('/', requireAuth('admin'), async (req, res) => {
  try {
    const { supplier, categoryId, matchPattern, responsible } = req.body;
    if (!supplier || !categoryId) {
      return res.status(400).json({ error: 'supplier and categoryId required' });
    }

    // Validate no conflict with existing rules for same normalized supplier
    const conflictMsg = await validateNoConflict({
      supplier,
      matchPattern,
      excludeId: null,
    });
    if (conflictMsg) return res.status(400).json({ error: conflictMsg });

    // Lookup category to get cost_type + default responsible
    const { data: cat } = await supabase
      .from('categories')
      .select('cost_type, responsible')
      .eq('id', categoryId)
      .single();

    const respInput = responsible || cat?.responsible || null;
    const respCols  = await responsibleColumns(respInput);

    const baseInsert = {
      supplier,
      category_id:         categoryId,
      cost_type:           cat?.cost_type || null,
      responsible:         respCols.responsible,
      responsible_user_id: respCols.responsible_user_id,
      match_pattern:       matchPattern?.trim() || null,
      source:              'manual',
      usage_count:         0,
    };
    let { data, error } = await supabase
      .from('supplier_category_hints')
      .insert(baseInsert)
      .select()
      .single();
    if (error && isMissingResponsibleUserIdError(error)) {
      const fallback = { ...baseInsert };
      delete fallback.responsible_user_id;
      ({ data, error } = await supabase
        .from('supplier_category_hints')
        .insert(fallback)
        .select()
        .single());
    }

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/supplier-hints/:id/apply — apliciraj hint na fatture ──
// ?dryRun=true  → vrne samo count
// brez dryRun   → posodobi fatture brez kategorije
router.post('/:id/apply', requireAuth('admin'), async (req, res) => {
  try {
    const dryRun = req.query.dryRun === 'true';

    // Get the hint
    const { data: hint, error: hErr } = await supabase
      .from('supplier_category_hints')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (hErr || !hint) return res.status(404).json({ error: 'Hint not found' });
    if (!hint.category_id) return res.status(400).json({ error: 'Hint has no category' });

    // Find matching invoices: same supplier, no category assigned
    let query = supabase
      .from('invoices')
      .select('id, supplier, er_id, inv_number, category_id')
      .eq('supplier', hint.supplier)
      .is('category_id', null);

    const { data: invoices, error: iErr } = await query;
    if (iErr) throw iErr;

    // Filter by match_pattern if present
    let matched = invoices || [];
    if (hint.match_pattern) {
      matched = matched.filter(inv => (inv.inv_number || '').includes(hint.match_pattern));
    }

    // Dry run — just return count
    if (dryRun) {
      return res.json({ count: matched.length });
    }

    // Apply — dual-write responsible_user_id along with the legacy alias.
    const respCols = hint.responsible_user_id
      ? { responsible: hint.responsible || null, responsible_user_id: hint.responsible_user_id }
      : await responsibleColumns(hint.responsible);

    let updated = 0;
    for (const inv of matched) {
      const baseUpdate = {
        category_id:         hint.category_id,
        cost_type:           hint.cost_type || null,
        responsible:         respCols.responsible,
        responsible_user_id: respCols.responsible_user_id,
        updated_at:          new Date().toISOString(),
      };
      let { error: upErr } = await supabase
        .from('invoices').update(baseUpdate).eq('id', inv.id);
      if (upErr && isMissingResponsibleUserIdError(upErr)) {
        const fallback = { ...baseUpdate };
        delete fallback.responsible_user_id;
        ({ error: upErr } = await supabase
          .from('invoices').update(fallback).eq('id', inv.id));
      }

      if (!upErr) {
        await auditLog({
          invoiceId: inv.id,
          erId:      inv.er_id,
          invNumber: inv.inv_number,
          supplier:  inv.supplier,
          action:    `Assegnazione da Fornitori: "${hint.cost_type || ''}", Delegato "${hint.responsible || '—'}"${hint.match_pattern ? `, Pattern "${hint.match_pattern}"` : ''}`,
          fieldName: 'category_id',
          oldValue:  null,
          newValue:  hint.category_id,
          userEmail: req.user?.email || 'system',
          userName:  req.user?.name  || 'Fornitori',
        });
        updated++;
      }
    }

    res.json({ ok: true, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/supplier-hints/:id — briši zapis ──────────────
router.delete('/:id', requireAuth('admin'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('supplier_category_hints')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
