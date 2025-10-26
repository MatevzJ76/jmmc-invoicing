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
        style: {
          fontSize: '14px',
          padding: '16px',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
        }
      }}
    />
    <App />
  </>,
);
