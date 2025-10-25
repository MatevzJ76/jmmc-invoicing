import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Search, Filter, Edit, Save, X } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const BatchDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [batch, setBatch] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedBatch, setEditedBatch] = useState(null);

  useEffect(() => {
    loadBatchAndInvoices();
  }, [id]);

  useEffect(() => {
    filterInvoices();
  }, [invoices, searchTerm, statusFilter]);

  const loadBatchAndInvoices = async () => {
    try {
      const token = localStorage.getItem('access_token');
      
      // Load batch details
      const batchResponse = await axios.get(`${BACKEND_URL}/api/batches/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBatch(batchResponse.data);
      setEditedBatch(batchResponse.data);

      // Load invoices for this batch
      const invoicesResponse = await axios.get(`${BACKEND_URL}/api/batches/${id}/invoices`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInvoices(invoicesResponse.data);
    } catch (error) {
      toast.error('Failed to load batch details');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedBatch(batch);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.put(`${BACKEND_URL}/api/batches/${id}`, editedBatch, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Batch details updated');
      setBatch(editedBatch);
      setIsEditing(false);
      loadBatchAndInvoices(); // Reload to get updated invoices
    } catch (error) {
      toast.error('Failed to update batch');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field, value) => {
    setEditedBatch({...editedBatch, [field]: value});
  };

  const filterInvoices = () => {
    let filtered = [...invoices];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(invoice =>
        invoice.customerName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(invoice => invoice.status === statusFilter);
    }

    setFilteredInvoices(filtered);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <p className="text-slate-600">Batch not found</p>
      </div>
    );
  }

  const totalAmount = filteredInvoices.reduce((sum, inv) => sum + inv.total, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <nav className="bg-white/90 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/batches')} className="rounded-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Batches
            </Button>
            <div>
              {isEditing ? (
                <Input
                  value={editedBatch?.title || ''}
                  onChange={(e) => updateField('title', e.target.value)}
                  className="text-2xl font-bold"
                  placeholder="Batch title"
                  data-testid="batch-title-edit"
                />
              ) : (
                <h1 className="text-2xl font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {batch.title || batch.filename}
                </h1>
              )}
              <p className="text-sm text-slate-500">{batch.filename}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  data-testid="cancel-edit-button"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  size="sm"
                  className="rounded-full bg-blue-600 hover:bg-blue-700"
                  data-testid="save-batch-button"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </>
            ) : (
              <Button
                onClick={handleEdit}
                variant="outline"
                size="sm"
                className="rounded-full"
                data-testid="edit-batch-button"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Batch Summary */}
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <p className="text-sm text-slate-600 mb-1">Period</p>
            <p className="text-lg font-semibold text-slate-800">{batch.periodFrom} - {batch.periodTo}</p>
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <p className="text-sm text-slate-600 mb-1">Invoice Date</p>
            <p className="text-lg font-semibold text-slate-800">{batch.invoiceDate}</p>
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <p className="text-sm text-slate-600 mb-1">Total Invoices</p>
            <p className="text-lg font-semibold text-blue-600">{invoices.length}</p>
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <p className="text-sm text-slate-600 mb-1">Total Amount</p>
            <p className="text-lg font-semibold text-green-600">€{totalAmount.toFixed(2)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-slate-600" />
            <h3 className="text-lg font-semibold text-slate-800">Filters</h3>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="search-customer-input"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="invoice-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Invoices List */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Invoices</h2>
          {filteredInvoices.length === 0 ? (
            <p className="text-center py-12 text-slate-500">No invoices found</p>
          ) : (
            <div className="space-y-2">
              {filteredInvoices.map((invoice) => (
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
                  <div className="text-right flex items-center gap-4">
                    <div>
                      <p className="font-bold text-slate-800">€{invoice.total.toFixed(2)}</p>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        invoice.status === 'posted' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {invoice.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 text-center text-sm text-slate-500">
          Showing {filteredInvoices.length} of {invoices.length} invoices
        </div>
      </div>
    </div>
  );
};

export default BatchDetail;