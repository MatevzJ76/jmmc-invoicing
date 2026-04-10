import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLang } from '../hooks/useLang';

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

export default function Login() {
  const { loginWithGoogle, loginWithPassword } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [mode,    setMode]    = useState('google'); // 'google' | 'password'
  const [email,   setEmail]   = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (mode !== 'google') return;
    const script = document.createElement('script');
    script.src   = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = initGoogle;
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, [mode]);

  function initGoogle() {
    window.google?.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback:  handleCredentialResponse,
    });
    window.google?.accounts.id.renderButton(
      document.getElementById('google-btn'),
      { theme: 'outline', size: 'large', text: 'signin_with', width: 280 }
    );
  }

  async function handleCredentialResponse(response) {
    setLoading(true); setError('');
    try {
      await loginWithGoogle(response.credential);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || t('login.accessDenied'));
    } finally { setLoading(false); }
  }

  async function handlePasswordLogin(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await loginWithPassword(email.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || t('login.invalidCreds'));
    } finally { setLoading(false); }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.header}>
          <div style={S.logoBox}><span style={S.logoIcon}>📋</span></div>
          <h1 style={S.title}>Invoice Manager</h1>
          <p style={S.subtitle}>{t('login.title')}</p>
        </div>

        <div style={S.divider} />

        <div style={S.loginArea}>
          {/* Tab toggle */}
          <div style={S.tabs}>
            <button style={{ ...S.tab, ...(mode === 'google'   ? S.tabActive : {}) }} onClick={() => { setMode('google');   setError(''); }}>{t('login.google')}</button>
            <button style={{ ...S.tab, ...(mode === 'password' ? S.tabActive : {}) }} onClick={() => { setMode('password'); setError(''); }}>{t('login.emailPwd')}</button>
          </div>

          {mode === 'google' && (
            <>
              <p style={S.hint}>{t('login.googleDesc')}</p>
              {loading
                ? <div style={S.loadingText}>{t('login.signingIn')}</div>
                : <div id="google-btn" style={S.googleBtnWrap} />
              }
            </>
          )}

          {mode === 'password' && (
            <form onSubmit={handlePasswordLogin} style={S.form}>
              <input
                style={S.input}
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
              <input
                style={S.input}
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button type="submit" style={S.submitBtn} disabled={loading}>
                {loading ? t('login.signingIn') : t('login.signIn')}
              </button>
            </form>
          )}

          {error && (
            <div style={S.errorBox}>
              <span style={S.errorIcon}>⚠</span> {error}
            </div>
          )}
        </div>

        <p style={S.footer}>
          {t('login.authNote')}<br />
          {t('login.contactAdmin')}
        </p>
      </div>
    </div>
  );
}

const S = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1c2b3a 0%, #2d4055 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '40px 36px',
    width: '100%', maxWidth: 400,
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    textAlign: 'center',
  },
  header:    { marginBottom: 24 },
  logoBox: {
    width: 64, height: 64,
    background: 'linear-gradient(135deg, #1c2b3a, #2d4055)',
    borderRadius: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 16px',
  },
  logoIcon:  { fontSize: 28 },
  title:     { margin: '0 0 4px', fontSize: 24, fontWeight: 700, color: '#1c2b3a', fontFamily: 'sans-serif' },
  subtitle:  { margin: 0, fontSize: 14, color: '#7a7571', fontFamily: 'sans-serif' },
  divider:   { height: 1, background: '#e2e0dd', margin: '24px 0' },
  loginArea: { marginBottom: 24 },
  tabs: {
    display: 'flex',
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid #e2e0dd',
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    padding: '8px 0',
    background: '#f7f6f4',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    color: '#5a5551',
    fontFamily: 'sans-serif',
    transition: 'background 0.15s',
  },
  tabActive: {
    background: '#1c2b3a',
    color: '#fff',
    fontWeight: 600,
  },
  hint:      { margin: '0 0 20px', fontSize: 14, color: '#5a5551', fontFamily: 'sans-serif' },
  googleBtnWrap: { display: 'flex', justifyContent: 'center' },
  loadingText:   { color: '#7a7571', fontSize: 14, fontFamily: 'sans-serif' },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    textAlign: 'left',
  },
  input: {
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #d1cfc9',
    fontSize: 14,
    fontFamily: 'sans-serif',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  submitBtn: {
    padding: '10px 0',
    background: '#1c2b3a',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'sans-serif',
    cursor: 'pointer',
    marginTop: 4,
  },
  errorBox: {
    marginTop: 16,
    padding: '10px 14px',
    background: '#fff5f5',
    border: '1px solid #fed7d7',
    borderRadius: 8,
    color: '#c53030',
    fontSize: 13,
    fontFamily: 'sans-serif',
    textAlign: 'left',
  },
  errorIcon: { marginRight: 6 },
  footer:    { fontSize: 12, color: '#9a9591', lineHeight: 1.5, fontFamily: 'sans-serif' },
};
