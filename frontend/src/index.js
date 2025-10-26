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
      richColors 
      toastOptions={{
        className: 'ai-toast',
        style: {
          fontSize: '15px',
          padding: '18px 20px',
          borderRadius: '16px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          fontWeight: '500',
          border: '2px solid rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(10px)',
        },
        iconTheme: {
          primary: '#ffffff',
          secondary: '#667eea',
        }
      }}
      icons={{
        success: <span style={{ fontSize: '20px' }}>🤖✅</span>,
        error: <span style={{ fontSize: '20px' }}>🤖❌</span>,
        loading: <span style={{ fontSize: '20px' }}>🤖⏳</span>,
        info: <span style={{ fontSize: '20px' }}>🤖💡</span>,
        warning: <span style={{ fontSize: '20px' }}>🤖⚠️</span>,
      }}
    />
    <App />
  </>,
);
