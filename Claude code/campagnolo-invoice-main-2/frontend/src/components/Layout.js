import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLang } from '../hooks/useLang';
import ChatWidget from './ChatWidget';

const COLORS = {
  navy:   '#1c2b3a',
  navy2:  '#243448',
  accent: '#c77d3a',
  white:  '#ffffff',
  muted:  '#7a8fa6',
  bg:     '#f4f3f1',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const { t, lang, changeLang } = useLang();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [importModal, setImportModal] = useState(null);
  const [pdfModal,    setPdfModal]    = useState(null);
  // importModal/pdfModal: null | { running, processed, downloaded, skipped, errors, remaining, error, cancelled }

  useEffect(() => {
    function onStart()     { setImportModal({ running: true, processed: 0, total: null, inserted: 0, updated: 0, errors: 0 }); }
    function onProgress(e) { setImportModal(prev => ({ ...prev, ...e.detail, running: true })); }
    function onDone(e)     { setImportModal(prev => ({ ...prev, ...e.detail, running: false })); }
    window.addEventListener('app-import-start',    onStart);
    window.addEventListener('app-import-progress', onProgress);
    window.addEventListener('app-import-done',     onDone);
    return () => {
      window.removeEventListener('app-import-start',    onStart);
      window.removeEventListener('app-import-progress', onProgress);
      window.removeEventListener('app-import-done',     onDone);
    };
  }, []);

  useEffect(() => {
    function onPdfStart()     { setPdfModal({ running: true, downloaded: 0, skipped: 0, errors: 0, remaining: null, processed: 0 }); }
    function onPdfProgress(e) { setPdfModal(prev => ({ ...prev, ...e.detail, running: true })); }
    function onPdfDone(e)     { setPdfModal(prev => ({ ...prev, ...e.detail, running: false })); }
    window.addEventListener('app-pdf-start',    onPdfStart);
    window.addEventListener('app-pdf-progress', onPdfProgress);
    window.addEventListener('app-pdf-done',     onPdfDone);
    return () => {
      window.removeEventListener('app-pdf-start',    onPdfStart);
      window.removeEventListener('app-pdf-progress', onPdfProgress);
      window.removeEventListener('app-pdf-done',     onPdfDone);
    };
  }, []);

  const navItems = [
    { to: '/',                icon: '📊', label: t('nav.dashboard'),    roles: ['admin','supervisor','controller','delegato'] },
    { to: '/invoices',        icon: '🧾', label: t('nav.invoices'),      roles: ['admin','supervisor','controller','delegato','revisore'] },
    { to: '/distinta',        icon: '💳', label: t('nav.distinta'),     roles: ['admin','controller','supervisor'] },
    { to: '/categories',      icon: '🏷️', label: t('nav.categories'),    roles: ['admin','supervisor'] },
    { to: '/supplier-hints',  icon: '🏭', label: t('nav.suppliers'),    roles: ['admin','supervisor'] },
    { to: '/audit',           icon: '📋', label: t('nav.audit'),    roles: ['admin','supervisor'] },
    { to: '/syslog',          icon: '⚙️', label: t('nav.syslog'),      roles: ['admin'] },
    { to: '/users',           icon: '👥', label: t('nav.users'),       roles: ['admin'] },
    { to: '/contabilita',     icon: '📒', label: t('nav.accounting'),  roles: ['admin'] },
    { to: '/settings',        icon: '🔧', label: t('nav.settings'), roles: ['admin'] },
  ].filter(item => item.roles.includes(user?.role));

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const sideW = collapsed ? 64 : 220;

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'DM Sans', sans-serif", background: COLORS.bg }}>

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside style={{ ...S.sidebar, width: sideW, minWidth: sideW }}>

        {/* Logo */}
        <div style={S.logoRow}>
          {!collapsed && (
            <div>
              <div style={S.logoTitle}>Invoice Manager</div>
              <div style={S.logoSub}>Campagnolo Koper</div>
            </div>
          )}
          <button style={S.collapseBtn} onClick={() => setCollapsed(c => !c)}>
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '8px 0' }}>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              style={({ isActive }) => ({
                ...S.navItem,
                background: isActive ? COLORS.navy2 : 'transparent',
                borderLeft: isActive ? `3px solid ${COLORS.accent}` : '3px solid transparent',
                paddingLeft: isActive ? 13 : 16,
                justifyContent: collapsed ? 'center' : 'flex-start',
              })}
            >
              <span style={S.navIcon}>{item.icon}</span>
              {!collapsed && <span style={S.navLabel}>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Language switcher */}
        {!collapsed && (
          <div style={S.langRow}>
            {['it','sl','en'].map(l => (
              <button
                key={l}
                onClick={() => changeLang(l)}
                style={{ ...S.langBtn, ...(lang === l ? S.langBtnActive : {}) }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {/* User info + logout */}
        <div style={{ ...S.userRow, justifyContent: collapsed ? 'center' : 'space-between' }}>
          {!collapsed && (
            <div>
              <div style={S.userName}>{user?.name}</div>
              <div style={S.userRole}>{user?.role}</div>
            </div>
          )}
          <button style={S.logoutBtn} onClick={handleLogout} title="Logout">
            ⏻
          </button>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────── */}
      <main style={S.main}>
        <Outlet />
      </main>

      {/* ── Import progress modal ────────────────────────── */}
      {importModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.22)', fontFamily: 'sans-serif' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ fontSize: 20 }}>{importModal.running ? '⏳' : importModal.error ? '✕' : '✓'}</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1c2b3a' }}>
                  {importModal.running ? t('layout.importRunning') : importModal.error ? t('layout.importError') : t('layout.importDone')}
                </div>
                <div style={{ fontSize: 12, color: '#7a7571', marginTop: 2 }}>
                  {importModal.running ? `${t('layout.importProcessing')} ${importModal.processed || 0} / ${importModal.total || '…'}` : t('layout.importSync')}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            {!importModal.error && (
              <div style={{ background: '#f0eeec', borderRadius: 6, height: 8, marginBottom: 20, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 6,
                  background: importModal.running ? '#c77d3a' : '#1d7c4d',
                  width: importModal.total
                    ? `${Math.min(100, Math.round((importModal.processed / importModal.total) * 100))}%`
                    : importModal.running ? '60%' : '100%',
                  transition: 'width 0.4s ease',
                }}/>
              </div>
            )}

            {/* Stats */}
            {!importModal.error ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 24 }}>
                {[
                  { label: t('layout.importNew'), value: importModal.inserted || 0, color: '#1d7c4d', bg: '#eaf7ef' },
                  { label: t('layout.importUpdated'), value: importModal.updated || 0, color: '#1c2b3a', bg: '#f0f2f5' },
                  { label: t('layout.importErrors'), value: importModal.errors || 0, color: importModal.errors > 0 ? '#c0392b' : '#7a7571', bg: importModal.errors > 0 ? '#fdecea' : '#f4f3f1' },
                ].map(s => (
                  <div key={s.label} style={{ background: s.bg, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: '#7a7571', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: '#fdecea', borderRadius: 8, padding: '12px 14px', marginBottom: 24, fontSize: 13, color: '#c0392b' }}>
                {importModal.error}
              </div>
            )}

            {/* Cancelled notice */}
            {importModal.cancelled && (
              <div style={{ background: '#fff8e6', border: '1px solid #f0d080', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: 12, color: '#7a5a00' }}>
                ⚠ {t('layout.importCancelled')}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {importModal.running && (
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('app-import-cancel'))}
                  style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #c0392b', background: '#fff', color: '#c0392b', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  {'✕ ' + t('layout.cancelImport')}
                </button>
              )}
              <button
                onClick={() => setImportModal(null)}
                style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: '#1c2b3a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                {importModal.running ? t('layout.minimize') : t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Scarica PDF progress modal ───────────────────── */}
      {pdfModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.22)', fontFamily: 'sans-serif' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ fontSize: 20 }}>{pdfModal.running ? '⏳' : pdfModal.error ? '✕' : '✓'}</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1c2b3a' }}>
                  {pdfModal.running ? t('layout.pdfRunning') : pdfModal.error ? t('layout.pdfError') : t('layout.pdfDone')}
                </div>
                <div style={{ fontSize: 12, color: '#7a7571', marginTop: 2 }}>
                  {pdfModal.running
                    ? `${t('layout.pdfProcessing')} ${pdfModal.processed || 0} · ${t('layout.pdfRemaining')}: ${pdfModal.remaining ?? '…'}`
                    : t('layout.pdfSource')}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            {!pdfModal.error && (
              <div style={{ background: '#f0eeec', borderRadius: 6, height: 8, marginBottom: 20, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 6,
                  background: pdfModal.running ? '#c77d3a' : '#1d7c4d',
                  width: pdfModal.running
                    ? (pdfModal.remaining === 0 ? '100%' : '60%')
                    : '100%',
                  transition: 'width 0.4s ease',
                }}/>
              </div>
            )}

            {/* Stats */}
            {!pdfModal.error ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 24 }}>
                {[
                  { label: t('layout.pdfDownloaded'),     value: pdfModal.downloaded || 0, color: '#1d7c4d', bg: '#eaf7ef' },
                  { label: t('layout.pdfNoAttach'), value: pdfModal.skipped   || 0, color: '#7a5a00', bg: '#fff8e6' },
                  { label: t('layout.pdfErrors'),        value: pdfModal.errors     || 0, color: pdfModal.errors > 0 ? '#c0392b' : '#7a7571', bg: pdfModal.errors > 0 ? '#fdecea' : '#f4f3f1' },
                ].map(s => (
                  <div key={s.label} style={{ background: s.bg, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: '#7a7571', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: '#fdecea', borderRadius: 8, padding: '12px 14px', marginBottom: 24, fontSize: 13, color: '#c0392b' }}>
                {pdfModal.error}
              </div>
            )}

            {/* Cancelled notice */}
            {pdfModal.cancelled && (
              <div style={{ background: '#fff8e6', border: '1px solid #f0d080', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: 12, color: '#7a5a00' }}>
                ⚠ {t('layout.pdfCancelled')}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {pdfModal.running && (
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('app-pdf-cancel'))}
                  style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #c0392b', background: '#fff', color: '#c0392b', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  {'✕ ' + t('layout.cancelPdf')}
                </button>
              )}
              <button
                onClick={() => setPdfModal(null)}
                style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: '#1c2b3a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                {pdfModal.running ? t('layout.minimize') : t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Chat Widget ────────────────────────────────── */}
      <ChatWidget />
    </div>
  );
}

