import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle, Clock, Euro, AlertTriangle, Users, Filter, Search, Sparkles, X, Save, Download } from 'lucide-react';

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

const ImportVerification = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [verificationData, setVerificationData] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [tariffFilter, setTariffFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // Filter by row status
  const [rowsPerPage, setRowsPerPage] = useState(100); // Rows per page limit (default: 100)
  const [hoursBreakdownExpanded, setHoursBreakdownExpanded] = useState(false); // Hours by Employee tile collapsed by default
  const [importDetailsExpanded, setImportDetailsExpanded] = useState(false); // Import Details tile collapsed by default
  const [customerAnalyticsExpanded, setCustomerAnalyticsExpanded] = useState(true); // Customer Analytics tile expanded by default
  const [historicalInvoicesExpanded, setHistoricalInvoicesExpanded] = useState(false); // Historical Invoices section collapsed by default
  const [selectedCustomerForAnalytics, setSelectedCustomerForAnalytics] = useState(null); // Current customer in analytics tile
  const [customerSettings, setCustomerSettings] = useState(null); // Customer settings data
  const [historicalInvoices, setHistoricalInvoices] = useState([]); // Historical invoices for selected customer
  const [loadingCustomerData, setLoadingCustomerData] = useState(false); // Loading state for customer data
  const [filteredRows, setFilteredRows] = useState([]);
  
  // Customer dropdown open state
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  
  // AI verification states
  const [aiVerifying, setAiVerifying] = useState(false);
  const [aiResults, setAiResults] = useState({});
  const [showAiModal, setShowAiModal] = useState(false);
  const [selectedRowIndex, setSelectedRowIndex] = useState(null);
  const [verificationProgress, setVerificationProgress] = useState({
    current: 0,
    total: 0,
    percentage: 0,
    elapsed: 0,
    estimated: 0
  });
  const [cancelVerification, setCancelVerification] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiCorrectedRows, setAiCorrectedRows] = useState(new Set()); // Track rows with AI corrections applied
  const [manuallyEditedRows, setManuallyEditedRows] = useState(new Set()); // Track rows with manual edits
  const [originalValues, setOriginalValues] = useState({}); // Store original values before AI correction: { rowIndex: { comments: '', hours: 0, customer: '', customerId: '', tariff: '' } }
  const [editableSuggestions, setEditableSuggestions] = useState({ description: '', hours: null, customerId: '', customer: '', status: 'uninvoiced', tariff: '' }); // Editable AI suggestions
  const [showEditModal, setShowEditModal] = useState(false); // Modal for editing already-corrected rows
  const [editingRowIndex, setEditingRowIndex] = useState(null); // Track which row is being edited
  const [importComplete, setImportComplete] = useState(false); // Track if import is complete
  const [importReport, setImportReport] = useState(null); // Store import results
  const [allCustomers, setAllCustomers] = useState([]); // Store all customers for dropdown
  const [customerSearchTerm, setCustomerSearchTerm] = useState(''); // Search term for customer dropdown
  const [aiProcessing, setAiProcessing] = useState(false); // Track AI processing state
  const [aiProcessResults, setAiProcessResults] = useState({}); // Store AI processing results: { grammar: '', fraud: '', gdpr: '', verification: '', dtm: '' }
  const [expandedAiResults, setExpandedAiResults] = useState(new Set()); // Track which AI result tiles are expanded

  useEffect(() => {
    // Get data from navigation state or sessionStorage
    const data = location.state?.verificationData || JSON.parse(sessionStorage.getItem('importVerificationData') || 'null');
    
    if (!data) {
      toast.error('No import data found');
      navigate('/import');
      return;
    }
    
    // If data only contains batchId and resuming flag (coming from Batch Detail), fetch full data
    if (data.batchId && data.resuming && !data.rows) {
      loadBatchDataForVerification(data.batchId);
      return;
    }
    
    setVerificationData(data);
    
    // Restore AI-corrected rows from data if available
    if (data.aiCorrectedRows) {
      setAiCorrectedRows(new Set(data.aiCorrectedRows));
    }
    
    // Restore manually-edited rows from data if available
    if (data.manuallyEditedRows) {
      setManuallyEditedRows(new Set(data.manuallyEditedRows));
    }
    
    // Restore original values from data if available
    if (data.originalValues) {
      setOriginalValues(data.originalValues);
    }
    
    // Load filter preferences from backend if we have a batchId
    if (data.batchId && data.resuming) {
      loadFilterPreferences(data.batchId);
    }
    
    // Save to sessionStorage in case of page refresh
    if (location.state?.verificationData) {
      sessionStorage.setItem('importVerificationData', JSON.stringify(data));
    }
    
    // Auto-save as "in progress" if this is a fresh import (not resuming)
    if (!data.resuming && data.fileData && data.fileData.length > 0) {
      autoSaveAsInProgress(data);
    }
    
    // Load all customers for dropdown
    loadAllCustomers();
  }, [location, navigate]);
  
  const loadAllCustomers = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/customers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAllCustomers(response.data);
    } catch (error) {
      console.error('Failed to load customers:', error);
      // Don't block UI if customers fail to load
    }
  };
  
  const loadFilterPreferences = async (batchId) => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/batches/${batchId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const batchData = response.data;
      
      // Load filterPreferences object if available
      if (batchData.filterPreferences) {
        const prefs = batchData.filterPreferences;
        if (prefs.searchTerm !== undefined) setSearchTerm(prefs.searchTerm);
        if (prefs.customerFilter !== undefined) setCustomerFilter(prefs.customerFilter);
        if (prefs.employeeFilter !== undefined) setEmployeeFilter(prefs.employeeFilter);
        if (prefs.tariffFilter !== undefined) setTariffFilter(prefs.tariffFilter);
        if (prefs.statusFilter !== undefined) setStatusFilter(prefs.statusFilter);
        if (prefs.rowsPerPage !== undefined) setRowsPerPage(prefs.rowsPerPage);
        if (prefs.hoursBreakdownExpanded !== undefined) setHoursBreakdownExpanded(prefs.hoursBreakdownExpanded);
        if (prefs.importDetailsExpanded !== undefined) setImportDetailsExpanded(prefs.importDetailsExpanded);
        if (prefs.customerAnalyticsExpanded !== undefined) setCustomerAnalyticsExpanded(prefs.customerAnalyticsExpanded);
        if (prefs.historicalInvoicesExpanded !== undefined) setHistoricalInvoicesExpanded(prefs.historicalInvoicesExpanded);
        if (prefs.selectedCustomerForAnalytics !== undefined) {
          setSelectedCustomerForAnalytics(prefs.selectedCustomerForAnalytics);
          // Load customer data after setting the customer
          if (prefs.selectedCustomerForAnalytics) {
            loadCustomerData(prefs.selectedCustomerForAnalytics);
          }
        }
      }
      // Legacy support: load old rowsPerPage field if filterPreferences doesn't exist
      else if (batchData.rowsPerPage !== undefined && batchData.rowsPerPage !== null) {
        setRowsPerPage(batchData.rowsPerPage);
      }
    } catch (error) {
      console.error('Failed to load filter preferences:', error);
      // Don't block - just use defaults
    }
  };
  
  const autoSaveAsInProgress = async (data) => {
    try {
      const token = localStorage.getItem('access_token');
      
      // Create batch with "in progress" status and save time entries
      const uint8Array = new Uint8Array(data.fileData);
      const blob = new Blob([uint8Array], { type: data.fileType });
      const file = new File([blob], data.fileName, { type: data.fileType });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', data.metadata.title);
      formData.append('invoiceDate', data.metadata.invoiceDate);
      formData.append('periodFrom', data.metadata.periodFrom);
      formData.append('periodTo', data.metadata.periodTo);
      formData.append('dueDate', data.metadata.dueDate);
      formData.append('saveAsProgress', 'true');

      const response = await axios.post(`${BACKEND_URL}/api/imports`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      // Update verification data to mark as resuming
      const updatedData = {
        ...data,
        resuming: true,
        batchId: response.data.batchId
      };
      
      setVerificationData(updatedData);
      sessionStorage.setItem('importVerificationData', JSON.stringify(updatedData));
      
      toast.success('Import saved - you can review and edit data', { duration: 3000 });
    } catch (error) {
      console.error('Auto-save failed:', error);
      // Don't block user if auto-save fails
    }
  };
  
  const loadBatchDataForVerification = async (batchId) => {
    try {
      const token = localStorage.getItem('access_token');
      
      // Fetch batch details
      const batchResponse = await axios.get(`${BACKEND_URL}/api/batches/${batchId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const batchData = batchResponse.data;
      
      // Fetch time entries
      const entriesResponse = await axios.get(`${BACKEND_URL}/api/batches/${batchId}/time-entries`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const timeEntries = entriesResponse.data;
      
      console.log('Fetched time entries from backend:', {
        count: timeEntries.length,
        firstEntry: timeEntries[0],
        fieldsInFirstEntry: timeEntries[0] ? Object.keys(timeEntries[0]) : []
      });
      
      // Fetch all customers to resolve customer names from IDs
      const customersResponse = await axios.get(`${BACKEND_URL}/api/customers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const customersMap = {};
      customersResponse.data.forEach(c => {
        customersMap[c.id] = c.name;
      });
      
      console.log('Customers map created:', Object.keys(customersMap).length, 'customers');
      
      // Convert time entries to verification format and track corrections
      const aiCorrectedRowsArray = [];
      const manuallyEditedRowsArray = [];
      const originalValuesObj = {};
      
      const rows = timeEntries.map((entry, index) => {
        // Track AI corrections
        if (entry.aiCorrectionApplied) {
          aiCorrectedRowsArray.push(index);
          if (entry.originalNotes !== undefined || entry.originalHours !== undefined || entry.originalCustomerId !== undefined) {
            originalValuesObj[index] = {
              comments: entry.originalNotes || '',
              hours: entry.originalHours || 0,
              customerId: entry.originalCustomerId || '',
              customer: customersMap[entry.originalCustomerId] || '', // Resolve customer name from ID
              tariff: entry.originalTariff || ''
            };
            console.log(`AI-corrected row ${index} has original values:`, originalValuesObj[index]);
          }
        }
        
        // Track manual edits
        if (entry.manuallyEdited) {
          manuallyEditedRowsArray.push(index);
          if (!originalValuesObj[index] && (entry.originalNotes !== undefined || entry.originalHours !== undefined || entry.originalCustomerId !== undefined)) {
            originalValuesObj[index] = {
              comments: entry.originalNotes || '',
              hours: entry.originalHours || 0,
              customerId: entry.originalCustomerId || '',
              customer: customersMap[entry.originalCustomerId] || '', // Resolve customer name from ID
              tariff: entry.originalTariff || ''
            };
            console.log(`Manually-edited row ${index} has original values:`, originalValuesObj[index]);
          }
        }
        
        return {
          project: entry.projectName || entry.tariff || '',
          customer: entry.customerName || '',
          customerId: entry.customerId || '',
          date: entry.date || '',
          tariff: entry.tariff || '',
          employee: entry.employeeName || '',
          comments: entry.notes || '',
          hours: entry.hours || 0,
          hourlyRate: entry.hourlyRate || 0,  // Add hourlyRate from backend
          value: entry.value || 0,
          invoiceNumber: entry.invoiceNumber || '',
          status: entry.status || 'uninvoiced'  // Row status: uninvoiced, invoiced, internal, free
        };
      });
      
      // Build complete verification data
      const fullData = {
        fileName: batchData.filename,
        fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileData: [],
        metadata: {
          title: batchData.title,
          invoiceDate: batchData.invoiceDate,
          periodFrom: batchData.periodFrom,
          periodTo: batchData.periodTo,
          dueDate: batchData.dueDate
        },
        rows,
        resuming: true,
        batchId: batchId,
        aiCorrectedRows: aiCorrectedRowsArray,
        manuallyEditedRows: manuallyEditedRowsArray,
        originalValues: originalValuesObj
      };
      
      console.log('Loaded batch data:', {
        totalRows: rows.length,
        aiCorrectedCount: aiCorrectedRowsArray.length,
        manuallyEditedCount: manuallyEditedRowsArray.length,
        originalValuesCount: Object.keys(originalValuesObj).length,
        originalValues: originalValuesObj
      });
      
      setVerificationData(fullData);
      setAiCorrectedRows(new Set(aiCorrectedRowsArray));
      setManuallyEditedRows(new Set(manuallyEditedRowsArray));
      setOriginalValues(originalValuesObj);
      
      // Load filter preferences from batch
      if (batchData.filterPreferences) {
        const prefs = batchData.filterPreferences;
        if (prefs.searchTerm !== undefined) setSearchTerm(prefs.searchTerm);
        if (prefs.customerFilter !== undefined) setCustomerFilter(prefs.customerFilter);
        if (prefs.employeeFilter !== undefined) setEmployeeFilter(prefs.employeeFilter);
        if (prefs.tariffFilter !== undefined) setTariffFilter(prefs.tariffFilter);
        if (prefs.statusFilter !== undefined) setStatusFilter(prefs.statusFilter);
        if (prefs.rowsPerPage !== undefined) setRowsPerPage(prefs.rowsPerPage);
        if (prefs.hoursBreakdownExpanded !== undefined) setHoursBreakdownExpanded(prefs.hoursBreakdownExpanded);
        if (prefs.importDetailsExpanded !== undefined) setImportDetailsExpanded(prefs.importDetailsExpanded);
        if (prefs.customerAnalyticsExpanded !== undefined) setCustomerAnalyticsExpanded(prefs.customerAnalyticsExpanded);
        if (prefs.historicalInvoicesExpanded !== undefined) setHistoricalInvoicesExpanded(prefs.historicalInvoicesExpanded);
        if (prefs.selectedCustomerForAnalytics !== undefined) {
          setSelectedCustomerForAnalytics(prefs.selectedCustomerForAnalytics);
          // Load customer data after setting the customer
          if (prefs.selectedCustomerForAnalytics) {
            loadCustomerData(prefs.selectedCustomerForAnalytics);
          }
        }
      }
      // Legacy support: load old rowsPerPage field
      else if (batchData.rowsPerPage !== undefined && batchData.rowsPerPage !== null) {
        setRowsPerPage(batchData.rowsPerPage);
      }
      
      // Save to sessionStorage
      sessionStorage.setItem('importVerificationData', JSON.stringify(fullData));
      
    } catch (error) {
      console.error('Failed to load batch data:', error);
      toast.error('Failed to load batch data');
      navigate('/batches');
    }
  };
  
  // Filter rows based on filters
  useEffect(() => {
    if (!verificationData) return;
    
    // Add original index to each row for stable tracking
    let filtered = verificationData.rows.map((row, index) => ({ ...row, _originalIndex: index }));
    
    // Search filter (searches in customer, employee, and comments)
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(row => 
        (row.customer || '').toLowerCase().includes(term) ||
        (row.employee || '').toLowerCase().includes(term) ||
        (row.comments || '').toLowerCase().includes(term)
      );
    }
    
    // Customer filter
    if (customerFilter !== 'all') {
      filtered = filtered.filter(row => row.customer === customerFilter);
    }
    
    // Employee filter
    if (employeeFilter !== 'all') {
      filtered = filtered.filter(row => row.employee === employeeFilter);
    }
    
    // Tariff filter
    if (tariffFilter !== 'all') {
      filtered = filtered.filter(row => row.tariff === tariffFilter);
    }
    
    // Status filter - filter by specific row status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(row => row.status === statusFilter);
    }
    
    setFilteredRows(filtered);
  }, [verificationData, searchTerm, customerFilter, employeeFilter, tariffFilter, statusFilter]);

  // Save filter preferences whenever they change (debounced)
  useEffect(() => {
    if (!verificationData?.batchId) return;
    
    // Debounce the save to avoid too many API calls
    const timeoutId = setTimeout(async () => {
      try {
        const token = localStorage.getItem('access_token');
        const filterPreferences = {
          searchTerm,
          customerFilter,
          employeeFilter,
          tariffFilter,
          statusFilter,
          rowsPerPage,
          hoursBreakdownExpanded,
          importDetailsExpanded,
          customerAnalyticsExpanded,
          historicalInvoicesExpanded,
          selectedCustomerForAnalytics
        };
        
        await axios.put(
          `${BACKEND_URL}/api/batches/${verificationData.batchId}`,
          { filterPreferences },
          { headers: { Authorization: `Bearer ${token}` }}
        );
      } catch (error) {
        console.error('Failed to save filter preferences:', error);
      }
    }, 500); // Wait 500ms after last change before saving
    
    return () => clearTimeout(timeoutId);
  }, [searchTerm, customerFilter, employeeFilter, tariffFilter, statusFilter, rowsPerPage, hoursBreakdownExpanded, importDetailsExpanded, customerAnalyticsExpanded, historicalInvoicesExpanded, selectedCustomerForAnalytics, verificationData?.batchId]);

  const handleProceedClick = () => {
    // Show confirmation dialog
    setShowConfirmation(true);
  };

  const handleConfirmProceed = () => {
    setShowConfirmation(false);
    handleProceed();
  };

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
  };
  
  const handleAIVerification = async () => {
    setAiVerifying(true);
    setAiResults({});
    setCancelVerification(false);
    
    // Use displayRows (filtered rows) instead of all rows
    const rowsToVerify = displayRows;
    const totalRows = rowsToVerify.length;
    const batchSize = 10;
    const totalBatches = Math.ceil(totalRows / batchSize);
    const startTime = Date.now();
    
    const filterInfo = displayRows.length !== verificationData.rows.length 
      ? ` (${displayRows.length} filtered rows)`
      : '';
    
    toast.info(`AI verification started. Processing ${totalRows} rows${filterInfo}...`);
    
    setVerificationProgress({
      current: 0,
      total: totalRows,
      percentage: 0,
      elapsed: 0,
      estimated: 0
    });
    
    try {
      const token = localStorage.getItem('access_token');
      const allResults = {};
      
      // Process in chunks to show progress
      for (let i = 0; i < totalRows; i += batchSize) {
        // Check if user cancelled
        if (cancelVerification) {
          toast.info(`Verification cancelled. Showing ${Object.keys(allResults).length} issues found in ${i} rows.`);
          break;
        }
        
        const chunk = rowsToVerify.slice(i, i + batchSize);
        const currentBatch = Math.floor(i / batchSize) + 1;
        
        // Update progress
        const elapsed = (Date.now() - startTime) / 1000; // seconds
        const avgTimePerBatch = elapsed / currentBatch;
        const remainingBatches = totalBatches - currentBatch;
        const estimated = avgTimePerBatch * remainingBatches;
        
        setVerificationProgress({
          current: i + chunk.length,
          total: totalRows,
          percentage: ((i + chunk.length) / totalRows) * 100,
          elapsed: Math.floor(elapsed),
          estimated: Math.floor(estimated)
        });
        
        // Call backend with this chunk
        try {
          const response = await axios.post(
            `${BACKEND_URL}/api/imports/verify-preview`,
            chunk,
            {
              headers: { Authorization: `Bearer ${token}` },
              timeout: 60000
            }
          );
          
          // Check if there's an error message from backend (e.g., budget exceeded)
          if (response.data.message && response.data.message.includes('Budget') || response.data.message && response.data.message.includes('error')) {
            toast.error(`AI Error: ${response.data.message}`);
            console.error('Backend AI error:', response.data.message);
          }
          
          // Merge results (adjust indices to match original row indices)
          const chunkResults = response.data.results || {};
          Object.keys(chunkResults).forEach(localIdx => {
            // Find the original index in verificationData.rows
            const chunkRowIndex = parseInt(localIdx);
            const rowData = chunk[chunkRowIndex];
            
            // Find this row in original verificationData.rows
            const originalIndex = verificationData.rows.findIndex(r => 
              r.customer === rowData.customer && 
              r.employee === rowData.employee && 
              r.comments === rowData.comments &&
              r.date === rowData.date
            );
            
            if (originalIndex >= 0) {
              allResults[originalIndex] = chunkResults[localIdx];
            }
          });
          
        } catch (error) {
          console.error(`Batch ${currentBatch} failed:`, error);
          const errorMsg = error.response?.data?.detail || error.message || 'Unknown error';
          toast.error(`Batch ${currentBatch}/${totalBatches} failed: ${errorMsg}`);
        }
      }
      
      setAiResults(allResults);
      
      const flaggedCount = Object.keys(allResults).length;
      
      if (flaggedCount > 0) {
        toast.warning(`AI found ${flaggedCount} entries that need review`);
      } else {
        toast.success(`All ${totalRows} entries look good!`);
      }
    } catch (error) {
      console.error('AI verification error:', error);
      toast.error('AI verification failed. Please try again.');
    } finally {
      setAiVerifying(false);
      setCancelVerification(false);
      setVerificationProgress({
        current: 0,
        total: 0,
        percentage: 0,
        elapsed: 0,
        estimated: 0
      });
    }
  };
  
  const handleCancelVerification = () => {
    setCancelVerification(true);
  };
  
  const handleDownloadOriginalFile = () => {
    try {
      // Recreate file from stored data
      const uint8Array = new Uint8Array(verificationData.fileData);
      const blob = new Blob([uint8Array], { type: verificationData.fileType });
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = verificationData.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success('File downloaded');
    } catch (error) {
      toast.error('Failed to download file');
      console.error(error);
    }
  };
  
  const handleRowClick = (index) => {
    if (aiResults[index]) {
      setSelectedRowIndex(index);
      // Initialize editable suggestions with AI's original suggestions
      const suggestions = aiResults[index].suggestions || {};
      setEditableSuggestions({
        description: suggestions.description || '',
        hours: suggestions.hours !== null && suggestions.hours !== undefined ? suggestions.hours : null
      });
      setShowAiModal(true);
    }
  };
  
  const handleApplySuggestions = () => {
    if (selectedRowIndex === null || !aiResults[selectedRowIndex]) return;
    
    const updatedRows = [...verificationData.rows];
    
    // Save original values before making changes (only if not already saved)
    const newOriginalValues = { ...originalValues };
    if (!newOriginalValues[selectedRowIndex]) {
      newOriginalValues[selectedRowIndex] = {
        comments: updatedRows[selectedRowIndex].comments,
        hours: updatedRows[selectedRowIndex].hours
      };
      setOriginalValues(newOriginalValues);
    }
    
    // Apply description correction if available (use edited value)
    if (editableSuggestions.description && editableSuggestions.description.trim()) {
      updatedRows[selectedRowIndex].comments = editableSuggestions.description.trim();
    }
    
    // Apply hours correction if available (use edited value)
    if (editableSuggestions.hours !== null && editableSuggestions.hours !== undefined) {
      updatedRows[selectedRowIndex].hours = editableSuggestions.hours;
    }
    
    // Mark this row as AI-corrected
    const newAiCorrectedRows = new Set(aiCorrectedRows);
    newAiCorrectedRows.add(selectedRowIndex);
    setAiCorrectedRows(newAiCorrectedRows);
    
    // Update verification data
    const updatedData = {
      ...verificationData,
      rows: updatedRows,
      aiCorrectedRows: Array.from(newAiCorrectedRows),
      originalValues: newOriginalValues
    };
    setVerificationData(updatedData);
    
    // Update sessionStorage
    sessionStorage.setItem('importVerificationData', JSON.stringify(updatedData));
    
    // Mark that changes have been made
    setHasChanges(true);
    
    // Remove this entry from AI results (it's been fixed)
    const newResults = { ...aiResults };
    delete newResults[selectedRowIndex];
    setAiResults(newResults);
    
    toast.success('AI corrections applied - row marked with 🤖');
    setShowAiModal(false);
    setSelectedRowIndex(null);
    setEditableSuggestions({ description: '', hours: null }); // Reset editable suggestions
  };
  
  const handleCorrectedRowClick = (index) => {
    // Open edit modal for already-corrected rows
    setEditingRowIndex(index);
    setEditableSuggestions({
      description: verificationData.rows[index].comments,
      hours: verificationData.rows[index].hours,
      customerId: verificationData.rows[index].customerId || '',
      customer: verificationData.rows[index].customer || '',
      status: verificationData.rows[index].status || 'uninvoiced',
      tariff: verificationData.rows[index].tariff || ''
    });
    setShowEditModal(true);
  };
  
  const handleApplyEdits = () => {
    if (editingRowIndex === null) return;
    
    const updatedRows = [...verificationData.rows];
    
    // Save original values if this is the first edit (and not already AI-corrected)
    const newOriginalValues = { ...originalValues };
    if (!newOriginalValues[editingRowIndex]) {
      newOriginalValues[editingRowIndex] = {
        comments: updatedRows[editingRowIndex].comments,
        hours: updatedRows[editingRowIndex].hours,
        customerId: updatedRows[editingRowIndex].customerId,
        customer: updatedRows[editingRowIndex].customer,
        tariff: updatedRows[editingRowIndex].tariff
      };
      setOriginalValues(newOriginalValues);
    }
    
    // Apply edited values
    if (editableSuggestions.description && editableSuggestions.description.trim()) {
      updatedRows[editingRowIndex].comments = editableSuggestions.description.trim();
    }
    
    if (editableSuggestions.hours !== null && editableSuggestions.hours !== undefined) {
      updatedRows[editingRowIndex].hours = editableSuggestions.hours;
    }
    
    // Apply customer change if provided
    if (editableSuggestions.customerId && editableSuggestions.customerId !== updatedRows[editingRowIndex].customerId) {
      updatedRows[editingRowIndex].customerId = editableSuggestions.customerId;
      updatedRows[editingRowIndex].customer = editableSuggestions.customer;
    }
    
    // Apply tariff change if provided
    if (editableSuggestions.tariff && editableSuggestions.tariff !== updatedRows[editingRowIndex].tariff) {
      updatedRows[editingRowIndex].tariff = editableSuggestions.tariff;
    }
    
    // Apply status change
    if (editableSuggestions.status) {
      updatedRows[editingRowIndex].status = editableSuggestions.status;
    }
    
    // Mark this row as manually edited (add human icon)
    // If it was already AI-corrected, keep it as AI-corrected
    const newManuallyEditedRows = new Set(manuallyEditedRows);
    const newAiCorrectedRows = new Set(aiCorrectedRows);
    
    if (!aiCorrectedRows.has(editingRowIndex)) {
      // First edit is manual, so mark as manual
      newManuallyEditedRows.add(editingRowIndex);
    }
    // If already AI-corrected, don't change the icon
    
    setManuallyEditedRows(newManuallyEditedRows);
    setAiCorrectedRows(newAiCorrectedRows);
    
    // Update verification data
    const updatedData = {
      ...verificationData,
      rows: updatedRows,
      aiCorrectedRows: Array.from(newAiCorrectedRows),
      manuallyEditedRows: Array.from(newManuallyEditedRows),
      originalValues: newOriginalValues
    };
    setVerificationData(updatedData);
    
    // Update sessionStorage
    sessionStorage.setItem('importVerificationData', JSON.stringify(updatedData));
    
    // Mark that changes have been made
    setHasChanges(true);
    
    const iconEmoji = !aiCorrectedRows.has(editingRowIndex) ? '✍️' : '🤖';
    toast.success(`Changes saved - row marked with ${iconEmoji}`);
    setShowEditModal(false);
    setEditingRowIndex(null);
    setEditableSuggestions({ description: '', hours: null, customerId: '', customer: '', status: 'uninvoiced', tariff: '' });
  };

  const handleRunAllAiPrompts = async () => {
    if (editingRowIndex === null) return;
    
    setAiProcessing(true);
    const rowData = verificationData.rows[editingRowIndex];
    const entryId = rowData.id;
    
    try {
      const token = localStorage.getItem('access_token');
      
      // Call the new backend endpoint that runs all 4 prompts consecutively
      // Backend expects array directly, not an object with entry_ids key
      const response = await axios.post(
        `${BACKEND_URL}/api/batches/${verificationData.batchId}/run-ai-prompts`,
        [entryId], // Send array directly
        { headers: { Authorization: `Bearer ${token}` }, timeout: 150000 } // 150s timeout for 4 prompts
      );
      
      if (response.data.success && response.data.results && response.data.results.length > 0) {
        const entryResult = response.data.results[0];
        const suggestions = entryResult.suggestions || {};
        
        // Map the suggestions to the expected format
        const results = {};
        const prompts = ['grammar', 'fraud', 'gdpr', 'verification'];
        let hasErrors = false;
        
        prompts.forEach((promptType) => {
          if (suggestions[promptType]) {
            if (suggestions[promptType].error) {
              const errorMsg = suggestions[promptType].error;
              results[promptType] = `❌ Error: ${errorMsg}`;
              hasErrors = true;
              
              // Show budget error prominently
              if (errorMsg.includes('Budget') || errorMsg.includes('budget')) {
                toast.error('AI Budget Exceeded! Please top up your Emergent LLM balance or use a custom API key in Settings.');
              }
            } else {
              results[promptType] = suggestions[promptType].suggestion || 'No suggestion provided';
            }
          } else {
            results[promptType] = 'No result';
          }
        });
        
        setAiProcessResults(results);
        // Auto-expand all result tiles
        setExpandedAiResults(new Set(prompts));
        
        if (hasErrors) {
          toast.warning('AI processing completed with some errors. Check the results below.');
        } else {
          toast.success('AI processing complete! All 4 prompts executed.');
        }
      } else {
        toast.error('No AI results returned');
      }
      
    } catch (error) {
      console.error('AI processing error:', error);
      
      // Extract error message properly
      let errorMsg = 'Unknown error';
      
      if (error.response?.data) {
        // Check if it's a string or object
        if (typeof error.response.data === 'string') {
          errorMsg = error.response.data;
        } else if (error.response.data.detail) {
          errorMsg = error.response.data.detail;
        } else if (error.response.data.message) {
          errorMsg = error.response.data.message;
        } else {
          // Try to stringify the object
          try {
            errorMsg = JSON.stringify(error.response.data);
          } catch {
            errorMsg = 'Server error occurred';
          }
        }
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      console.error('Extracted error message:', errorMsg);
      
      // Check for budget errors
      if (errorMsg.includes('Budget') || errorMsg.includes('budget') || errorMsg.includes('exceeded')) {
        toast.error('AI Budget Exceeded! Please top up your Emergent LLM balance or use a custom API key in Settings.');
      } else {
        toast.error(`AI processing failed: ${errorMsg}`);
      }
    } finally {
      setAiProcessing(false);
    }
  };

  const handleRun2xDTM = async () => {
    if (editingRowIndex === null) return;
    
    setAiProcessing(true);
    const rowData = verificationData.rows[editingRowIndex];
    const textToAnalyze = rowData.comments || '';
    
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(
        `${BACKEND_URL}/api/ai/suggest`,
        { text: textToAnalyze, feature: 'dtm' },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      setAiProcessResults({ ...aiProcessResults, dtm: response.data.suggestion });
      setExpandedAiResults(new Set([...expandedAiResults, 'dtm']));
      toast.success('2xDTM processing complete!');
      
    } catch (error) {
      toast.error('2xDTM processing failed');
    } finally {
      setAiProcessing(false);
    }
  };

  const handleAcceptAiSuggestion = (suggestionType) => {
    if (!aiProcessResults[suggestionType]) return;
    
    // Apply the AI suggestion to editable fields
    if (suggestionType === 'grammar' || suggestionType === 'dtm') {
      setEditableSuggestions({ ...editableSuggestions, description: aiProcessResults[suggestionType] });
      toast.success(`${suggestionType === 'dtm' ? '2xDTM' : 'Grammar'} suggestion applied`);
    }
  };

  const toggleAiResultExpand = (type) => {
    const newExpanded = new Set(expandedAiResults);
    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }
    setExpandedAiResults(newExpanded);
  };

  const handleSaveProgress = async () => {
    if (!verificationData) return;
    if (!hasChanges) {
      toast.info('No changes to save');
      return;
    }
    
    setSaving(true);
    try {
      const token = localStorage.getItem('access_token');
      
      // If we have a batch, update the time entries
      if (verificationData.batchId) {
        // PERFORMANCE FIX: Only send updates for rows that were actually modified
        // Combine AI-corrected and manually-edited rows to get all modified rows
        const modifiedRowIndices = new Set([...aiCorrectedRows, ...manuallyEditedRows]);
        
        // Only prepare updates for modified rows
        const updates = Array.from(modifiedRowIndices).map(index => ({
          index,
          comments: verificationData.rows[index].comments,
          hours: verificationData.rows[index].hours,
          customerId: verificationData.rows[index].customerId,
          tariff: verificationData.rows[index].tariff,
          status: verificationData.rows[index].status,
          aiCorrectionApplied: aiCorrectedRows.has(index),
          manuallyEdited: manuallyEditedRows.has(index)
        }));
        
        console.log('Saving progress - updates:', updates);
        console.log('Original values being saved:', originalValues);
        
        // Only make API call if there are actually rows to update
        if (updates.length > 0) {
          await axios.put(
            `${BACKEND_URL}/api/batches/${verificationData.batchId}/time-entries`,
            updates,
            { headers: { Authorization: `Bearer ${token}` }}
          );
          
          toast.success(`Changes saved! Updated ${updates.length} row${updates.length > 1 ? 's' : ''}`);
        } else {
          toast.info('No modified rows to save');
        }
        
        setHasChanges(false);
      } else {
        toast.error('No batch found. Data only in memory.');
      }
      
    } catch (error) {
      toast.error('Failed to save changes');
      console.error('Save error:', error);
    } finally {
      setSaving(false);
    }
  };
  
  const handleRowsPerPageChange = (newValue) => {
    // Update state immediately - useEffect will handle saving
    setRowsPerPage(newValue);
  };

  const handleProceed = async () => {
    if (!verificationData) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      
      // Determine which rows to import (filtered or all)
      const rowsToImport = displayRows;
      
      let importResults = {
        rowsImported: 0,
        invoicesCreated: 0,
        batchId: null,
        totalHours: 0,
        totalValue: 0,
        uniqueCustomers: 0
      };
      
      // If we have a batch already (resuming), compose invoices for filtered rows only
      if (verificationData.batchId) {
        toast.info(`Creating invoices from ${rowsToImport.length} selected rows...`);
        
        // Fetch all time entries to get their IDs
        const entriesResponse = await axios.get(
          `${BACKEND_URL}/api/batches/${verificationData.batchId}/time-entries`,
          { headers: { Authorization: `Bearer ${token}` }}
        );
        const allTimeEntries = entriesResponse.data;
        
        // Match displayed rows to time entries and get their IDs
        const selectedEntryIds = [];
        rowsToImport.forEach(row => {
          // Find matching time entry
          const matchingEntry = allTimeEntries.find(entry =>
            entry.customerName === row.customer &&
            entry.employeeName === row.employee &&
            entry.notes === row.comments &&
            entry.date === row.date &&
            entry.hours === parseFloat(row.hours)
          );
          if (matchingEntry) {
            selectedEntryIds.push(matchingEntry.id);
          }
        });
        
        console.log(`Composing invoices for ${selectedEntryIds.length} filtered entries`);
        
        // Compose invoices ONLY for filtered entries
        const composeResponse = await axios.post(
          `${BACKEND_URL}/api/invoices/compose-filtered`,
          {
            batchId: verificationData.batchId,
            entryIds: selectedEntryIds
          },
          { headers: { Authorization: `Bearer ${token}` }}
        );

        importResults = {
          rowsImported: composeResponse.data.entriesProcessed,
          invoicesCreated: composeResponse.data.invoiceIds.length,
          batchId: verificationData.batchId,
          totalHours: rowsToImport.reduce((sum, row) => sum + (parseFloat(row.hours) || 0), 0),
          totalValue: rowsToImport.reduce((sum, row) => sum + (parseFloat(row.value) || 0), 0),
          uniqueCustomers: new Set(rowsToImport.map(r => r.customer)).size
        };
      } else {
        // Should not happen - batch should be created on page load
        toast.error('No batch found. Please try importing again.');
        setLoading(false);
        return;
      }
      
      // Set import complete and show report
      setImportComplete(true);
      setImportReport(importResults);
      
      // Show success message
      toast.success(`✅ Import Complete! Created ${importResults.invoicesCreated} invoices from ${importResults.rowsImported} rows`);
      
      // DON'T clear sessionStorage - keep data accessible
      // Users can still return to Import Verification page to see all rows
      
      // DON'T navigate away - stay on this page
      
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Import failed';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    sessionStorage.removeItem('importVerificationData');
    // Always go to batches (since we auto-save on load)
    navigate('/batches');
  };

  if (!verificationData || !verificationData.rows) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  const totalHours = verificationData.rows.reduce((sum, row) => sum + (parseFloat(row.hours) || 0), 0);
  const totalValue = verificationData.rows.reduce((sum, row) => sum + (parseFloat(row.value) || 0), 0);
  
  // Get unique values for filters
  const uniqueCustomers = [...new Set(verificationData.rows.map(r => r.customer).filter(Boolean))];
  const uniqueEmployees = [...new Set(verificationData.rows.map(r => r.employee).filter(Boolean))];
  const uniqueTariffs = [...new Set(verificationData.rows.map(r => r.tariff).filter(Boolean))];
  
  // Use filtered rows for display
  const allFilteredRows = filteredRows.length > 0 || searchTerm || customerFilter !== 'all' || employeeFilter !== 'all' || tariffFilter !== 'all' || statusFilter !== 'all'
    ? filteredRows 
    : verificationData.rows;
  
  // Apply rowsPerPage limit
  const displayRows = (rowsPerPage === 'all' || rowsPerPage === -1)
    ? allFilteredRows
    : allFilteredRows.slice(0, rowsPerPage);
  
  // Calculate display info
  const totalFiltered = allFilteredRows.length;
  const displayCount = displayRows.length;
  const showingFrom = displayCount > 0 ? 1 : 0;
  const showingTo = displayCount;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <nav className="bg-white/90 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Button 
            variant="outline" 
            onClick={handleBack}
            className="rounded-full border-blue-600 text-blue-600 hover:bg-blue-50 font-medium px-5"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Batches
          </Button>
          
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-md">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Import Verification
            </h1>
          </div>
          
          {verificationData.batchId && (
            <Button 
              variant="outline"
              onClick={() => navigate(`/batches/${verificationData.batchId}`)}
              className="rounded-full border-blue-600 text-blue-600 hover:bg-blue-50 font-medium px-5"
            >
              View Invoices & Verification
              <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
            </Button>
          )}
          
          {!verificationData.batchId && <div className="w-[200px]"></div>}
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Summary Tiles */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-blue-100 rounded-xl">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Porabljene ure</p>
                <p className="text-2xl font-bold text-slate-800">{totalHours.toFixed(2)}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-green-100 rounded-xl">
                <Euro className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Total</p>
                <p className="text-2xl font-bold text-slate-800">€{formatEuro(totalValue)}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-6 shadow-lg border border-purple-600">
            <div className="flex flex-col items-center justify-center h-full">
              <Button
                onClick={handleAIVerification}
                disabled={aiVerifying}
                className="bg-white text-purple-700 hover:bg-purple-50 rounded-full font-semibold px-6 py-3 text-base shadow-md"
              >
                {aiVerifying ? (
                  <>
                    <span className="w-4 h-4 border-2 border-purple-700/30 border-t-purple-700 rounded-full animate-spin mr-2"></span>
                    Verifying...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 mr-2" />
                    AI Verify Data
                  </>
                )}
              </Button>
              {Object.keys(aiResults).length > 0 && (
                <p className="text-white text-xs mt-2 font-medium">
                  {Object.keys(aiResults).length} issues found
                </p>
              )}
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl p-6 shadow-lg border border-blue-600">
            <div className="flex flex-col items-center justify-center h-full">
              <Button
                onClick={handleSaveProgress}
                disabled={!hasChanges || saving}
                className="bg-white text-blue-700 hover:bg-blue-50 rounded-full font-semibold px-6 py-3 text-base shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-blue-700/30 border-t-blue-700 rounded-full animate-spin mr-2"></span>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5 mr-2" />
                    Save Progress
                  </>
                )}
              </Button>
              <p className="text-white text-xs mt-2 opacity-90">
                {hasChanges ? 'Click to save' : 'No changes yet'}
              </p>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-6 shadow-lg border border-green-600">
            <div className="flex flex-col items-center justify-center h-full">
              <Button
                onClick={handleProceedClick}
                disabled={loading}
                className="bg-white text-green-700 hover:bg-green-50 rounded-full font-semibold px-6 py-3 text-base shadow-md"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-green-700/30 border-t-green-700 rounded-full animate-spin mr-2"></span>
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Proceed to Import
                  </>
                )}
              </Button>
              <p className="text-white text-xs mt-2 opacity-90">Create invoices</p>
            </div>
          </div>
        </div>

        {/* Import Metadata */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200 mb-6">
          <button
            onClick={() => setImportDetailsExpanded(!importDetailsExpanded)}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-t-2xl"
          >
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-slate-800">Import Details</h3>
              {importDetailsExpanded && verificationData.fileData && verificationData.fileData.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadOriginalFile();
                  }}
                  className="rounded-full"
                >
                  <Download className="w-3 h-3 mr-1" />
                  Download Original File
                </Button>
              )}
            </div>
            <svg 
              className={`w-5 h-5 text-slate-600 transition-transform ${importDetailsExpanded ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {importDetailsExpanded && (
            <div className="px-6 pb-6">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-slate-600">File:</p>
                  <p className="font-semibold text-slate-800">{verificationData.fileName}</p>
                </div>
                <div>
                  <p className="text-slate-600">Title:</p>
                  <p className="font-semibold text-slate-800">{verificationData.metadata.title}</p>
                </div>
                <div>
                  <p className="text-slate-600">Total Rows:</p>
                  <p className="font-semibold text-slate-800">{verificationData.rows.length}</p>
                </div>
                <div>
                  <p className="text-slate-600">Period:</p>
                  <p className="font-semibold text-slate-800">
                    {verificationData.metadata.periodFrom} - {verificationData.metadata.periodTo}
                  </p>
                </div>
                <div>
                  <p className="text-slate-600">Invoice Date:</p>
                  <p className="font-semibold text-slate-800">{verificationData.metadata.invoiceDate}</p>
                </div>
                <div>
                  <p className="text-slate-600">Due Date:</p>
                  <p className="font-semibold text-slate-800">{verificationData.metadata.dueDate}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Hours by Employee Breakdown */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200 mb-6">
          <button
            onClick={() => setHoursBreakdownExpanded(!hoursBreakdownExpanded)}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-t-2xl"
          >
            <h3 className="text-sm font-semibold text-slate-800">Hours by Employee</h3>
            <svg 
              className={`w-5 h-5 text-slate-600 transition-transform ${hoursBreakdownExpanded ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {hoursBreakdownExpanded && (
            <div className="px-4 pb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {(() => {
                  // Calculate hours per employee ONLY when expanded
                  const hoursByEmployee = {};
                  verificationData.rows.forEach(row => {
                    const employee = row.employee || 'Unknown';
                    const hours = parseFloat(row.hours) || 0;
                    hoursByEmployee[employee] = (hoursByEmployee[employee] || 0) + hours;
                  });
                  
                  // Sort by hours (descending)
                  const sorted = Object.entries(hoursByEmployee).sort((a, b) => b[1] - a[1]);
                  
                  return sorted.map(([employee, hours]) => (
                    <div key={employee} className="bg-slate-50 rounded-lg p-2 border border-slate-200">
                      <p className="text-xs text-slate-600 mb-0.5 truncate">{employee}</p>
                      <p className="text-base font-bold text-blue-600">{hours.toFixed(2)} h</p>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-3 shadow-lg border border-slate-200 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search customer, employee, comments..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Status Filter - All row statuses */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="uninvoiced">Uninvoiced</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="invoiced">Invoiced</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Customer Filter - AUTOCOMPLETE Style (Simple & Reliable) */}
            <div className="relative">
              <div className="relative">
                <Input
                  id="customer-filter-input"
                  placeholder="Filter by customer..."
                  value={customerFilter === 'all' ? '' : customerFilter}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      setCustomerFilter('all');
                      setCustomerDropdownOpen(true); // Keep open when clearing
                    } else {
                      setCustomerFilter(value);
                      setCustomerDropdownOpen(true); // Keep open while typing
                    }
                  }}
                  onFocus={() => setCustomerDropdownOpen(true)}
                  className="w-full"
                />
                {customerFilter !== 'all' && customerFilter !== '' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCustomerFilter('all');
                      setCustomerDropdownOpen(false);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-600 z-10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            
            {/* Customer Suggestions - Rendered via PORTAL at body level */}
            {customerDropdownOpen && createPortal(
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 z-[9998]" 
                  onClick={() => setCustomerDropdownOpen(false)}
                />
                
                {/* Suggestions Panel - ALWAYS SHOWS ALL CUSTOMERS */}
                <div 
                  className="fixed z-[9999] bg-white border-2 border-blue-500 rounded-md shadow-2xl max-h-[350px] overflow-y-auto"
                  style={{
                    width: document.getElementById('customer-filter-input')?.offsetWidth || 300,
                    top: (document.getElementById('customer-filter-input')?.getBoundingClientRect().bottom || 0) + 4,
                    left: document.getElementById('customer-filter-input')?.getBoundingClientRect().left || 0
                  }}
                >
                  <button
                    onClick={() => {
                      setCustomerFilter('all');
                      setCustomerDropdownOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 font-medium border-b sticky top-0 bg-white z-10"
                  >
                    ✓ All Customers (Show all {verificationData.rows.length} rows)
                  </button>
                  
                  {/* ALWAYS show ALL customers - no filtering based on input value */}
                  {uniqueCustomers.map(customer => (
                    <button
                      key={customer}
                      onClick={() => {
                        setCustomerFilter(customer);
                        setCustomerDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                        customerFilter === customer ? 'bg-blue-100 font-medium' : ''
                      }`}
                    >
                      {customer}
                    </button>
                  ))}
                </div>
              </>,
              document.body
            )}
            
            {/* Employee Filter */}
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {uniqueEmployees.map(employee => (
                  <SelectItem key={employee} value={employee}>{employee}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Tariff Filter */}
            <Select value={tariffFilter} onValueChange={setTariffFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Tariffs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tariffs</SelectItem>
                {uniqueTariffs.map(tariff => (
                  <SelectItem key={tariff} value={tariff}>{tariff}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Rows Per Page Selector */}
            <Select 
              value={rowsPerPage === -1 || rowsPerPage === 'all' ? 'all' : rowsPerPage.toString()} 
              onValueChange={(value) => handleRowsPerPageChange(value === 'all' ? 'all' : parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Rows per page" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 rows</SelectItem>
                <SelectItem value="25">25 rows</SelectItem>
                <SelectItem value="50">50 rows</SelectItem>
                <SelectItem value="100">100 rows</SelectItem>
                <SelectItem value="250">250 rows</SelectItem>
                <SelectItem value="500">500 rows</SelectItem>
                <SelectItem value="all">All rows</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Reset Filters Icon Button */}
            <div className="flex items-center justify-center">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  // Close customer dropdown if open
                  setCustomerDropdownOpen(false);
                  
                  // Clear all filter states
                  setSearchTerm('');
                  setCustomerFilter('all');
                  setEmployeeFilter('all');
                  setTariffFilter('all');
                  setStatusFilter('all');
                  
                  // Force table to show all rows by triggering a re-render
                  setFilteredRows([]);
                  
                  toast.success('All filters cleared - showing all rows');
                }}
                className="rounded-full h-10 w-10 bg-red-50 hover:bg-red-100 border-red-300 text-red-600"
                title="Clear All Filters"
                disabled={searchTerm === '' && customerFilter === 'all' && employeeFilter === 'all' && tariffFilter === 'all' && statusFilter === 'all'}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200 overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">#</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">Stranka</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">Datum</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">Tarifa</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">Delavec</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">Opombe</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-700">Porabljene ure</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-700">Value (€)</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-700">Total</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">Št.računa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayRows.length > 0 ? (
                  displayRows.map((row, displayIndex) => {
                    // Use stable original index from row object
                    const originalIndex = row._originalIndex;
                    const isFlagged = aiResults[originalIndex];
                    const isAiCorrected = aiCorrectedRows.has(originalIndex);
                    const isManuallyEdited = manuallyEditedRows.has(originalIndex);
                    const rowStatus = row.status || 'uninvoiced';
                    
                    // Debug tariff highlighting
                    if (displayIndex < 3 && originalValues[originalIndex]) {
                      console.log(`Row ${displayIndex} tariff check:`, {
                        currentTariff: row.tariff,
                        originalTariff: originalValues[originalIndex]?.tariff,
                        hasTariffInOriginal: originalValues[originalIndex].tariff !== undefined,
                        shouldHighlight: originalValues[originalIndex].tariff !== undefined && originalValues[originalIndex].tariff !== row.tariff
                      });
                    }
                    
                    // Determine row background color based on status
                    let rowBgClass = '';
                    let statusIcon = '';
                    let statusTitle = '';
                    
                    if (rowStatus === 'invoiced') {
                      rowBgClass = 'bg-gradient-to-r from-green-100 to-emerald-100 border-l-4 border-green-500 opacity-85';
                      statusIcon = '✓';
                      statusTitle = 'Already invoiced';
                    } else if (rowStatus === 'ready') {
                      rowBgClass = 'bg-gradient-to-r from-emerald-50 to-green-50 border-l-4 border-emerald-400';
                      statusIcon = 'OK';
                      statusTitle = 'Ready - verified and approved';
                    } else if (rowStatus === 'internal') {
                      rowBgClass = 'bg-gradient-to-r from-blue-50 to-cyan-50 border-l-4 border-blue-400';
                      statusIcon = '🏢';
                      statusTitle = 'Internal - not for invoicing';
                    } else if (rowStatus === 'free') {
                      rowBgClass = 'bg-gradient-to-r from-yellow-50 to-amber-50 border-l-4 border-yellow-400';
                      statusIcon = '🎁';
                      statusTitle = 'Free - will not be charged';
                    } else if (isFlagged) {
                      rowBgClass = 'bg-amber-50 hover:bg-amber-100 border-l-4 border-amber-500';
                      statusIcon = '○';
                      statusTitle = 'Not invoiced';
                    } else if (isAiCorrected) {
                      rowBgClass = 'bg-purple-100/60 hover:bg-purple-100';
                      statusIcon = '○';
                      statusTitle = 'Not invoiced';
                    } else if (isManuallyEdited) {
                      rowBgClass = 'bg-blue-100/60 hover:bg-blue-100';
                      statusIcon = '○';
                      statusTitle = 'Not invoiced';
                    } else {
                      rowBgClass = 'hover:bg-blue-50';
                      statusIcon = '○';
                      statusTitle = 'Not invoiced';
                    }
                    
                    return (
                      <tr 
                        key={displayIndex} 
                        className={`transition-colors cursor-pointer ${rowBgClass}`}
                        onClick={() => {
                          // Allow editing all rows (user can change status of invoiced rows back to uninvoiced/internal/free)
                          if (isFlagged) {
                            // Open AI Evaluation modal for flagged rows
                            handleRowClick(originalIndex);
                          } else {
                            // Open Edit modal for all other rows (corrected or not)
                            handleCorrectedRowClick(originalIndex);
                          }
                        }}
                        title={
                          rowStatus === 'invoiced'
                            ? 'Invoiced - click to change status'
                            : rowStatus === 'ready'
                            ? 'Ready - verified and approved'
                            : rowStatus === 'internal'
                            ? 'Internal job - click to edit or change status'
                            : rowStatus === 'free'
                            ? 'Free job - click to edit or change status'
                            : isFlagged 
                            ? 'Click to see AI evaluation and suggestions' 
                            : isAiCorrected
                              ? 'Click to view and edit AI-corrected values'
                            : isManuallyEdited 
                              ? 'Click to view and edit manually-corrected values' 
                              : 'Click to edit this row'
                        }
                      >
                        <td className="px-3 py-2 text-slate-600 align-middle">
                          <div className="flex items-center gap-2">
                            <span>
                              {rowStatus === 'invoiced' && <span className="text-green-600 font-bold text-lg" title={statusTitle}>✓</span>}
                              {rowStatus === 'ready' && (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500 text-white text-[10px] font-bold" title={statusTitle}>
                                  OK
                                </span>
                              )}
                              {rowStatus === 'internal' && <span className="text-blue-600 text-lg" title={statusTitle}>🏢</span>}
                              {rowStatus === 'free' && <span className="text-yellow-600 text-lg" title={statusTitle}>🎁</span>}
                              {rowStatus === 'uninvoiced' && <span className="text-slate-300 text-sm" title={statusTitle}>○</span>}
                            </span>
                            <span className="font-medium">{displayIndex + 1}</span>
                            <span>
                              {isFlagged && <span className="text-amber-600">⚠️</span>}
                              {isAiCorrected && <span className="text-purple-600" title="AI corrections applied">🤖</span>}
                              {isManuallyEdited && !isAiCorrected && <span className="text-blue-600" title="Manually edited">✍️</span>}
                            </span>
                          </div>
                        </td>
                        <td className={`px-3 py-2 font-medium ${
                          originalValues[originalIndex] && 
                          originalValues[originalIndex].customerId && 
                          originalValues[originalIndex].customerId !== row.customerId 
                            ? 'text-blue-600 font-bold' 
                            : 'text-slate-700'
                        }`}>
                          {row.customer || <span className="italic text-slate-400">No Client</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{row.date}</td>
                        <td className={`px-3 py-2 ${
                          originalValues[originalIndex] && 
                          originalValues[originalIndex].tariff && 
                          originalValues[originalIndex].tariff !== '' &&
                          originalValues[originalIndex].tariff !== row.tariff 
                            ? 'text-blue-600 font-bold' 
                            : 'text-slate-600'
                        }`}>
                          {row.tariff}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{row.employee}</td>
                        <td className={`px-3 py-2 max-w-md truncate ${
                          originalValues[originalIndex]?.comments && originalValues[originalIndex]?.comments !== row.comments 
                            ? 'text-blue-600 font-bold' 
                            : 'text-slate-600'
                        }`} title={row.comments}>
                          {row.comments}
                        </td>
                        <td className={`px-3 py-2 text-right font-medium ${
                          originalValues[originalIndex]?.hours !== undefined && originalValues[originalIndex]?.hours !== row.hours 
                            ? 'text-blue-600 font-bold' 
                            : 'text-slate-700'
                        }`}>
                          {row.hours}
                        </td>
                        <td className="px-3 py-2 text-right text-blue-600 font-medium">€{formatEuro(row.hourlyRate || 0)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">€{formatEuro(row.value || 0)}</td>
                        <td className="px-3 py-2 text-slate-600">{row.invoiceNumber || '-'}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="9" className="px-3 py-8 text-center text-slate-500">
                      No rows match the current filters
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                <tr>
                  <td colSpan="6" className="px-3 py-3 text-right text-sm font-bold text-slate-800">
                    Total {displayRows.length > 0 && displayRows.length !== verificationData.rows.length && `(${displayRows.length} rows)`}:
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-blue-700">
                    {displayRows.reduce((sum, row) => sum + (parseFloat(row.hours) || 0), 0).toFixed(2)}
                  </td>
                  <td className="px-3 py-3"></td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-green-700">
                    €{formatEuro(displayRows.reduce((sum, row) => sum + (parseFloat(row.value) || 0), 0))}
                  </td>
                  <td className="px-3 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="lg"
            onClick={handleBack}
            className="rounded-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Import
          </Button>
        </div>
      </div>

      {/* AI Verification Progress Modal */}
      {aiVerifying && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-purple-600 animate-pulse" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">AI Verification in Progress</h3>
              <p className="text-sm text-slate-600">
                Analyzing import data for anomalies...
              </p>
            </div>
            
            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm text-slate-600 mb-2">
                <span>{verificationProgress.current} of {verificationProgress.total} rows</span>
                <span>{verificationProgress.percentage.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-purple-500 to-indigo-600 h-full transition-all duration-500 ease-out"
                  style={{ width: `${verificationProgress.percentage}%` }}
                ></div>
              </div>
            </div>
            
            {/* Time Information */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-600 text-xs mb-1">Elapsed</p>
                <p className="font-semibold text-slate-800">
                  {Math.floor(verificationProgress.elapsed / 60)}:{(verificationProgress.elapsed % 60).toString().padStart(2, '0')}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-600 text-xs mb-1">Remaining</p>
                <p className="font-semibold text-slate-800">
                  ~{Math.floor(verificationProgress.estimated / 60)}:{(verificationProgress.estimated % 60).toString().padStart(2, '0')}
                </p>
              </div>
            </div>
            
            <p className="text-xs text-slate-500 text-center mt-4 mb-4">
              Please wait while AI analyzes your data...
            </p>
            
            {/* Cancel Button */}
            <div className="text-center">
              <Button
                variant="outline"
                onClick={handleCancelVerification}
                disabled={cancelVerification}
                className="rounded-full border-slate-300 hover:bg-slate-100"
              >
                {cancelVerification ? 'Cancelling...' : 'Cancel Verification'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* AI Evaluation Modal */}
      {showAiModal && selectedRowIndex !== null && aiResults[selectedRowIndex] && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-6 h-6" />
                  <h3 className="text-xl font-bold">AI Evaluation</h3>
                </div>
                <button
                  onClick={() => {
                    setShowAiModal(false);
                    setSelectedRowIndex(null);
                    setEditableSuggestions({ description: '', hours: null });
                  }}
                  className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(80vh-200px)]">
              {/* Row Information */}
              <div className="mb-6">
                <h4 className="text-sm font-bold text-slate-800 mb-3">Entry Details</h4>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-2 text-sm">
                  <div><span className="font-semibold">Employee:</span> {verificationData.rows[selectedRowIndex].employee}</div>
                  <div><span className="font-semibold">Customer:</span> {verificationData.rows[selectedRowIndex].customer}</div>
                  <div><span className="font-semibold">Description:</span> {verificationData.rows[selectedRowIndex].comments}</div>
                  <div><span className="font-semibold">Hours:</span> {verificationData.rows[selectedRowIndex].hours}</div>
                </div>
              </div>

              {/* AI Findings */}
              <div className="mb-6">
                <h4 className="text-sm font-bold text-slate-800 mb-3">AI Findings</h4>
                <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                  <p className="text-sm text-amber-900">
                    {aiResults[selectedRowIndex].reason}
                  </p>
                </div>
              </div>

              {/* Suggestions */}
              {aiResults[selectedRowIndex].suggestions && (
                <div className="mb-6">
                  <h4 className="text-sm font-bold text-slate-800 mb-3">AI Suggestions (Editable)</h4>
                  <div className="space-y-3">
                    {aiResults[selectedRowIndex].suggestions.description && (
                      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <p className="text-xs font-semibold text-blue-800 mb-2">Corrected Description:</p>
                        <Textarea
                          value={editableSuggestions.description}
                          onChange={(e) => setEditableSuggestions({ ...editableSuggestions, description: e.target.value })}
                          className="text-sm bg-white border-blue-300 focus:border-blue-500 min-h-[80px]"
                          placeholder="Edit the corrected description..."
                        />
                      </div>
                    )}
                    
                    {aiResults[selectedRowIndex].suggestions.hours !== null && aiResults[selectedRowIndex].suggestions.hours !== undefined && (
                      <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                        <p className="text-xs font-semibold text-green-800 mb-2">Suggested Hours:</p>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={editableSuggestions.hours}
                            onChange={(e) => setEditableSuggestions({ ...editableSuggestions, hours: parseFloat(e.target.value) })}
                            className="text-sm bg-white border-green-300 focus:border-green-500 w-32"
                            placeholder="Hours"
                          />
                          <span className="text-xs text-green-700">
                            (current: {verificationData.rows[selectedRowIndex].hours})
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-6 border-t border-slate-200 bg-slate-50">
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAiModal(false);
                    setSelectedRowIndex(null);
                    setEditableSuggestions({ description: '', hours: null });
                  }}
                  className="flex-1 rounded-full"
                >
                  Dismiss
                </Button>
                {(aiResults[selectedRowIndex].suggestions?.description || aiResults[selectedRowIndex].suggestions?.hours !== null) && (
                  <Button
                    onClick={handleApplySuggestions}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 rounded-full"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Apply Changes
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Confirm Import</h3>
              <p className="text-slate-600">
                {displayRows.length !== verificationData?.rows.length 
                  ? 'You are about to import FILTERED rows only' 
                  : 'You are about to import ALL rows'}
              </p>
            </div>
            
            {/* Statistics Section */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 mb-4 border border-blue-200">
              <h4 className="text-sm font-semibold text-slate-800 mb-3">Import Summary</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white rounded-lg p-3">
                  <p className="text-xs text-slate-600 mb-1">Rows to Import</p>
                  <p className="text-2xl font-bold text-blue-600">{displayRows.length}</p>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <p className="text-xs text-slate-600 mb-1">Total Hours</p>
                  <p className="text-2xl font-bold text-green-600">
                    {displayRows.reduce((sum, row) => sum + (parseFloat(row.hours) || 0), 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <p className="text-xs text-slate-600 mb-1">Total Value</p>
                  <p className="text-2xl font-bold text-emerald-600">
                    €{formatEuro(displayRows.reduce((sum, row) => sum + (parseFloat(row.value) || 0), 0))}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <p className="text-xs text-slate-600 mb-1">Unique Customers</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {new Set(displayRows.map(r => r.customer)).size}
                  </p>
                </div>
              </div>
              
              {/* Filter Info */}
              {displayRows.length !== verificationData?.rows.length && (
                <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-xs font-semibold text-amber-800 mb-1">Active Filters:</p>
                  <div className="text-xs text-amber-700 space-y-1">
                    {customerFilter !== 'all' && <div>• Customer: <span className="font-semibold">{customerFilter}</span></div>}
                    {employeeFilter !== 'all' && <div>• Employee: <span className="font-semibold">{employeeFilter}</span></div>}
                    {tariffFilter !== 'all' && <div>• Tariff: <span className="font-semibold">{tariffFilter}</span></div>}
                    {statusFilter !== 'all' && <div>• Status: <span className="font-semibold">{statusFilter}</span></div>}
                    {searchTerm && <div>• Search: <span className="font-semibold">"{searchTerm}"</span></div>}
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>Important:</strong> Please verify that all data is correct before proceeding. 
                This action will create {displayRows.length} time entries and generate invoices.
              </p>
            </div>
            
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleCancelConfirmation}
                className="flex-1 rounded-full"
              >
                Cancel & Review
              </Button>
              <Button
                onClick={handleConfirmProceed}
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700 rounded-full"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Yes, Proceed
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Corrected Values Modal */}
      {showEditModal && editingRowIndex !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🤖</span>
                  <h3 className="text-xl font-bold">
                    {originalValues[editingRowIndex] ? 'Edit Corrected Values' : 'Edit Row Values'}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingRowIndex(null);
                    setEditableSuggestions({ description: '', hours: null, customerId: '', customer: '', status: 'uninvoiced', tariff: '' });
                    setCustomerSearchTerm(''); // Reset search
                    setAiProcessResults({}); // Clear AI results
                    setExpandedAiResults(new Set()); // Clear expanded state
                  }}
                  className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(80vh-200px)]">
              {(() => {
                // Determine if editing should be disabled based on row status
                const currentRowStatus = verificationData.rows[editingRowIndex]?.status || 'uninvoiced';
                const isInvoiced = currentRowStatus === 'invoiced';
                
                return (
                  <>
                    {/* Warning message if row is invoiced */}
                    {isInvoiced && (
                      <div className="mb-4 bg-green-100 border-l-4 border-green-500 p-4 rounded-lg">
                        <div className="flex items-center">
                          <span className="text-green-600 text-xl mr-2">✓</span>
                          <p className="text-sm font-semibold text-green-800">
                            This entry is already invoiced. Editing is disabled.
                          </p>
                        </div>
                        <p className="text-xs text-green-700 mt-1 ml-7">
                          Change the status to "Uninvoiced", "Internal", or "Free" to enable editing.
                        </p>
                      </div>
                    )}
                    
                    {/* Row Information */}
                    <div className="mb-6">
                      <h4 className="text-sm font-bold text-slate-800 mb-3">Entry Details</h4>
                      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-2 text-sm">
                        <div><span className="font-semibold">Employee:</span> {verificationData.rows[editingRowIndex].employee}</div>
                        <div><span className="font-semibold">Customer:</span> {verificationData.rows[editingRowIndex].customer}</div>
                        <div><span className="font-semibold">Date:</span> {verificationData.rows[editingRowIndex].date}</div>
                        <div>
                          <span className="font-semibold">Status:</span>{' '}
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            currentRowStatus === 'invoiced' ? 'bg-green-100 text-green-800' :
                            currentRowStatus === 'internal' ? 'bg-blue-100 text-blue-800' :
                            currentRowStatus === 'free' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-slate-100 text-slate-800'
                          }`}>
                            {currentRowStatus.charAt(0).toUpperCase() + currentRowStatus.slice(1)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
              

              {/* Original Values (if available) */}
              {originalValues[editingRowIndex] && (
                <div className="mb-6">
                  <h4 className="text-sm font-bold text-slate-800 mb-3">Original Values</h4>
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-2 text-sm">
                    <div>
                      <span className="font-semibold text-slate-600">Original Customer:</span>{' '}
                      <span className="text-slate-800">{originalValues[editingRowIndex].customer || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">Original Tariff:</span>{' '}
                      <span className="text-slate-800">{originalValues[editingRowIndex].tariff || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">Original Description:</span>{' '}
                      <span className="text-slate-800">{originalValues[editingRowIndex].comments || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">Original Hours:</span>{' '}
                      <span className="text-slate-800">{originalValues[editingRowIndex].hours || 0}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Current/Editable Values */}
              <div className="mb-6">
                <h4 className="text-sm font-bold text-slate-800 mb-3">
                  {originalValues[editingRowIndex] ? 'Corrected Values (Editable)' : 'Current Values (Editable)'}
                </h4>
                <div className="space-y-3">
                  <div className={`rounded-lg p-4 border ${
                    (verificationData.rows[editingRowIndex]?.status === 'invoiced') 
                      ? 'bg-slate-100 border-slate-300 opacity-60' 
                      : 'bg-orange-50 border-orange-200'
                  }`}>
                    <p className="text-xs font-semibold text-orange-800 mb-2">Customer:</p>
                    <Select 
                      value={editableSuggestions.customerId} 
                      onValueChange={(value) => {
                        const selectedCustomer = allCustomers.find(c => c.id === value);
                        setEditableSuggestions({ 
                          ...editableSuggestions, 
                          customerId: value,
                          customer: selectedCustomer?.name || ''
                        });
                        setCustomerSearchTerm(''); // Reset search on selection
                      }}
                      disabled={verificationData.rows[editingRowIndex]?.status === 'invoiced'}
                    >
                      <SelectTrigger className="bg-white border-orange-300 focus:border-orange-500 disabled:opacity-50 disabled:cursor-not-allowed">
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {/* Search Input */}
                        <div className="p-2 border-b border-slate-200 sticky top-0 bg-white z-10">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                              type="text"
                              placeholder="Search customers..."
                              value={customerSearchTerm}
                              onChange={(e) => setCustomerSearchTerm(e.target.value)}
                              className="pl-9 h-8 text-sm"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>
                        
                        {/* Filtered Customer List */}
                        {allCustomers
                          .filter(customer => 
                            customer.name.toLowerCase().includes(customerSearchTerm.toLowerCase())
                          )
                          .map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name}
                            </SelectItem>
                          ))}
                        
                        {/* No results message */}
                        {allCustomers.filter(customer => 
                          customer.name.toLowerCase().includes(customerSearchTerm.toLowerCase())
                        ).length === 0 && (
                          <div className="p-3 text-center text-sm text-slate-500">
                            No customers found
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className={`rounded-lg p-4 border ${
                    (verificationData.rows[editingRowIndex]?.status === 'invoiced') 
                      ? 'bg-slate-100 border-slate-300 opacity-60' 
                      : 'bg-purple-50 border-purple-200'
                  }`}>
                    <p className="text-xs font-semibold text-purple-800 mb-2">Tariff:</p>
                    <Select 
                      value={editableSuggestions.tariff} 
                      onValueChange={(value) => {
                        setEditableSuggestions({ 
                          ...editableSuggestions, 
                          tariff: value
                        });
                      }}
                      disabled={verificationData.rows[editingRowIndex]?.status === 'invoiced'}
                    >
                      <SelectTrigger className="bg-white border-purple-300 focus:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed">
                        <SelectValue placeholder="Select tariff" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {uniqueTariffs.map((tariff) => (
                          <SelectItem key={tariff} value={tariff}>
                            {tariff}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className={`rounded-lg p-4 border ${
                    (verificationData.rows[editingRowIndex]?.status === 'invoiced') 
                      ? 'bg-slate-100 border-slate-300 opacity-60' 
                      : 'bg-blue-50 border-blue-200'
                  }`}>
                    <p className="text-xs font-semibold text-blue-800 mb-2">Description:</p>
                    <Textarea
                      value={editableSuggestions.description}
                      onChange={(e) => setEditableSuggestions({ ...editableSuggestions, description: e.target.value })}
                      className="text-sm bg-white border-blue-300 focus:border-blue-500 min-h-[80px] disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="Edit the description..."
                      disabled={verificationData.rows[editingRowIndex]?.status === 'invoiced'}
                    />
                  </div>
                  
                  <div className={`rounded-lg p-4 border ${
                    (verificationData.rows[editingRowIndex]?.status === 'invoiced') 
                      ? 'bg-slate-100 border-slate-300 opacity-60' 
                      : 'bg-green-50 border-green-200'
                  }`}>
                    <p className="text-xs font-semibold text-green-800 mb-2">Hours:</p>
                    <Input
                      type="number"
                      step="0.01"
                      value={editableSuggestions.hours}
                      onChange={(e) => setEditableSuggestions({ ...editableSuggestions, hours: parseFloat(e.target.value) })}
                      className="text-sm bg-white border-green-300 focus:border-green-500 w-32 disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="Hours"
                      disabled={verificationData.rows[editingRowIndex]?.status === 'invoiced'}
                    />
                  </div>
                  
                  {/* AI Processing Section */}
                  <div className={`rounded-lg p-4 border ${
                    (verificationData.rows[editingRowIndex]?.status === 'invoiced') 
                      ? 'bg-slate-100 border-slate-300 opacity-60' 
                      : 'bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200'
                  }`}>
                    <p className="text-xs font-semibold text-purple-800 mb-3">AI Processing:</p>
                    <div className="flex gap-2 mb-4">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleRunAllAiPrompts}
                        disabled={aiProcessing || (verificationData.rows[editingRowIndex]?.status === 'invoiced')}
                        className="flex-1 rounded-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        {aiProcessing ? 'Processing...' : 'Run All AI Prompts'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleRun2xDTM}
                        disabled={aiProcessing || (verificationData.rows[editingRowIndex]?.status === 'invoiced')}
                        className="flex-1 rounded-full bg-pink-600 hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        2xDTM
                      </Button>
                    </div>

                    {/* AI Results */}
                    {Object.keys(aiProcessResults).length > 0 && (
                      <div className="space-y-2">
                        {/* Grammar Result */}
                        {aiProcessResults.grammar && (
                          <div className="border border-green-200 rounded-lg overflow-hidden">
                            <button
                              onClick={() => toggleAiResultExpand('grammar')}
                              className="w-full flex items-center justify-between p-3 bg-green-50 hover:bg-green-100 transition-colors"
                            >
                              <span className="text-sm font-semibold text-green-800">Grammar Correction</span>
                              <svg 
                                className={`w-4 h-4 text-green-700 transition-transform ${expandedAiResults.has('grammar') ? 'rotate-180' : ''}`}
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {expandedAiResults.has('grammar') && (
                              <div className="p-3 bg-white border-t border-green-200">
                                <p className="text-sm text-slate-800 mb-2">{aiProcessResults.grammar}</p>
                                <Button
                                  size="sm"
                                  onClick={() => handleAcceptAiSuggestion('grammar')}
                                  className="rounded-full bg-green-600 hover:bg-green-700"
                                >
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Accept
                                </Button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 2xDTM Result */}
                        {aiProcessResults.dtm && (
                          <div className="border border-pink-200 rounded-lg overflow-hidden">
                            <button
                              onClick={() => toggleAiResultExpand('dtm')}
                              className="w-full flex items-center justify-between p-3 bg-pink-50 hover:bg-pink-100 transition-colors"
                            >
                              <span className="text-sm font-semibold text-pink-800">2xDTM Enhancement</span>
                              <svg 
                                className={`w-4 h-4 text-pink-700 transition-transform ${expandedAiResults.has('dtm') ? 'rotate-180' : ''}`}
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {expandedAiResults.has('dtm') && (
                              <div className="p-3 bg-white border-t border-pink-200">
                                <p className="text-sm text-slate-800 mb-2">{aiProcessResults.dtm}</p>
                                <Button
                                  size="sm"
                                  onClick={() => handleAcceptAiSuggestion('dtm')}
                                  className="rounded-full bg-pink-600 hover:bg-pink-700"
                                >
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Accept
                                </Button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Fraud Result */}
                        {aiProcessResults.fraud && (
                          <div className="border border-red-200 rounded-lg overflow-hidden">
                            <button
                              onClick={() => toggleAiResultExpand('fraud')}
                              className="w-full flex items-center justify-between p-3 bg-red-50 hover:bg-red-100 transition-colors"
                            >
                              <span className="text-sm font-semibold text-red-800">Fraud Detection</span>
                              <svg 
                                className={`w-4 h-4 text-red-700 transition-transform ${expandedAiResults.has('fraud') ? 'rotate-180' : ''}`}
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {expandedAiResults.has('fraud') && (
                              <div className="p-3 bg-white border-t border-red-200">
                                <p className="text-sm text-slate-800">{aiProcessResults.fraud}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* GDPR Result */}
                        {aiProcessResults.gdpr && (
                          <div className="border border-blue-200 rounded-lg overflow-hidden">
                            <button
                              onClick={() => toggleAiResultExpand('gdpr')}
                              className="w-full flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 transition-colors"
                            >
                              <span className="text-sm font-semibold text-blue-800">GDPR Masking</span>
                              <svg 
                                className={`w-4 h-4 text-blue-700 transition-transform ${expandedAiResults.has('gdpr') ? 'rotate-180' : ''}`}
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {expandedAiResults.has('gdpr') && (
                              <div className="p-3 bg-white border-t border-blue-200">
                                <p className="text-sm text-slate-800">{aiProcessResults.gdpr}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Verification Result */}
                        {aiProcessResults.verification && (
                          <div className="border border-amber-200 rounded-lg overflow-hidden">
                            <button
                              onClick={() => toggleAiResultExpand('verification')}
                              className="w-full flex items-center justify-between p-3 bg-amber-50 hover:bg-amber-100 transition-colors"
                            >
                              <span className="text-sm font-semibold text-amber-800">Verification Analysis</span>
                              <svg 
                                className={`w-4 h-4 text-amber-700 transition-transform ${expandedAiResults.has('verification') ? 'rotate-180' : ''}`}
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {expandedAiResults.has('verification') && (
                              <div className="p-3 bg-white border-t border-amber-200">
                                <p className="text-sm text-slate-800">{aiProcessResults.verification}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Row Status Selection */}
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-300">
                    <p className="text-xs font-semibold text-slate-800 mb-3">Row Status:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={editableSuggestions.status === 'uninvoiced' ? 'default' : 'outline'}
                        onClick={() => setEditableSuggestions({ ...editableSuggestions, status: 'uninvoiced' })}
                        disabled={verificationData.rows[editingRowIndex]?.status === 'invoiced'}
                        className={`rounded-full disabled:opacity-50 disabled:cursor-not-allowed ${
                          editableSuggestions.status === 'uninvoiced' 
                            ? 'bg-slate-600 hover:bg-slate-700' 
                            : 'border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span className="mr-1">○</span> Uninvoiced
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={editableSuggestions.status === 'internal' ? 'default' : 'outline'}
                        onClick={() => setEditableSuggestions({ ...editableSuggestions, status: 'internal' })}
                        disabled={verificationData.rows[editingRowIndex]?.status === 'invoiced'}
                        className={`rounded-full disabled:opacity-50 disabled:cursor-not-allowed ${
                          editableSuggestions.status === 'internal' 
                            ? 'bg-blue-600 hover:bg-blue-700' 
                            : 'border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        <span className="mr-1">🏢</span> Internal
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={editableSuggestions.status === 'free' ? 'default' : 'outline'}
                        onClick={() => setEditableSuggestions({ ...editableSuggestions, status: 'free' })}
                        disabled={verificationData.rows[editingRowIndex]?.status === 'invoiced'}
                        className={`rounded-full disabled:opacity-50 disabled:cursor-not-allowed ${
                          editableSuggestions.status === 'free' 
                            ? 'bg-yellow-600 hover:bg-yellow-700' 
                            : 'border-yellow-300 hover:bg-yellow-50'
                        }`}
                      >
                        <span className="mr-1">🎁</span> Free
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={editableSuggestions.status === 'ready' ? 'default' : 'outline'}
                        onClick={() => setEditableSuggestions({ ...editableSuggestions, status: 'ready' })}
                        disabled={verificationData.rows[editingRowIndex]?.status === 'invoiced'}
                        className={`rounded-full disabled:opacity-50 disabled:cursor-not-allowed ${
                          editableSuggestions.status === 'ready' 
                            ? 'bg-green-600 hover:bg-green-700' 
                            : 'border-green-300 hover:bg-green-50'
                        }`}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" /> Ready
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      {verificationData.rows[editingRowIndex]?.status === 'invoiced' 
                        ? 'This entry is already invoiced. Status cannot be changed.'
                        : 'Internal, Free, and Ready rows will not be included in invoices'
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-6 border-t border-slate-200 bg-slate-50">
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingRowIndex(null);
                    setEditableSuggestions({ description: '', hours: null, customerId: '', customer: '', status: 'uninvoiced', tariff: '' });
                    setCustomerSearchTerm(''); // Reset search
                    setAiProcessResults({}); // Clear AI results
                    setExpandedAiResults(new Set()); // Clear expanded state
                  }}
                  className="flex-1 rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleApplyEdits}
                  disabled={verificationData.rows[editingRowIndex]?.status === 'invoiced'}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-full disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Complete Report Modal */}
      {importComplete && importReport && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-2">Import Complete!</h3>
              <p className="text-slate-600">
                Your data has been successfully imported and invoices have been generated.
              </p>
            </div>
            
            {/* Import Statistics */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 mb-4 border border-green-200">
              <h4 className="text-sm font-semibold text-slate-800 mb-3">Import Summary</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white rounded-lg p-3">
                  <p className="text-xs text-slate-600 mb-1">Rows Imported</p>
                  <p className="text-2xl font-bold text-blue-600">{importReport.rowsImported}</p>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <p className="text-xs text-slate-600 mb-1">Invoices Created</p>
                  <p className="text-2xl font-bold text-green-600">{importReport.invoicesCreated}</p>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <p className="text-xs text-slate-600 mb-1">Total Hours</p>
                  <p className="text-xl font-bold text-purple-600">{importReport.totalHours.toFixed(2)}</p>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <p className="text-xs text-slate-600 mb-1">Total Value</p>
                  <p className="text-xl font-bold text-emerald-600">€{formatEuro(importReport.totalValue)}</p>
                </div>
              </div>
              
              <div className="mt-3 p-3 bg-white rounded-lg">
                <p className="text-xs text-slate-600 mb-1">Unique Customers</p>
                <p className="text-xl font-bold text-indigo-600">{importReport.uniqueCustomers}</p>
              </div>
            </div>
            
            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>What's next?</strong> You can now view the generated invoices and verification sections in the Batch Detail page.
              </p>
            </div>
            
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => navigate('/batches')}
                className="flex-1 rounded-full"
              >
                View All Batches
              </Button>
              <Button
                onClick={() => navigate(`/batches/${importReport.batchId}`)}
                className="flex-1 bg-green-600 hover:bg-green-700 rounded-full"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                View Invoices & Verification
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportVerification;
