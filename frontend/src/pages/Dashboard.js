import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload, FileText, LogOut } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      navigate('/login');
      return;
    }
    setUser(JSON.parse(userStr));
    loadInvoices();
  }, [navigate]);

  const loadInvoices = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/invoices`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInvoices(response.data);
    } catch (error) {
      console.error('Failed to load invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <nav className="bg-white/90 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            JMMC Invoicing
          </h1>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/profile')}
              className="text-sm text-slate-600 hover:text-slate-800 hover:underline cursor-pointer transition-colors"
            >
              {user?.email}
            </button>
            <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-full">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-slate-200 hover:shadow-xl transition-all cursor-pointer" onClick={() => navigate('/import')} data-testid="import-card">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-4 bg-blue-100 rounded-full">
                <Upload className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Import XLSX</h2>
                <p className="text-slate-600">Upload time tracking data</p>
              </div>
            </div>
            <p className="text-sm text-slate-500">Upload your XLSX file with time entries to create invoices</p>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-slate-200">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-4 bg-green-100 rounded-full">
                <FileText className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Invoices</h2>
                <p className="text-slate-600">{invoices.length} total</p>
              </div>
            </div>
            <p className="text-sm text-slate-500">Manage and review your invoices</p>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Recent Invoices</h2>
          {loading ? (
            <p className="text-slate-500">Loading...</p>
          ) : invoices.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500 mb-4">No invoices yet</p>
              <Button onClick={() => navigate('/import')} className="rounded-full" data-testid="start-import-button">
                <Upload className="w-4 h-4 mr-2" />
                Import XLSX to Start
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  onClick={() => navigate(`/invoices/${invoice.id}`)}
                  data-testid={`invoice-item-${invoice.id}`}
                >
                  <div>
                    <p className="font-semibold text-slate-800">{invoice.customerName}</p>
                    <p className="text-sm text-slate-600">
                      {invoice.periodFrom} - {invoice.periodTo}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-800">€{invoice.total.toFixed(2)}</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      invoice.status === 'posted' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {invoice.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;