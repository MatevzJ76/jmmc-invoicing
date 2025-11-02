import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, Search, Users, Upload, ChevronUp, ChevronDown } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// European number formatting: 1.000,00
const formatEuro = (number) => {
  if (number === null || number === undefined) return '0,00';
  
  const num = parseFloat(number);
  if (isNaN(num)) return '0,00';
  
  // Format with 2 decimals
  const fixed = num.toFixed(2);
  const [integer, decimal] = fixed.split('.');
  
  // Add thousands separator (period)
  const withThousands = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  // Combine with comma as decimal separator
  return `${withThousands},${decimal}`;
};

const Customers = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadingHistory, setUploadingHistory] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    companyId: '',
    unitPrice: 0
  });
  const [creating, setCreating] = useState(false);
  const [sortColumn, setSortColumn] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);
  const [showRefreshSecondConfirm, setShowRefreshSecondConfirm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadCompanies();
    loadCustomers();
  }, []);

  useEffect(() => {
    filterCustomers();
  }, [customers, searchTerm, selectedCompany, selectedStatus, sortColumn, sortDirection]);

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

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortCustomers = (customersToSort) => {
    return [...customersToSort].sort((a, b) => {
      let aValue, bValue;
      
      switch (sortColumn) {
        case 'name':
          aValue = (a.name || '').toLowerCase();
          bValue = (b.name || '').toLowerCase();
          break;
        case 'status':
          aValue = (a.status || 'active').toLowerCase();
          bValue = (b.status || 'active').toLowerCase();
          break;
        case 'company':
          aValue = (a.companyName || '').toLowerCase();
          bValue = (b.companyName || '').toLowerCase();
          break;
        case 'unitPrice':
          aValue = a.unitPrice || 0;
          bValue = b.unitPrice || 0;
          break;
        case 'invoices':
          aValue = a.invoiceCount || 0;
          bValue = b.invoiceCount || 0;
          break;
        case 'totalInvoiced':
          aValue = a.totalInvoiced || 0;
          bValue = b.totalInvoiced || 0;
          break;
        case 'avgInvoice':
          aValue = a.averageInvoice || 0;
          bValue = b.averageInvoice || 0;
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const filterCustomers = () => {
    let filtered = [...customers];

    if (searchTerm) {
      filtered = filtered.filter(customer =>
        customer.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedStatus) {
      filtered = filtered.filter(customer => customer.status === selectedStatus);
    }

    if (selectedCompany) {
      filtered = filtered.filter(customer => customer.companyId === selectedCompany);
    }

    // Apply sorting
    filtered = sortCustomers(filtered);

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

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    
    if (!newCustomer.name.trim()) {
      toast.error('Customer name is required');
      return;
    }

    setCreating(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${BACKEND_URL}/api/customers`,
        newCustomer,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      toast.success('Customer created successfully!');
      
      // Reset form and close modal
      setNewCustomer({
        name: '',
        companyId: '',
        unitPrice: 0
      });
      setShowAddCustomer(false);
      loadCustomers();
    } catch (error) {
      if (error.response?.status === 400) {
        toast.error(error.response.data.detail || 'Customer already exists');
      } else {
        toast.error('Failed to create customer');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRefreshInvoicingSettings = async () => {
    setRefreshing(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(
        `${BACKEND_URL}/api/customers/refresh-invoicing-settings`,
        {},
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      toast.success(
        `✓ ${response.data.message}. Updated: ${response.data.updated}, Skipped: ${response.data.skipped}`
      );
      
      setShowRefreshConfirm(false);
      setShowRefreshSecondConfirm(false);
      loadCustomers();
    } catch (error) {
      toast.error('Failed to refresh invoicing settings');
      console.error(error);
    } finally {
      setRefreshing(false);
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
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowRefreshConfirm(true)}
              className="rounded-full border-orange-300 text-orange-700 hover:bg-orange-50"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh All Settings
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={() => setShowAddCustomer(true)}
              className="rounded-full bg-indigo-600 hover:bg-indigo-700"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Customer
            </Button>
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
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Statistics Tiles */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <p className="text-sm text-slate-600 mb-1">Total Customers</p>
            <p className="text-3xl font-bold text-blue-600">
              {filteredCustomers.length}
            </p>
          </div>
          
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <p className="text-sm text-slate-600 mb-1">Total Invoices</p>
            <p className="text-3xl font-bold text-purple-600">
              {filteredCustomers.reduce((sum, c) => sum + (c.invoiceCount || 0), 0)}
            </p>
          </div>
          
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <p className="text-sm text-slate-600 mb-1">Total Invoiced</p>
            <p className="text-3xl font-bold text-green-600">
              €{formatEuro(filteredCustomers.reduce((sum, c) => sum + (c.totalInvoiced || 0), 0))}
            </p>
          </div>
          
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <p className="text-sm text-slate-600 mb-1">Avg Invoice Value</p>
            <p className="text-3xl font-bold text-orange-600">
              €{formatEuro(
                filteredCustomers.length > 0
                  ? filteredCustomers.reduce((sum, c) => sum + (c.averageInvoice || 0), 0) / filteredCustomers.length
                  : 0
              )}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200 mb-6">
          <div className="flex gap-4">
            <div className="w-48">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="new">New</option>
                <option value="inactive">Inactive</option>
              </select>
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
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
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
                    <th 
                      className="px-6 py-4 text-left text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center gap-2">
                        Status
                        {sortColumn === 'status' && (
                          sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-left text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('company')}
                    >
                      <div className="flex items-center gap-2">
                        Company
                        {sortColumn === 'company' && (
                          sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-left text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center gap-2">
                        Customer Name
                        {sortColumn === 'name' && (
                          sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-left text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('invoices')}
                    >
                      <div className="flex items-center gap-2">
                        Invoices
                        {sortColumn === 'invoices' && (
                          sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-left text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('totalInvoiced')}
                    >
                      <div className="flex items-center gap-2">
                        Total Invoiced
                        {sortColumn === 'totalInvoiced' && (
                          sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-left text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('avgInvoice')}
                    >
                      <div className="flex items-center gap-2">
                        Avg Invoice
                        {sortColumn === 'avgInvoice' && (
                          sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-left text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('unitPrice')}
                    >
                      <div className="flex items-center gap-2">
                        Unit Price (€)
                        {sortColumn === 'unitPrice' && (
                          sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </th>
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
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            customer.status === 'active' 
                              ? 'bg-green-100 text-green-800'
                            : customer.status === 'new'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {customer.status === 'active' ? 'Active' : customer.status === 'new' ? 'New' : 'Inactive'}
                          </span>
                          {customer.status === 'new' && (
                            <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {customer.companyName || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-800">{customer.name}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {customer.invoiceCount || 0}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        €{formatEuro(customer.totalInvoiced || 0)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        €{formatEuro(customer.averageInvoice || 0)}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-800">
                        €{formatEuro(customer.unitPrice || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Customer Modal */}
      {showAddCustomer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">Add New Customer</h3>
                <button
                  onClick={() => setShowAddCustomer(false)}
                  className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleCreateCustomer} className="p-6 space-y-4">
              {/* Customer Name */}
              <div className="space-y-2">
                <label htmlFor="new-customer-name" className="text-sm font-semibold text-slate-700">
                  Customer Name *
                </label>
                <Input
                  id="new-customer-name"
                  type="text"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({...newCustomer, name: e.target.value})}
                  placeholder="Enter customer name"
                  required
                  autoFocus
                />
              </div>

              {/* Company */}
              <div className="space-y-2">
                <label htmlFor="new-customer-company" className="text-sm font-semibold text-slate-700">
                  Company (Optional)
                </label>
                <select
                  id="new-customer-company"
                  value={newCustomer.companyId}
                  onChange={(e) => setNewCustomer({...newCustomer, companyId: e.target.value})}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">No Company</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Unit Price */}
              <div className="space-y-2">
                <label htmlFor="new-customer-price" className="text-sm font-semibold text-slate-700">
                  Unit Price (€)
                </label>
                <Input
                  id="new-customer-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newCustomer.unitPrice}
                  onChange={(e) => setNewCustomer({...newCustomer, unitPrice: parseFloat(e.target.value) || 0})}
                  placeholder="0.00"
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddCustomer(false)}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={creating || !newCustomer.name.trim()}
                  className="rounded-full bg-indigo-600 hover:bg-indigo-700"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {creating ? 'Creating...' : 'Create Customer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* First Confirmation Modal - Refresh Invoicing Settings */}
      {showRefreshConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-800 mb-2">
                  Refresh Invoicing Settings?
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                  This will analyze historical invoice data for <strong>ALL customers</strong> and update their invoicing settings based on Article 000001 entries from their latest period.
                </p>
                <p className="text-sm text-orange-700 font-semibold mb-4">
                  ⚠️ WARNING: This will overwrite existing invoicing settings (Invoicing Type, Fixed Forfait Value, Hourly Rate).
                </p>
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowRefreshConfirm(false)}
                    className="rounded-full"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      setShowRefreshConfirm(false);
                      setShowRefreshSecondConfirm(true);
                    }}
                    className="rounded-full bg-orange-600 hover:bg-orange-700"
                  >
                    Continue
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Second Confirmation Modal - Final Warning */}
      {showRefreshSecondConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border-4 border-red-500">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-red-800 mb-2">
                  ⚠️ FINAL CONFIRMATION
                </h3>
                <p className="text-sm text-slate-700 mb-3">
                  Are you absolutely sure you want to proceed?
                </p>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-red-800 font-semibold">
                    This action will:
                  </p>
                  <ul className="text-sm text-red-700 list-disc ml-5 mt-2 space-y-1">
                    <li>Update ALL customers with historical data</li>
                    <li>Overwrite existing invoicing settings</li>
                    <li>Cannot be undone automatically</li>
                  </ul>
                </div>
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowRefreshSecondConfirm(false)}
                    className="rounded-full"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRefreshInvoicingSettings}
                    disabled={refreshing}
                    className="rounded-full bg-red-600 hover:bg-red-700 text-white"
                  >
                    {refreshing ? 'Refreshing...' : 'Yes, Proceed'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
