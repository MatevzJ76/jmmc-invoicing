import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLang } from '../hooks/useLang';

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

  const navItems = [
    { to: '/',                icon: '📊', label: 'Dashboard',    roles: ['admin','supervisor','controller','delegato','revisore'] },
    { to: '/invoices',        icon: '🧾', label: 'Fatture',      roles: ['admin','supervisor','controller','delegato','revisore'] },
    { to: '/distinta',        icon: '💳', label: 'Distinta',     roles: ['admin','supervisor','controller'] },
    { to: '/categories',      icon: '🏷️', label: 'Categorie',    roles: ['admin'] },
    { to: '/supplier-hints',  icon: '🏭', label: 'Fornitori',    roles: ['admin'] },
    { to: '/audit',           icon: '📋', label: 'Audit log',    roles: ['admin','supervisor'] },
    { to: '/syslog',          icon: '⚙️', label: 'Sys log',      roles: ['admin'] },
    { to: '/users',           icon: '👥', label: 'Utenti',       roles: ['admin'] },
    { to: '/settings',        icon: '🔧', label: 'Impostazioni', roles: ['admin'] },
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
    padding:  24,
  },
};
