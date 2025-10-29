import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Batches from './pages/Batches';
import BatchDetail from './pages/BatchDetail';
import Import from './pages/Import';
import ImportVerification from './pages/ImportVerification';
import InvoiceDetail from './pages/InvoiceDetail';
import ChangePassword from './pages/ChangePassword';
import Settings from './pages/Settings';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import UserProfile from './pages/UserProfile';
import UserManagement from './pages/UserManagement';

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Navigate to="/batches" replace />} />
          <Route path="/batches" element={<Batches />} />
          <Route path="/batches/:id" element={<BatchDetail />} />
          <Route path="/import" element={<Import />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/profile" element={<UserProfile />} />
          <Route path="/users" element={<UserManagement />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
