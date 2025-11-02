import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Upload, ArrowLeft, X, AlertCircle, CheckCircle, Users } from 'lucide-react';

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
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [importSummary, setImportSummary] = useState(null);

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
      const droppedFile = e.dataTransfer.files[0];
      setFile(droppedFile);
      parseXLSXDates(droppedFile);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      parseXLSXDates(selectedFile);
    }
  };

  const parseXLSXDates = async (file) => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

      console.log('XLSX parsed rows:', jsonData.length);
      
      if (jsonData.length < 2) {
        toast.info('No data found in XLSX. Please enter dates manually.');
        return;
      }

      // Find the header row and locate "Datum" column
      const headerRow = jsonData[0];
      console.log('Header row:', headerRow);
      
      let datumIndex = -1;
      for (let i = 0; i < headerRow.length; i++) {
        const header = String(headerRow[i] || '').trim().toLowerCase();
        if (header === 'datum') {
          datumIndex = i;
          break;
        }
      }

      console.log('Datum column index:', datumIndex);

      // If we can't find by header, try common positions (3rd or 4th column)
      if (datumIndex === -1) {
        console.log('Datum header not found, trying default positions');
        // Check if first column looks like row numbers (# column)
        const firstDataRow = jsonData[1];
        if (firstDataRow && (firstDataRow[0] === '#' || String(firstDataRow[0]).endsWith('.'))) {
          datumIndex = 3; // After #, Projekt, Stranka
        } else {
          datumIndex = 2; // After Projekt, Stranka
        }
      }

      // Extract dates from all data rows
      const dates = [];
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const dateValue = row[datumIndex];
        
        if (dateValue) {
          let parsedDate;
          
          // Handle Excel date serial number
          if (typeof dateValue === 'number') {
            parsedDate = XLSX.SSF.parse_date_code(dateValue);
            if (parsedDate) {
              const date = new Date(parsedDate.y, parsedDate.m - 1, parsedDate.d);
              if (!isNaN(date.getTime())) {
                dates.push(date);
              }
            }
          } else if (dateValue instanceof Date) {
            dates.push(dateValue);
          } else if (typeof dateValue === 'string') {
            // Try parsing string date formats
            const dateStr = dateValue.trim();
            
            // Try ISO format first
            let date = new Date(dateStr);
            
            // Try DD.MM.YY or DD.MM.YYYY format (common in European locales)
            if (isNaN(date.getTime()) && dateStr.includes('.')) {
              const parts = dateStr.split('.');
              if (parts.length === 3) {
                const day = parseInt(parts[0]);
                const month = parseInt(parts[1]) - 1;
                let year = parseInt(parts[2]);
                
                // Handle 2-digit year: assume 00-99 means 2000-2099
                if (year < 100) {
                  year += 2000;
                }
                
                date = new Date(year, month, day);
              }
            }
            
            // Try DD/MM/YY or DD/MM/YYYY format
            if (isNaN(date.getTime()) && dateStr.includes('/')) {
              const parts = dateStr.split('/');
              if (parts.length === 3) {
                const day = parseInt(parts[0]);
                const month = parseInt(parts[1]) - 1;
                let year = parseInt(parts[2]);
                
                // Handle 2-digit year: assume 00-99 means 2000-2099
                if (year < 100) {
                  year += 2000;
                }
                
                date = new Date(year, month, day);
              }
            }
            
            if (!isNaN(date.getTime())) {
              dates.push(date);
            }
          }
        }
      }

      console.log('Total dates found:', dates.length);

      if (dates.length > 0) {
        // Find earliest and latest dates
        const sortedDates = dates.sort((a, b) => a - b);
        const earliestDate = sortedDates[0];
        const latestDate = sortedDates[sortedDates.length - 1];

        // Format dates to YYYY-MM-DD for input fields
        const formatDate = (date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        setPeriodFrom(formatDate(earliestDate));
        setPeriodTo(formatDate(latestDate));
        setInvoiceDate(formatDate(latestDate));

        toast.success(`Dates auto-populated from XLSX (${dates.length} entries)`);
      } else {
        console.log('No valid dates parsed from XLSX');
        toast.info('No dates found in XLSX. Please enter manually.');
      }
    } catch (error) {
      console.error('Error parsing XLSX:', error);
      toast.error('Could not parse dates from XLSX');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please select a file');
      return;
    }

    setLoading(true);
    
    try {
      // Upload file to backend
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);
      formData.append('invoiceDate', invoiceDate);
      formData.append('periodFrom', periodFrom);
      formData.append('periodTo', periodTo);
      formData.append('dueDate', dueDate);
      formData.append('saveAsProgress', 'true');  // Save as "in progress"
      
      const token = localStorage.getItem('access_token');
      const response = await axios.post(`${BACKEND_URL}/api/imports`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // Store import summary and show modal
      setImportSummary(response.data);
      setShowSummaryModal(true);
      
      toast.success('Import processed successfully!');
      
    } catch (error) {
      console.error('Import error:', error);
      toast.error(error.response?.data?.detail || 'Failed to import file');
      setLoading(false);
    }
  };
  
  const handleProceedToVerification = () => {
    setShowSummaryModal(false);
    setLoading(false);
    
    // Navigate to verification page
    navigate('/import/verify', {
      state: {
        verificationData: {
          batchId: importSummary.batchId,
          resuming: true
        }
      }
    });
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
                Drag and drop your Excel file here
              </p>
              <p className="text-xs text-slate-400 mb-2">Supports .xlsx and .xls formats</p>
              <p className="text-sm text-slate-500 mb-4">or</p>
              <label className="inline-block">
                <input
                  type="file"
                  accept=".xlsx,.xls"
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
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="title">Batch Title</Label>
                <Input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., October 2025"
                  required
                  data-testid="batch-title-input"
                />
                <p className="text-xs text-slate-500">Auto-suggested from period dates</p>
              </div>
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
                <p className="text-xs text-slate-500">Auto-set to latest date from XLSX</p>
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
                <p className="text-xs text-slate-500">Auto-set to earliest date from XLSX</p>
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
                <p className="text-xs text-slate-500">Auto-set to latest date from XLSX</p>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-full py-6 text-lg font-semibold"
            disabled={loading || !file}
            data-testid="import-submit-button"
          >
            {loading ? 'Processing...' : 'Verify Invoices'}
          </Button>
        </form>
      </div>
      
      {/* Import Summary Modal */}
      {showSummaryModal && importSummary && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-8 h-8 text-white" />
                  <h2 className="text-2xl font-bold text-white">Import Summary</h2>
                </div>
              </div>
              <p className="text-blue-100 mt-2">Your XLSX file has been successfully imported!</p>
            </div>
            
            {/* Stats Grid */}
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                  <p className="text-xs text-blue-600 font-semibold uppercase">Total Rows</p>
                  <p className="text-2xl font-bold text-blue-900">{importSummary.summary.totalRows}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                  <p className="text-xs text-green-600 font-semibold uppercase">Total Hours</p>
                  <p className="text-2xl font-bold text-green-900">{importSummary.summary.totalHours}</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                  <p className="text-xs text-purple-600 font-semibold uppercase">Total Value</p>
                  <p className="text-2xl font-bold text-purple-900">€{importSummary.summary.totalValue.toFixed(2)}</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
                  <p className="text-xs text-orange-600 font-semibold uppercase">Employees</p>
                  <p className="text-2xl font-bold text-orange-900">{importSummary.summary.uniqueEmployees}</p>
                </div>
                <div className="bg-teal-50 rounded-xl p-4 border border-teal-200">
                  <p className="text-xs text-teal-600 font-semibold uppercase">Customers</p>
                  <p className="text-2xl font-bold text-teal-900">{importSummary.summary.uniqueCustomers}</p>
                </div>
              </div>
              
              {/* New Customers Alert */}
              {importSummary.newCustomers && importSummary.newCustomers.length > 0 && (
                <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-300 rounded-xl p-6 shadow-lg">
                  <div className="flex items-start gap-4">
                    <div className="bg-orange-500 rounded-full p-3 animate-pulse">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-orange-900 mb-2 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        New Customers Detected!
                      </h3>
                      <p className="text-sm text-orange-700 mb-3">
                        The following <strong>{importSummary.newCustomers.length}</strong> customer(s) were automatically added to your database. 
                        Please configure their settings in the <strong>Customers Settings</strong> page.
                      </p>
                      <div className="bg-white rounded-lg p-4 border border-orange-200 space-y-2 max-h-40 overflow-y-auto">
                        {importSummary.newCustomers.map((customer, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            <span className="w-6 h-6 flex items-center justify-center bg-orange-100 text-orange-700 rounded-full font-bold text-xs">
                              {idx + 1}
                            </span>
                            <span className="font-semibold text-slate-800">{customer.name}</span>
                            <span className="ml-auto px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-semibold">
                              NEW
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center gap-2 text-sm text-orange-800 bg-orange-100 p-3 rounded-lg">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <p className="font-medium">
                          Action Required: Visit <strong>Customers Settings</strong> to configure hourly rates, invoicing types, and other settings for these new customers.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {importSummary.newCustomers && importSummary.newCustomers.length === 0 && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="text-sm text-green-800 font-medium">All customers already exist in the system.</p>
                </div>
              )}
              
              {/* Action Button */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleProceedToVerification}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl py-6 text-lg font-semibold shadow-lg"
                >
                  Proceed to Verification →
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Import;