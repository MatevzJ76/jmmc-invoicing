import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { LangProvider } from './hooks/useLang';
import Login         from './pages/Login';
import Layout        from './components/Layout';
import Dashboard     from './pages/Dashboard';
import Invoices      from './pages/Invoices';
import Distinta      from './pages/Distinta';
import Categories      from './pages/Categories';
import AuditLog        from './pages/AuditLog';
import SysLog          from './pages/SysLog';
import Users           from './pages/Users';
import Settings        from './pages/Settings';
import SupplierHints   from './pages/SupplierHints';
import Contabilita     from './pages/Contabilita';
import ChartOfAccounts from './pages/ChartOfAccounts';

function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={styles.loading}>Caricamento...</div>;
  if (!user)   return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role))
    return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  // Revisore non ha dashboard: dopo il login va direttamente alle Fatture.
  const homeForUser = user?.role === 'revisore' ? '/invoices' : '/';
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homeForUser} /> : <Login />} />
      <Route path="/" element={
        <PrivateRoute><Layout /></PrivateRoute>
      }>
        <Route index element={
          user?.role === 'revisore'
            ? <Navigate to="/invoices" replace />
            : <Dashboard />
        } />
        <Route path="invoices"   element={<Invoices />} />
        <Route path="distinta"   element={<Distinta />} />
        <Route path="categories" element={
          <PrivateRoute roles={['admin','supervisor']}><Categories /></PrivateRoute>
        } />
        <Route path="audit" element={
          <PrivateRoute roles={['admin','supervisor']}><AuditLog /></PrivateRoute>
        } />
        <Route path="syslog" element={
          <PrivateRoute roles={['admin']}><SysLog /></PrivateRoute>
        } />
        <Route path="users" element={
          <PrivateRoute roles={['admin']}><Users /></PrivateRoute>
        } />
        <Route path="settings" element={
          <PrivateRoute roles={['admin']}><Settings /></PrivateRoute>
        } />
        <Route path="supplier-hints" element={
          <PrivateRoute roles={['admin','supervisor']}><SupplierHints /></PrivateRoute>
        } />
        <Route path="contabilita" element={
          <PrivateRoute roles={['admin']}><Contabilita /></PrivateRoute>
        } />
        <Route path="contabilita/piano-dei-conti" element={
          <PrivateRoute roles={['admin']}><ChartOfAccounts /></PrivateRoute>
        } />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LangProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </LangProvider>
    </AuthProvider>
  );
}

const styles = {
  loading: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100vh', fontFamily: 'sans-serif', color: '#888',
  },
};
