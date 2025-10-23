import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Import from './pages/Import';
import InvoiceDetail from './pages/InvoiceDetail';
import ChangePassword from './pages/ChangePassword';

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/import" element={<Import />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />
          <Route path="/change-password" element={<ChangePassword />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
