import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
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
