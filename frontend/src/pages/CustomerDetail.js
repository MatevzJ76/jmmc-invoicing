import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, Upload, TrendingUp, Trash2 } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const CustomerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unitPrice, setUnitPrice] = useState(0);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadCustomer();
  }, [id]);

  const loadCustomer = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/customers/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCustomer(response.data);
      setUnitPrice(response.data.unitPrice || 0);
    } catch (error) {
      toast.error('Failed to load customer');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUnitPrice = async () => {
    try {
      const token = localStorage.getItem('access_token');
      await axios.put(
        `${BACKEND_URL}/api/customers/${id}`,
        { unitPrice: parseFloat(unitPrice) },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success('Unit price updated');
      loadCustomer();
    } catch (error) {
      toast.error('Failed to update unit price');
    }
  };

  const handleUploadHistory = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('customer_ids', id);

    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(
        `${BACKEND_URL}/api/customers/upload-history`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      toast.success(`${response.data.entriesProcessed} historical entries added`);
      loadCustomer();
    } catch (error) {
      toast.error('Failed to upload historical data');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <p className="text-slate-500">Customer not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <nav className="bg-white/90 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/customers')} className="rounded-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Customers
          </Button>
          <h1 className="text-2xl font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {customer.name}
          </h1>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Statistics Cards */}
        <div className="grid md:grid-cols-4 gap-4">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <p className="text-sm text-slate-600 mb-1">Total Invoices</p>
            <p className="text-2xl font-bold text-slate-800">{customer.invoiceCount || 0}</p>
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <p className="text-sm text-slate-600 mb-1">Total Invoiced</p>
            <p className="text-2xl font-bold text-green-600">€{(customer.totalInvoiced || 0).toFixed(2)}</p>
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <p className="text-sm text-slate-600 mb-1">Avg Invoice</p>
            <p className="text-2xl font-bold text-blue-600">€{(customer.averageInvoice || 0).toFixed(2)}</p>
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <p className="text-sm text-slate-600 mb-1">Historical Entries</p>
            <p className="text-2xl font-bold text-purple-600">{customer.historicalInvoices?.length || 0}</p>
          </div>
        </div>

        {/* Unit Price Setting */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Unit Price</h2>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label htmlFor="unitPrice">Default Unit Price (€)</Label>
              <Input
                id="unitPrice"
                type="number"
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button onClick={handleUpdateUnitPrice} className="rounded-full">
              Update Price
            </Button>
          </div>
        </div>

        {/* Upload Historical Data */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Upload Historical Data</h2>
          <p className="text-sm text-slate-600 mb-4">
            Upload XLSX file with columns: Customer Name, Date, Description, Amount
          </p>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleUploadHistory}
              className="hidden"
              disabled={uploading}
            />
            <Button as="span" variant="outline" disabled={uploading} className="rounded-full">
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload File'}
            </Button>
          </label>
        </div>

        {/* Last 12 Invoices */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4">
            <TrendingUp className="inline w-5 h-5 mr-2" />
            Last 12 Invoices
          </h2>
          {customer.lastInvoices && customer.lastInvoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Invoice Date</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Period</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Total</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customer.lastInvoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/invoices/${invoice.id}`)}
                    >
                      <td className="px-4 py-3 text-sm text-slate-800">{invoice.invoiceDate}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {invoice.periodFrom} - {invoice.periodTo}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-800">
                        €{(invoice.total || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          invoice.status === 'posted' ? 'bg-green-100 text-green-700' :
                          invoice.status === 'draft' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {invoice.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-slate-500 py-8">No invoices found</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerDetail;
