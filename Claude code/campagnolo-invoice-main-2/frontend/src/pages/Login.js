import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

export default function Login() {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load Google Identity Services script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = initGoogle;
    document.head.appendChild(script);
    return () => document.head.removeChild(script);
  }, []);

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
    setLoading(true);
    setError('');
    try {
      await loginWithGoogle(response.credential);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Accesso negato. Contatta l\'amministratore.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* Logo / Header */}
        <div style={S.header}>
          <div style={S.logoBox}>
            <span style={S.logoIcon}>📋</span>
          </div>
          <h1 style={S.title}>Invoice Manager</h1>
          <p style={S.subtitle}>Campagnolo Koper</p>
        </div>

        {/* Divider */}
        <div style={S.divider} />

        {/* Login area */}
        <div style={S.loginArea}>
          <p style={S.hint}>Accedi con il tuo account Google aziendale</p>

          {loading ? (
            <div style={S.loadingText}>Accesso in corso...</div>
          ) : (
            <div id="google-btn" style={S.googleBtnWrap} />
          )}

          {error && (
            <div style={S.errorBox}>
              <span style={S.errorIcon}>⚠</span> {error}
            </div>
          )}
        </div>

        <p style={S.footer}>
          Solo gli account autorizzati possono accedere.<br />
          Contatta <strong>admin@jmmc.si</strong> per assistenza.
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
  header: { marginBottom: 24 },
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
  hint:      { margin: '0 0 20px', fontSize: 14, color: '#5a5551', fontFamily: 'sans-serif' },
  googleBtnWrap: { display: 'flex', justifyContent: 'center' },
  loadingText:   { color: '#7a7571', fontSize: 14, fontFamily: 'sans-serif' },
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
