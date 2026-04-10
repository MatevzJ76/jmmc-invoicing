import axios from 'axios';

const BASE = process.env.REACT_APP_API_URL || '';

const api = axios.create({ baseURL: BASE });

// Attach JWT from localStorage to every request
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Redirect to login on 401 — but not during auth calls themselves
api.interceptors.response.use(
  r => r,
  err => {
    const url = err.config?.url || '';
    const isAuthCall = url.startsWith('/auth/');
    if (err.response?.status === 401 && !isAuthCall) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ─────────────────────────────────────────────────────
export const authGoogle  = (idToken) => api.post('/auth/google', { idToken });
export const authMe      = ()        => api.get('/auth/me');
export const authLogout  = ()        => api.post('/auth/logout');

// ── Invoices ─────────────────────────────────────────────────
export const getInvoices    = (params) => api.get('/api/invoices', { params });
export const getInvoice     = (id)     => api.get(`/api/invoices/${id}`);
export const importInvoices = (body)   => api.post('/api/invoices/import', body);
export const setCategory    = (id, body) => api.put(`/api/invoices/${id}/category`, body);
export const verifyInvoice  = (id, body) => api.put(`/api/invoices/${id}/verify`, body);
export const setPayment     = (id, body) => api.put(`/api/invoices/${id}/payment`, body);
export const getInvoicePDF  = (id, type) => api.get(`/api/invoices/${id}/pdf/${type}`);

// ── Distinta ─────────────────────────────────────────────────
export const getDistinta    = ()     => api.get('/api/distinta');
export const sendDistintaMail = ()   => api.post('/api/distinta/send-email');

// ── Categories ───────────────────────────────────────────────
export const getCategories    = ()         => api.get('/api/categories');
export const createCategory   = (body)     => api.post('/api/categories', body);
export const updateCategory   = (id, body) => api.put(`/api/categories/${id}`, body);
export const deleteCategory   = (id)       => api.delete(`/api/categories/${id}`);

// ── Audit ────────────────────────────────────────────────────
export const getAudit         = (params)   => api.get('/api/audit', { params });
export const getInvoiceAudit  = (invoiceId)=> api.get(`/api/audit/${invoiceId}`);

// ── System Log ───────────────────────────────────────────────
export const getSysLog        = (params)   => api.get('/api/syslog', { params });
export const getSysLogStats   = ()         => api.get('/api/syslog/stats');
export const cleanSysLog      = ()         => api.post('/api/syslog/clean');
export const exportSysLog     = ()         => `${BASE}/api/syslog/export`;

// ── Users ────────────────────────────────────────────────────
export const getUsers         = ()         => api.get('/api/users');
export const createUser       = (body)     => api.post('/api/users', body);
export const updateUser       = (id, body) => api.put(`/api/users/${id}`, body);

// ── Dashboard ────────────────────────────────────────────────
export const getDashboardStats = ()        => api.get('/api/dashboard/stats');

// ── Settings ─────────────────────────────────────────────────
export const getSettings      = ()         => api.get('/api/settings');
export const saveSettings     = (body)     => api.put('/api/settings', body);
export const testERApi        = ()         => api.post('/api/settings/test-er-api');

export default api;
