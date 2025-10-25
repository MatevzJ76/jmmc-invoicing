import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Upload, ArrowLeft } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const Import = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Auto-suggest title based on period
  useEffect(() => {
    if (periodFrom && periodTo) {
      const date = new Date(periodFrom);
      const month = date.toLocaleString('en-US', { month: 'long' });
      const year = date.getFullYear();
      setTitle(`${month} ${year}`);
    }
  }, [periodFrom, periodTo]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please select a file');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('invoiceDate', invoiceDate);
    formData.append('periodFrom', periodFrom);
    formData.append('periodTo', periodTo);
    formData.append('dueDate', dueDate);

    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(`${BACKEND_URL}/api/imports`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      toast.success(`Imported ${response.data.rowCount} rows`);
      
      // Compose invoices
      const composeResponse = await axios.post(
        `${BACKEND_URL}/api/invoices/compose?batchId=${response.data.batchId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` }}
      );

      toast.success(`Created ${composeResponse.data.invoiceIds.length} invoices`);
      navigate('/batches');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <nav className="bg-white/90 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/batches')} className="rounded-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Import XLSX
          </h1>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div
            className={`bg-white/90 backdrop-blur-sm rounded-2xl p-12 border-2 border-dashed transition-all ${
              dragActive ? 'border-blue-500 bg-blue-50/50' : 'border-slate-300'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            data-testid="file-drop-zone"
          >
            <div className="text-center">
              <Upload className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <p className="text-lg font-semibold text-slate-700 mb-2">
                Drag and drop your XLSX file here
              </p>
              <p className="text-sm text-slate-500 mb-4">or</p>
              <label className="inline-block">
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="file-input"
                />
                <span className="px-4 py-2 bg-white border border-slate-300 rounded-full cursor-pointer hover:bg-slate-50 transition-colors text-sm font-medium">
                  Browse Files
                </span>
              </label>
              {file && (
                <p className="mt-4 text-sm font-medium text-green-600" data-testid="selected-file">
                  Selected: {file.name}
                </p>
              )}
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Invoice Metadata</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invoiceDate">Invoice Date</Label>
                <Input
                  id="invoiceDate"
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  required
                  data-testid="invoice-date-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                  data-testid="due-date-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodFrom">Period From</Label>
                <Input
                  id="periodFrom"
                  type="date"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  required
                  data-testid="period-from-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodTo">Period To</Label>
                <Input
                  id="periodTo"
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  required
                  data-testid="period-to-input"
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-full py-6 text-lg font-semibold"
            disabled={loading || !file}
            data-testid="import-submit-button"
          >
            {loading ? 'Importing...' : 'Import and Create Invoices'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Import;