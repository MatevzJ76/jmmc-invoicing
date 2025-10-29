import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';
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
      // Parse XLSX/XLS file to extract raw data for verification
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
      
      // Get header row to find column indices
      const headerRow = jsonData[0] || [];
      console.log('Header row:', headerRow);
      
      // Find column indices (handle optional # column)
      const findColumnIndex = (possibleNames) => {
        for (let i = 0; i < headerRow.length; i++) {
          const header = String(headerRow[i] || '').trim();
          if (possibleNames.some(name => header === name)) {
            return i;
          }
        }
        return -1;
      };
      
      const colIndices = {
        project: findColumnIndex(['Projekt']),
        customer: findColumnIndex(['Stranka']),
        date: findColumnIndex(['Datum']),
        tariff: findColumnIndex(['Tarifa']),
        employee: findColumnIndex(['Delavec']),
        comments: findColumnIndex(['Opombe']),
        hours: findColumnIndex(['Porabljene ure']),
        value: findColumnIndex(['Vrednost']),
        invoiceNumber: findColumnIndex(['Št. računa', 'Št.računa'])
      };
      
      console.log('Column indices:', colIndices);
      
      // Extract rows (skip header row)
      const rows = [];
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (row && row.length > 0) {
          // Map using correct column indices
          rows.push({
            project: colIndices.project >= 0 ? (row[colIndices.project] || '') : '',
            customer: colIndices.customer >= 0 ? (row[colIndices.customer] || '') : '',
            date: colIndices.date >= 0 ? (row[colIndices.date] || '') : '',
            tariff: colIndices.tariff >= 0 ? (row[colIndices.tariff] || '') : '',
            employee: colIndices.employee >= 0 ? (row[colIndices.employee] || '') : '',
            comments: colIndices.comments >= 0 ? (row[colIndices.comments] || '') : '',
            hours: colIndices.hours >= 0 ? (row[colIndices.hours] || 0) : 0,
            value: colIndices.value >= 0 ? (row[colIndices.value] || 0) : 0,
            invoiceNumber: colIndices.invoiceNumber >= 0 ? (row[colIndices.invoiceNumber] || '') : ''
          });
        }
      }
      
      // Read file as binary data for later upload
      const fileData = await file.arrayBuffer();
      
      // Navigate to verification page with data
      navigate('/import/verify', {
        state: {
          verificationData: {
            fileName: file.name,
            fileType: file.type,
            fileData: Array.from(new Uint8Array(fileData)),
            metadata: {
              title,
              invoiceDate,
              periodFrom,
              periodTo,
              dueDate
            },
            rows
          }
        }
      });
    } catch (error) {
      toast.error('Failed to parse file. Please check the format.');
      console.error(error);
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
            {loading ? 'Importing...' : 'Import and Create Invoices'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Import;