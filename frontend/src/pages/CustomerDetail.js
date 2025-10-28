import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, Upload, TrendingUp, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const CustomerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unitPrice, setUnitPrice] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [manualEntry, setManualEntry] = useState({
    date: '',
    description: '',
    amount: 0
  });

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
      toast.success(
        `${response.data.customersCreated || 0} customers created, ${response.data.monthlyEntriesCreated} monthly entries added`
      );
      loadCustomer();
    } catch (error) {
      toast.error('Failed to upload historical data');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteHistoricalInvoice = async (invoiceIndex) => {
    if (!window.confirm('Delete this historical invoice entry?')) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      await axios.delete(
        `${BACKEND_URL}/api/customers/${id}/historical/${invoiceIndex}`,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success('Historical invoice deleted');
      loadCustomer();
    } catch (error) {
      toast.error('Failed to delete historical invoice');
    }
  };

  const handleAddManualEntry = async () => {
    if (!manualEntry.date || !manualEntry.amount) {
      toast.error('Please enter date and amount');
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${BACKEND_URL}/api/customers/${id}/add-manual-entry`,
        manualEntry,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success('Manual entry added');
      setShowAddForm(false);
      setManualEntry({ date: '', description: '', amount: 0 });
      loadCustomer();
    } catch (error) {
      toast.error('Failed to add manual entry');
    }
  };

  const toggleRow = (index) => {
    setExpandedRows({
      ...expandedRows,
      [index]: !expandedRows[index]
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    // Remove time portion (T00:00:00)
    return dateStr.split('T')[0];
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
            <div className="inline-flex items-center justify-center rounded-full text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload File'}
            </div>
          </label>
        </div>

        {/* Last 12 Historical Invoices */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">
              <TrendingUp className="inline w-5 h-5 mr-2" />
              Last 12 Historical Invoices
            </h2>
            <Button
              onClick={() => setShowAddForm(!showAddForm)}
              variant="outline"
              size="sm"
              className="rounded-full"
            >
              {showAddForm ? 'Cancel' : '+ Add Row'}
            </Button>
          </div>

          {/* Manual Entry Form */}
          {showAddForm && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Add Manual Entry</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="manual-date" className="text-xs">Date</Label>
                  <Input
                    id="manual-date"
                    type="date"
                    value={manualEntry.date}
                    onChange={(e) => setManualEntry({...manualEntry, date: e.target.value})}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="manual-description" className="text-xs">Description</Label>
                  <Input
                    id="manual-description"
                    type="text"
                    value={manualEntry.description}
                    onChange={(e) => setManualEntry({...manualEntry, description: e.target.value})}
                    placeholder="e.g., Custom service"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="manual-amount" className="text-xs">Amount (€)</Label>
                  <Input
                    id="manual-amount"
                    type="number"
                    step="0.01"
                    value={manualEntry.amount}
                    onChange={(e) => setManualEntry({...manualEntry, amount: parseFloat(e.target.value) || 0})}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  onClick={handleAddManualEntry}
                  size="sm"
                  className="rounded-full"
                >
                  Add Entry
                </Button>
              </div>
            </div>
          )}
          {customer.lastInvoices && customer.lastInvoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Description</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Amount</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customer.lastInvoices.map((invoice, index) => {
                    const isExpanded = expandedRows[index];
                    const hasIndividualRows = invoice.individualRows && invoice.individualRows.length > 0;
                    
                    return (
                      <>
                        <tr
                          key={invoice.id || index}
                          className={`transition-colors ${hasIndividualRows ? 'cursor-pointer hover:bg-blue-50' : 'hover:bg-slate-50'}`}
                          onClick={() => hasIndividualRows && toggleRow(index)}
                        >
                          <td className="px-4 py-3 text-sm text-slate-800">
                            <div className="flex items-center gap-2">
                              {hasIndividualRows && (
                                isExpanded ? <ChevronUp className="w-4 h-4 text-blue-600" /> : <ChevronDown className="w-4 h-4 text-blue-600" />
                              )}
                              {formatDate(invoice.date)}
                              {hasIndividualRows && (
                                <span className="text-xs text-slate-500">({invoice.individualRows.length} rows)</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {invoice.description || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-slate-800">
                            €{(invoice.amount || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const fullIndex = customer.historicalInvoices.findIndex(
                                  h => h.date === invoice.date && h.amount === invoice.amount && h.description === invoice.description
                                );
                                if (fullIndex !== -1) {
                                  handleDeleteHistoricalInvoice(fullIndex);
                                }
                              }}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                        
                        {/* Expanded individual rows */}
                        {isExpanded && hasIndividualRows && (
                          <tr>
                            <td colSpan="4" className="px-4 py-2 bg-blue-50/50">
                              <div className="space-y-1">
                                <p className="text-xs font-semibold text-slate-600 mb-2">Individual Transactions:</p>
                                {invoice.individualRows.map((row, rowIdx) => (
                                  <div key={rowIdx} className="flex items-center justify-between p-2 bg-white rounded border border-slate-200 text-xs">
                                    <span className="text-slate-600 w-32">{formatDate(row.date)}</span>
                                    <span className="text-slate-700 flex-1">{row.description || '-'}</span>
                                    <span className="text-slate-800 font-medium w-24 text-right">€{(row.amount || 0).toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-slate-500 py-8">No historical invoices found. Upload historical data to see invoices here.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerDetail;
