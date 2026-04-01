import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import axios from "axios";

// ── Auto token refresh interceptor ─────────────────────────────────────────
// When any request returns 401, try to refresh the access token using the
// stored refresh_token. If the refresh succeeds, retry the original request.
// If the refresh token is also expired/invalid, redirect to /login.

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
let isRefreshing = false;
let pendingQueue = []; // { resolve, reject }[]

const processQueue = (error, newToken = null) => {
  pendingQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(newToken)
  );
  pendingQueue = [];
};

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only handle 401s that haven't already been retried,
    // and skip the refresh endpoint itself to avoid loops.
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/refresh")
    ) {
      if (isRefreshing) {
        // Queue this request until the refresh completes
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        }).then((newToken) => {
          originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
          return axios(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) {
        isRefreshing = false;
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
        window.location.href = "/login";
        return Promise.reject(error);
      }

      try {
        const res = await axios.post(
          `${BACKEND_URL}/api/auth/refresh`,
          {},
          { headers: { Authorization: `Bearer ${refreshToken}` } }
        );
        const { access_token, refresh_token } = res.data;
        localStorage.setItem("access_token", access_token);
        localStorage.setItem("refresh_token", refresh_token);

        axios.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;
        originalRequest.headers["Authorization"] = `Bearer ${access_token}`;

        processQueue(null, access_token);
        isRefreshing = false;
        return axios(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        isRefreshing = false;
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
// ───────────────────────────────────────────────────────────────────────────
import { Toaster } from 'sonner';

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <>
    <Toaster 
      position="bottom-left"
      expand={true}
      duration={4000}
      toastOptions={{
        style: {
          fontSize: '15px',
          padding: '16px 20px',
          borderRadius: '16px',
          fontWeight: '500',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          backdropFilter: 'blur(10px)',
          color: 'white',
          minWidth: '300px',
        },
        classNames: {
          toast: 'ai-toast-custom',
          success: 'ai-toast-success',
          error: 'ai-toast-error',
          warning: 'ai-toast-warning',
          info: 'ai-toast-info',
        },
        success: {
          style: {
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            boxShadow: '0 12px 32px rgba(59, 130, 246, 0.4)',
          },
        },
        error: {
          style: {
            background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
            boxShadow: '0 12px 32px rgba(239, 68, 68, 0.4)',
          },
        },
        warning: {
          style: {
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            boxShadow: '0 12px 32px rgba(245, 158, 11, 0.4)',
          },
        },
        info: {
          style: {
            background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
            boxShadow: '0 12px 32px rgba(139, 92, 246, 0.4)',
          },
        },
      }}
    />
    <App />
  </>,
);
