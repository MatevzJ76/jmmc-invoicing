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
      toastOptions={{
        className: 'ai-toast',
        style: {
          fontSize: '15px',
          padding: '16px 20px',
          borderRadius: '16px',
          fontWeight: '500',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          backdropFilter: 'blur(10px)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: '12px', // Space between icon and text
        },
        success: {
          style: {
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', // Blue gradient
            boxShadow: '0 12px 32px rgba(59, 130, 246, 0.4)',
          },
          icon: '🤖✅',
          iconTheme: {
            primary: '#ffffff',
            secondary: '#3b82f6',
          }
        },
        error: {
          style: {
            background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', // Red gradient
            boxShadow: '0 12px 32px rgba(239, 68, 68, 0.4)',
          },
          icon: '🤖❌',
          iconTheme: {
            primary: '#ffffff',
            secondary: '#ef4444',
          }
        },
        warning: {
          style: {
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', // Yellow/Orange gradient
            boxShadow: '0 12px 32px rgba(245, 158, 11, 0.4)',
          },
          icon: '🤖⚠️',
          iconTheme: {
            primary: '#ffffff',
            secondary: '#f59e0b',
          }
        },
        info: {
          style: {
            background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', // Purple gradient
            boxShadow: '0 12px 32px rgba(139, 92, 246, 0.4)',
          },
          icon: '🤖💡',
          iconTheme: {
            primary: '#ffffff',
            secondary: '#8b5cf6',
          }
        },
        loading: {
          style: {
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', // Indigo gradient
            boxShadow: '0 12px 32px rgba(99, 102, 241, 0.4)',
          },
          icon: '🤖⏳',
          iconTheme: {
            primary: '#ffffff',
            secondary: '#6366f1',
          }
        }
      }}
    />
    <App />
  </>,
);
