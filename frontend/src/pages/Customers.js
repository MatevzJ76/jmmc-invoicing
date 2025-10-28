import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Search, Users, Upload } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const Customers = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadingHistory, setUploadingHistory] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');

  useEffect(() => {
    loadCompanies();
    loadCustomers();
  }, []);

  useEffect(() => {
    filterCustomers();
  }, [customers, searchTerm, selectedCompany]);

  const loadCompanies = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/companies`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCompanies(response.data);
    } catch (error) {
      console.error('Failed to load companies:', error);
    }
  };

  const loadCustomers = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/customers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCustomers(response.data);
    } catch (error) {
      toast.error('Failed to load customers');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filterCustomers = () => {
    let filtered = [...customers];

    if (searchTerm) {
      filtered = filtered.filter(customer =>
        customer.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedCompany) {
      filtered = filtered.filter(customer => customer.companyId === selectedCompany);
    }

    setFilteredCustomers(filtered);
  };

  const handleUnitPriceChange = async (customerId, newPrice) => {
    try {
      const token = localStorage.getItem('access_token');
      await axios.put(
        `${BACKEND_URL}/api/customers/${customerId}`,
        { unitPrice: parseFloat(newPrice) },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success('Unit price updated');
      loadCustomers();
    } catch (error) {
      toast.error('Failed to update unit price');
    }
  };

  const handleUploadHistory = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingHistory(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('customer_ids', 'all');

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
      toast.success(
        `${response.data.customersCreated || 0} customers created, ${response.data.customersUpdated} updated with ${response.data.monthlyEntriesCreated} monthly entries`
      );
      loadCustomers();
    } catch (error) {
      toast.error('Failed to upload historical data');
    } finally {
      setUploadingHistory(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <nav className="bg-white/90 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/batches')} className="rounded-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Batches
            </Button>
            <h1 className="text-2xl font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              <Users className="inline w-6 h-6 mr-2" />
              Customers
            </h1>
          </div>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleUploadHistory}
              className="hidden"
              disabled={uploadingHistory}
            />
            <div className="inline-flex items-center justify-center rounded-full text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
              <Upload className="w-4 h-4 mr-2" />
              {uploadingHistory ? 'Uploading...' : 'Upload History'}
            </div>
          </label>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Filters */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200 mb-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="w-64">
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">All Companies</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Customers Table */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-500">Loading...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-500 mb-4">No customers found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Customer Name</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Invoices</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Total Invoiced</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Avg Invoice</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Unit Price (€)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/customers/${customer.id}`)}
                    >
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-800">{customer.name}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {customer.invoiceCount || 0}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        €{(customer.totalInvoiced || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        €{(customer.averageInvoice || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <Input
                          type="number"
                          step="0.01"
                          value={customer.unitPrice || 0}
                          onChange={(e) => handleUnitPriceChange(customer.id, e.target.value)}
                          className="w-24"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Customers;