const S = {
  sidebar: {
    background:    COLORS.navy,
    color:         COLORS.white,
    display:       'flex',
    flexDirection: 'column',
    transition:    'width 0.2s ease',
    overflow:      'hidden',
    flexShrink:    0,
  },
  logoRow: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '20px 16px 16px',
    borderBottom:   `1px solid rgba(255,255,255,0.08)`,
  },
  logoTitle:   { fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.2 },
  logoSub:     { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  collapseBtn: {
    background: 'transparent', border: 'none',
    color: COLORS.muted, cursor: 'pointer',
    fontSize: 18, padding: '2px 4px',
  },
  navItem: {
    display:        'flex',
    alignItems:     'center',
    gap:            10,
    padding:        '9px 16px',
    textDecoration: 'none',
    color:          COLORS.white,
    fontSize:       13,
    fontWeight:     500,
    transition:     'background 0.15s',
    whiteSpace:     'nowrap',
  },
  navIcon:  { fontSize: 16, flexShrink: 0 },
  navLabel: { overflow: 'hidden', textOverflow: 'ellipsis' },
  langRow: {
    display:        'flex',
    gap:            4,
    padding:        '8px 16px',
    borderTop:      `1px solid rgba(255,255,255,0.08)`,
    justifyContent: 'flex-start',
  },
  langBtn: {
    padding:      '3px 8px',
    borderRadius: 4,
    border:       '1px solid rgba(255,255,255,0.2)',
    background:   'transparent',
    color:        COLORS.muted,
    cursor:       'pointer',
    fontSize:     11,
    fontWeight:   600,
  },
  langBtnActive: {
    background: COLORS.accent,
    color:      '#fff',
    border:     `1px solid ${COLORS.accent}`,
  },
  userRow: {
    display:    'flex',
    alignItems: 'center',
    padding:    '12px 16px',
    borderTop:  `1px solid rgba(255,255,255,0.08)`,
  },
  userName: { fontSize: 12, fontWeight: 600, color: '#fff' },
  userRole: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  logoutBtn: {
    background:   'transparent',
    border:       '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6,
    color:        COLORS.muted,
    cursor:       'pointer',
    fontSize:     16,
    padding:      '4px 8px',
    transition:   'color 0.15s',
  },
  main: {
    flex:     1,
    overflow: 'auto',
    padding:  16,
  },
};
