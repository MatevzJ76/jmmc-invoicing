import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Search, Filter, Edit, Save, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, AlertTriangle, Sparkles, Info, ArrowRightLeft, Settings } from 'lucide-react';

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
  const [allBatches, setAllBatches] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [verificationData, setVerificationData] = useState({
    jmmcHP: [],
    jmmcFinance: [],
    noClient: [],
    extra: []
  });
  const [expandedCategories, setExpandedCategories] = useState({
    jmmcHP: false,
    jmmcFinance: false,
    noClient: false,
    extra: false
  });
  const [aiVerifying, setAiVerifying] = useState(false);
  const [aiResults, setAiResults] = useState({});
  const [showAiWarnings, setShowAiWarnings] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [verificationSummary, setVerificationSummary] = useState(null);
  const [allCustomers, setAllCustomers] = useState([]);
  const [movingEntry, setMovingEntry] = useState(null);
  const [showMoveDropdown, setShowMoveDropdown] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');

  useEffect(() => {
    loadBatchAndInvoices();
    loadAllBatches();
    loadVerificationData();
    loadAllCustomers();
    
    // Load AI results from session storage if available
    const savedResults = sessionStorage.getItem(`aiResults-${id}`);
    if (savedResults) {
      try {
        const parsed = JSON.parse(savedResults);
        setAiResults(parsed);
        setShowAiWarnings(true);
      } catch (e) {
        console.error('Failed to load saved AI results:', e);
      }
    }
  }, [id]);

  useEffect(() => {
    filterInvoices();
  }, [invoices, searchTerm, statusFilter, sortField, sortDirection]);

  useEffect(() => {
    // Find current batch index whenever batches or id changes
    if (allBatches.length > 0) {
      const index = allBatches.findIndex(b => b.id === id);
      setCurrentIndex(index);
    }
  }, [allBatches, id]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showMoveDropdown && !event.target.closest('.relative')) {
        setShowMoveDropdown(null);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showMoveDropdown]);


  // Sort verification data when AI results change
  useEffect(() => {
    if (showAiWarnings && Object.keys(aiResults).length > 0) {
      setVerificationData(prevData => ({
        jmmcHP: sortVerificationData([...prevData.jmmcHP], aiResults),
        jmmcFinance: sortVerificationData([...prevData.jmmcFinance], aiResults),
        noClient: sortVerificationData([...prevData.noClient], aiResults),
        extra: sortVerificationData([...prevData.extra], aiResults)
      }));
    }
  }, [aiResults, showAiWarnings]);



  const loadAllBatches = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/batches`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Sort same way as batches list page
      const sorted = response.data.sort((a, b) => {
        if (a.status === 'archived' && b.status !== 'archived') return 1;
        if (a.status !== 'archived' && b.status === 'archived') return -1;
        return new Date(b.periodTo) - new Date(a.periodTo);
      });
      
      setAllBatches(sorted);
    } catch (error) {
      console.error('Failed to load batches list:', error);
    }
  };

  const loadVerificationData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/batches/${id}/verification`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVerificationData(response.data);
    } catch (error) {
      console.error('Failed to load verification data:', error);
    }
  };

  const loadAllCustomers = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/customers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAllCustomers(response.data);
    } catch (error) {
      console.error('Failed to load customers:', error);
    }
  };

  const handleMoveEntry = async (entryId, newCustomerId) => {
    setMovingEntry(entryId);
    setShowMoveDropdown(null);
    
    try {
      const token = localStorage.getItem('access_token');
      const formData = new FormData();
      formData.append('new_customer_id', newCustomerId);
      
      await axios.post(
        `${BACKEND_URL}/api/time-entries/${entryId}/move-customer`,
        formData,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      toast.success('Entry moved successfully');
      
      // Reload verification data to reflect changes
      await loadVerificationData();
      await loadBatchAndInvoices();
    } catch (error) {
      toast.error('Failed to move entry');
      console.error(error);
    } finally {
      setMovingEntry(null);
    }
  };


  const sortVerificationData = (data, results) => {
    // Sort entries: flagged first (by date desc), then unflagged (by date desc)
    return data.sort((a, b) => {
      const aFlagged = results[a.id]?.flagged === true;
      const bFlagged = results[b.id]?.flagged === true;
      
      // If one is flagged and the other isn't, flagged comes first
      if (aFlagged && !bFlagged) return -1;
      if (!aFlagged && bFlagged) return 1;
      
      // Both flagged or both not flagged - sort by date descending
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB - dateA;
    });
  };



  const toggleCategory = (category) => {
    setExpandedCategories({
      ...expandedCategories,
      [category]: !expandedCategories[category]
    });
  };

  const handleAIVerification = async () => {
    setAiVerifying(true);
    setAiResults({});
    setShowAiWarnings(false);
    setShowResultsModal(false);
    
    toast.info('AI verification started. This may take a minute...');
    
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(
        `${BACKEND_URL}/api/batches/${id}/verify-entries`,
        {},
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 120000 // 2 minute timeout
        }
      );
      
      setAiResults(response.data.results || {});
      setShowAiWarnings(true);
      
      // Save to session storage for persistence
      sessionStorage.setItem(`aiResults-${id}`, JSON.stringify(response.data.results || {}));
      
      const flaggedCount = Object.keys(response.data.results || {}).length;
      const totalChecked = response.data.total_checked || 0;
      
      // Set verification summary for modal
      setVerificationSummary({
        flaggedCount,
        totalChecked,
        passedCount: totalChecked - flaggedCount
      });
      
      // Sort verification data to put flagged entries on top
      const newResults = response.data.results || {};
      setVerificationData(prevData => ({
        jmmcHP: sortVerificationData([...prevData.jmmcHP], newResults),
        jmmcFinance: sortVerificationData([...prevData.jmmcFinance], newResults),
        noClient: sortVerificationData([...prevData.noClient], newResults),
        extra: sortVerificationData([...prevData.extra], newResults)
      }));
      
      // Show modal after completion
      setShowResultsModal(true);
      
    } catch (error) {
      console.error('AI verification error:', error);
      
      if (error.code === 'ECONNABORTED') {
        toast.error('AI verification timed out. Please try again or check fewer entries.');
      } else if (error.response?.status === 401) {
        toast.error('Session expired. Please log in again.');
        setTimeout(() => navigate('/login'), 2000);
      } else {
        toast.error('AI verification failed: ' + (error.response?.data?.message || error.message));
      }
    } finally {
      setAiVerifying(false);
    }
  };

  const isEntryFlagged = (entryId) => {
    return aiResults[entryId]?.flagged === true;
  };

  const getFlagReason = (entryId) => {
    return aiResults[entryId]?.reason || '';
  };

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

  const goToPreviousBatch = () => {
    if (currentIndex > 0) {
      const prevBatch = allBatches[currentIndex - 1];
      navigate(`/batches/${prevBatch.id}`);
    }
  };

  const goToNextBatch = () => {
    if (currentIndex < allBatches.length - 1) {
      const nextBatch = allBatches[currentIndex + 1];
      navigate(`/batches/${nextBatch.id}`);
    }
  };

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < allBatches.length - 1;

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

    // Sorting
    if (sortField) {
      filtered.sort((a, b) => {
        let aVal, bVal;
        
        if (sortField === 'customerName') {
          aVal = a.customerName.toLowerCase();
          bVal = b.customerName.toLowerCase();
        } else if (sortField === 'amount') {
          aVal = a.total || 0;
          bVal = b.total || 0;
        }
        
        if (sortDirection === 'asc') {
          return aVal > bVal ? 1 : -1;
        } else {
          return aVal < bVal ? 1 : -1;
        }
      });
    }

    setFilteredInvoices(filtered);
  };

  const handleSort = (field) => {
    if (sortField === field) {
      // Toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, default to ascending
      setSortField(field);
      setSortDirection('asc');
    }
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
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <Button 
                onClick={() => navigate('/batches')} 
                className="rounded-full bg-gradient-to-r from-slate-700 to-slate-900 hover:from-slate-800 hover:to-black text-white shadow-md hover:shadow-lg transition-all duration-200 font-medium px-5"
                size="sm"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Batches
              </Button>
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
                <>
                  <Button
                    onClick={() => navigate('/customers')}
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                  >
                    Customers
                  </Button>
                  <Button
                    onClick={() => navigate('/settings')}
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    data-testid="settings-button"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </Button>
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
                </>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Previous/Next Navigation */}
              <div className="flex items-center gap-1 mr-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToPreviousBatch}
                  disabled={!hasPrevious}
                  className="rounded-full"
                  data-testid="previous-batch-button"
                  title="Previous batch"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs text-slate-500 px-2">
                  {currentIndex + 1} of {allBatches.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToNextBatch}
                  disabled={!hasNext}
                  className="rounded-full"
                  data-testid="next-batch-button"
                  title="Next batch"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              
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
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Batch Summary */}
        <div className="grid md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <Label className="text-sm text-slate-600 mb-2 block">Period From</Label>
            {isEditing ? (
              <Input
                type="date"
                value={editedBatch?.periodFrom || ''}
                onChange={(e) => updateField('periodFrom', e.target.value)}
                data-testid="period-from-edit"
              />
            ) : (
              <p className="text-lg font-semibold text-slate-800">{batch.periodFrom}</p>
            )}
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <Label className="text-sm text-slate-600 mb-2 block">Period To</Label>
            {isEditing ? (
              <Input
                type="date"
                value={editedBatch?.periodTo || ''}
                onChange={(e) => updateField('periodTo', e.target.value)}
                data-testid="period-to-edit"
              />
            ) : (
              <p className="text-lg font-semibold text-slate-800">{batch.periodTo}</p>
            )}
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <Label className="text-sm text-slate-600 mb-2 block">Invoice Date</Label>
            {isEditing ? (
              <Input
                type="date"
                value={editedBatch?.invoiceDate || ''}
                onChange={(e) => updateField('invoiceDate', e.target.value)}
                data-testid="invoice-date-edit"
              />
            ) : (
              <p className="text-lg font-semibold text-slate-800">{batch.invoiceDate}</p>
            )}
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <Label className="text-sm text-slate-600 mb-2 block">Due Date</Label>
            {isEditing ? (
              <Input
                type="date"
                value={editedBatch?.dueDate || ''}
                onChange={(e) => updateField('dueDate', e.target.value)}
                data-testid="due-date-edit"
              />
            ) : (
              <p className="text-lg font-semibold text-slate-800">{batch.dueDate}</p>
            )}
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <Label className="text-sm text-slate-600 mb-2 block">Status</Label>
            {isEditing ? (
              <Select 
                value={editedBatch?.status || 'imported'} 
                onValueChange={(value) => updateField('status', value)}
              >
                <SelectTrigger data-testid="status-edit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="imported">Imported</SelectItem>
                  <SelectItem value="composed">Composed</SelectItem>
                  <SelectItem value="posted">Posted</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
                batch.status === 'archived' ? 'bg-gray-100 text-gray-700' :
                batch.status === 'posted' ? 'bg-green-100 text-green-700' :
                batch.status === 'composed' ? 'bg-blue-100 text-blue-700' :
                'bg-yellow-100 text-yellow-700'
              }`}>
                {batch.status}
              </span>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
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
                <SelectItem value="imported">Imported</SelectItem>
                <SelectItem value="edited">Edited</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="issued">Issued</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
                <SelectItem value="deleted">Deleted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Verification Tile */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <h3 className="text-lg font-semibold text-slate-800">Verification</h3>
              <span className="text-xs text-slate-500 ml-2">
                ({verificationData.jmmcHP.length + verificationData.jmmcFinance.length + verificationData.noClient.length + verificationData.extra.length} items need review)
              </span>
            </div>
            <Button
              onClick={handleAIVerification}
              disabled={aiVerifying}
              variant="outline"
              size="sm"
              className="rounded-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {aiVerifying ? 'Checking...' : 'AI Check'}
            </Button>
          </div>

          {/* JMMC HP d.o.o. */}
          <div className="mb-4">
            <button
              onClick={() => toggleCategory('jmmcHP')}
              className="w-full flex items-center justify-between p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              data-testid="jmmc-hp-category"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                  {verificationData.jmmcHP.length}
                </div>
                <div className="text-left">
                  <p className="font-semibold text-slate-800">JMMC HP d.o.o.</p>
                  <p className="text-xs text-slate-600">{verificationData.jmmcHP.length} entries</p>
                </div>
              </div>
              {expandedCategories.jmmcHP ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
            
            {expandedCategories.jmmcHP && (
              <div className="mt-2 space-y-2 pl-4">
                {verificationData.jmmcHP.map((entry, idx) => {
                  const isFlagged = isEntryFlagged(entry.id);
                  const flagReason = getFlagReason(entry.id);
                  
                  return (
                    <div 
                      key={idx} 
                      className={`p-3 border rounded-lg ${
                        isFlagged && showAiWarnings
                          ? 'bg-red-50 border-red-300' 
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="grid grid-cols-5 gap-2 text-sm">
                        <div>
                          <span className="text-xs text-slate-500">Date:</span>
                          <p className="font-medium">{entry.date}</p>
                        </div>
                        <div>
                          <span className="text-xs text-slate-500">Employee:</span>
                          <p className="font-medium">{entry.employeeName}</p>
                        </div>
                        <div>
                          <span className="text-xs text-slate-500">Hours:</span>
                          <p className="font-medium">{Number(entry.hours).toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="text-xs text-slate-500">Value:</span>
                            <p className="font-medium">€{entry.value.toFixed(2)}</p>
                          </div>
                          {isFlagged && showAiWarnings && (
                            <div className="relative group">
                              <Info className="w-4 h-4 text-red-600 cursor-help" />
                              <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                                <div className="font-semibold mb-1">⚠️ AI Warning</div>
                                <p>{flagReason}</p>
                                <div className="absolute -bottom-1 right-4 w-2 h-2 bg-slate-900 transform rotate-45"></div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-end relative">
                          <button
                            onClick={() => setShowMoveDropdown(showMoveDropdown === entry.id ? null : entry.id)}
                            disabled={movingEntry === entry.id}
                            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                            title="Move to different customer"
                          >
                            <ArrowRightLeft className="w-4 h-4 text-slate-600" />
                          </button>
                          
                          {showMoveDropdown === entry.id && (
                            <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-20">
                              <div className="p-3 border-b border-slate-200 bg-slate-50">
                                <p className="text-xs font-semibold text-slate-700 mb-2">Move to Customer:</p>
                                <Input
                                  type="text"
                                  placeholder="Search customers..."
                                  value={customerSearch}
                                  onChange={(e) => setCustomerSearch(e.target.value)}
                                  className="text-sm h-8"
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                {allCustomers
                                  .filter(customer => 
                                    customer.name.toLowerCase().includes(customerSearch.toLowerCase())
                                  )
                                  .map(customer => (
                                    <button
                                      key={customer.id}
                                      onClick={() => {
                                        handleMoveEntry(entry.id, customer.id);
                                        setCustomerSearch('');
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                                    >
                                      {customer.name}
                                    </button>
                                  ))}
                                {allCustomers.filter(customer => 
                                  customer.name.toLowerCase().includes(customerSearch.toLowerCase())
                                ).length === 0 && (
                                  <div className="px-3 py-4 text-center text-sm text-slate-500">
                                    No customers found
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      {entry.notes && (
                        <p className="text-xs text-slate-600 mt-2">{entry.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* JMMC Finance d.o.o. */}
          <div className="mb-4">
            <button
              onClick={() => toggleCategory('jmmcFinance')}
              className="w-full flex items-center justify-between p-4 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
              data-testid="jmmc-finance-category"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-semibold">
                  {verificationData.jmmcFinance.length}
                </div>
                <div className="text-left">
                  <p className="font-semibold text-slate-800">JMMC Finance d.o.o.</p>
                  <p className="text-xs text-slate-600">{verificationData.jmmcFinance.length} entries</p>
                </div>
              </div>
              {expandedCategories.jmmcFinance ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
            
            {expandedCategories.jmmcFinance && (
              <div className="mt-2 space-y-2 pl-4">
                {verificationData.jmmcFinance.map((entry, idx) => {
                  const isFlagged = isEntryFlagged(entry.id);
                  const flagReason = getFlagReason(entry.id);
                  
                  return (
                    <div 
                      key={idx} 
                      className={`p-3 border rounded-lg ${
                        isFlagged && showAiWarnings
                          ? 'bg-red-50 border-red-300' 
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="grid grid-cols-5 gap-2 text-sm">
                        <div>
                          <span className="text-xs text-slate-500">Date:</span>
                          <p className="font-medium">{entry.date}</p>
                        </div>
                        <div>
                          <span className="text-xs text-slate-500">Employee:</span>
                          <p className="font-medium">{entry.employeeName}</p>
                        </div>
                        <div>
                          <span className="text-xs text-slate-500">Hours:</span>
                          <p className="font-medium">{Number(entry.hours).toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="text-xs text-slate-500">Value:</span>
                            <p className="font-medium">€{entry.value.toFixed(2)}</p>
                          </div>
                          {isFlagged && showAiWarnings && (
                            <div className="relative group">
                              <Info className="w-4 h-4 text-red-600 cursor-help" />
                              <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                                <div className="font-semibold mb-1">⚠️ AI Warning</div>
                                <p>{flagReason}</p>
                                <div className="absolute -bottom-1 right-4 w-2 h-2 bg-slate-900 transform rotate-45"></div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-end relative">
                          <button
                            onClick={() => setShowMoveDropdown(showMoveDropdown === entry.id ? null : entry.id)}
                            disabled={movingEntry === entry.id}
                            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                            title="Move to different customer"
                          >
                            <ArrowRightLeft className="w-4 h-4 text-slate-600" />
                          </button>
                          
                          {showMoveDropdown === entry.id && (
                            <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-20">
                              <div className="p-3 border-b border-slate-200 bg-slate-50">
                                <p className="text-xs font-semibold text-slate-700 mb-2">Move to Customer:</p>
                                <Input
                                  type="text"
                                  placeholder="Search customers..."
                                  value={customerSearch}
                                  onChange={(e) => setCustomerSearch(e.target.value)}
                                  className="text-sm h-8"
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                {allCustomers
                                  .filter(customer => 
                                    customer.name.toLowerCase().includes(customerSearch.toLowerCase())
                                  )
                                  .map(customer => (
                                    <button
                                      key={customer.id}
                                      onClick={() => {
                                        handleMoveEntry(entry.id, customer.id);
                                        setCustomerSearch('');
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                                    >
                                      {customer.name}
                                    </button>
                                  ))}
                                {allCustomers.filter(customer => 
                                  customer.name.toLowerCase().includes(customerSearch.toLowerCase())
                                ).length === 0 && (
                                  <div className="px-3 py-4 text-center text-sm text-slate-500">
                                    No customers found
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      {entry.notes && (
                        <p className="text-xs text-slate-600 mt-2">{entry.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* No Client */}
          <div>
            <button
              onClick={() => toggleCategory('noClient')}
              className="w-full flex items-center justify-between p-4 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors"
              data-testid="no-client-category"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center text-white font-semibold">
                  {verificationData.noClient.length}
                </div>
                <div className="text-left">
                  <p className="font-semibold text-slate-800">No Client Specified</p>
                  <p className="text-xs text-slate-600">{verificationData.noClient.length} entries without client</p>
                </div>
              </div>
              {expandedCategories.noClient ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
            
            {expandedCategories.noClient && (
              <div className="mt-2 space-y-2 pl-4">
                {verificationData.noClient.map((entry, idx) => {
                  const isFlagged = isEntryFlagged(entry.id);
                  const flagReason = getFlagReason(entry.id);
                  
                  return (
                    <div 
                      key={idx} 
                      className={`p-3 border rounded-lg ${
                        isFlagged && showAiWarnings
                          ? 'bg-red-50 border-red-300' 
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="grid grid-cols-5 gap-2 text-sm">
                        <div>
                          <span className="text-xs text-slate-500">Date:</span>
                          <p className="font-medium">{entry.date}</p>
                        </div>
                        <div>
                          <span className="text-xs text-slate-500">Employee:</span>
                          <p className="font-medium">{entry.employeeName}</p>
                        </div>
                        <div>
                          <span className="text-xs text-slate-500">Hours:</span>
                          <p className="font-medium">{Number(entry.hours).toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="text-xs text-slate-500">Value:</span>
                            <p className="font-medium">€{entry.value.toFixed(2)}</p>
                          </div>
                          {isFlagged && showAiWarnings && (
                            <div className="relative group">
                              <Info className="w-4 h-4 text-red-600 cursor-help" />
                              <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                                <div className="font-semibold mb-1">⚠️ AI Warning</div>
                                <p>{flagReason}</p>
                                <div className="absolute -bottom-1 right-4 w-2 h-2 bg-slate-900 transform rotate-45"></div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-end relative">
                          <button
                            onClick={() => setShowMoveDropdown(showMoveDropdown === entry.id ? null : entry.id)}
                            disabled={movingEntry === entry.id}
                            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                            title="Move to different customer"
                          >
                            <ArrowRightLeft className="w-4 h-4 text-slate-600" />
                          </button>
                          
                          {showMoveDropdown === entry.id && (
                            <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-20">
                              <div className="p-3 border-b border-slate-200 bg-slate-50">
                                <p className="text-xs font-semibold text-slate-700 mb-2">Move to Customer:</p>
                                <Input
                                  type="text"
                                  placeholder="Search customers..."
                                  value={customerSearch}
                                  onChange={(e) => setCustomerSearch(e.target.value)}
                                  className="text-sm h-8"
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                {allCustomers
                                  .filter(customer => 
                                    customer.name.toLowerCase().includes(customerSearch.toLowerCase())
                                  )
                                  .map(customer => (
                                    <button
                                      key={customer.id}
                                      onClick={() => {
                                        handleMoveEntry(entry.id, customer.id);
                                        setCustomerSearch('');
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                                    >
                                      {customer.name}
                                    </button>
                                  ))}
                                {allCustomers.filter(customer => 
                                  customer.name.toLowerCase().includes(customerSearch.toLowerCase())
                                ).length === 0 && (
                                  <div className="px-3 py-4 text-center text-sm text-slate-500">
                                    No customers found
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      {entry.notes && (
                        <p className="text-xs text-slate-600 mt-2">{entry.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* EXTRA */}
          <div>
            <button
              onClick={() => toggleCategory('extra')}
              className="w-full flex items-center justify-between p-4 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
              data-testid="extra-category"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                  {verificationData.extra.length}
                </div>
                <div className="text-left">
                  <p className="font-semibold text-slate-800">EXTRA</p>
                  <p className="text-xs text-slate-600">{verificationData.extra.length} entries from 999 - EXTRA project</p>
                </div>
              </div>
              {expandedCategories.extra ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
            
            {expandedCategories.extra && (
              <div className="mt-2 space-y-2 pl-4">
                {verificationData.extra.map((entry, idx) => {
                  const isFlagged = isEntryFlagged(entry.id);
                  const flagReason = getFlagReason(entry.id);
                  
                  return (
                    <div 
                      key={idx} 
                      className={`p-3 border rounded-lg ${
                        isFlagged && showAiWarnings
                          ? 'bg-red-50 border-red-300' 
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="grid grid-cols-5 gap-2 text-sm">
                        <div>
                          <span className="text-xs text-slate-500">Date:</span>
                          <p className="font-medium">{entry.date}</p>
                        </div>
                        <div>
                          <span className="text-xs text-slate-500">Employee:</span>
                          <p className="font-medium">{entry.employeeName}</p>
                        </div>
                        <div>
                          <span className="text-xs text-slate-500">Hours:</span>
                          <p className="font-medium">{Number(entry.hours).toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="text-xs text-slate-500">Value:</span>
                            <p className="font-medium">€{entry.value.toFixed(2)}</p>
                          </div>
                          {isFlagged && showAiWarnings && (
                            <div className="relative group">
                              <Info className="w-4 h-4 text-red-600 cursor-help" />
                              <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                                <div className="font-semibold mb-1">⚠️ AI Warning</div>
                                <p>{flagReason}</p>
                                <div className="absolute -bottom-1 right-4 w-2 h-2 bg-slate-900 transform rotate-45"></div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-end relative">
                          <button
                            onClick={() => setShowMoveDropdown(showMoveDropdown === entry.id ? null : entry.id)}
                            disabled={movingEntry === entry.id}
                            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                            title="Move to different customer"
                          >
                            <ArrowRightLeft className="w-4 h-4 text-slate-600" />
                          </button>
                          
                          {showMoveDropdown === entry.id && (
                            <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-20">
                              <div className="p-3 border-b border-slate-200 bg-slate-50">
                                <p className="text-xs font-semibold text-slate-700 mb-2">Move to Customer:</p>
                                <Input
                                  type="text"
                                  placeholder="Search customers..."
                                  value={customerSearch}
                                  onChange={(e) => setCustomerSearch(e.target.value)}
                                  className="text-sm h-8"
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                {allCustomers
                                  .filter(customer => 
                                    customer.name.toLowerCase().includes(customerSearch.toLowerCase())
                                  )
                                  .map(customer => (
                                    <button
                                      key={customer.id}
                                      onClick={() => {
                                        handleMoveEntry(entry.id, customer.id);
                                        setCustomerSearch('');
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                                    >
                                      {customer.name}
                                    </button>
                                  ))}
                                {allCustomers.filter(customer => 
                                  customer.name.toLowerCase().includes(customerSearch.toLowerCase())
                                ).length === 0 && (
                                  <div className="px-3 py-4 text-center text-sm text-slate-500">
                                    No customers found
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      {entry.notes && (
                        <p className="text-xs text-slate-600 mt-2">{entry.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
                  className={`flex items-center justify-between p-4 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer ${
                    invoice.status === 'posted' 
                      ? 'bg-green-50 border-2 border-green-300' 
                      : 'bg-slate-50'
                  }`}
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
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        invoice.status === 'posted' ? 'bg-emerald-100 text-emerald-800 font-bold' :
                        invoice.status === 'issued' ? 'bg-green-100 text-green-700' :
                        invoice.status === 'draft' ? 'bg-blue-100 text-blue-700' :
                        invoice.status === 'edited' ? 'bg-purple-100 text-purple-700' :
                        invoice.status === 'imported' ? 'bg-yellow-100 text-yellow-700' :
                        invoice.status === 'deleted' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
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

      {/* AI Verification Results Modal */}
      {showResultsModal && verificationSummary && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">AI Verification Complete</h3>
                  <p className="text-sm text-slate-500">Analysis finished</p>
                </div>
              </div>
              <button
                onClick={() => setShowResultsModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Results Summary */}
            <div className="space-y-4 mb-6">
              {/* Total Checked */}
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-700">Total Entries Checked</span>
                  <span className="text-2xl font-bold text-blue-800">{verificationSummary.totalChecked}</span>
                </div>
              </div>

              {/* Passed */}
              <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-green-700">Passed Verification</span>
                  </div>
                  <span className="text-2xl font-bold text-green-800">{verificationSummary.passedCount}</span>
                </div>
              </div>

              {/* Flagged */}
              <div className={`rounded-xl p-4 border ${
                verificationSummary.flaggedCount > 0 
                  ? 'bg-red-50 border-red-200' 
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`w-4 h-4 ${
                      verificationSummary.flaggedCount > 0 ? 'text-red-500' : 'text-gray-400'
                    }`} />
                    <span className={`text-sm font-medium ${
                      verificationSummary.flaggedCount > 0 ? 'text-red-700' : 'text-gray-600'
                    }`}>
                      Flagged as Suspicious
                    </span>
                  </div>
                  <span className={`text-2xl font-bold ${
                    verificationSummary.flaggedCount > 0 ? 'text-red-800' : 'text-gray-500'
                  }`}>
                    {verificationSummary.flaggedCount}
                  </span>
                </div>
              </div>
            </div>

            {/* Message */}
            {verificationSummary.flaggedCount > 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-amber-800">
                  <strong>Action Required:</strong> {verificationSummary.flaggedCount} suspicious {verificationSummary.flaggedCount === 1 ? 'entry' : 'entries'} found. 
                  Please review the flagged items below (marked in red with info icons).
                </p>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-green-800">
                  <strong>All Clear!</strong> No suspicious patterns detected. All entries passed verification.
                </p>
              </div>
            )}

            {/* Action Button */}
            <Button
              onClick={() => setShowResultsModal(false)}
              className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-full py-3 font-semibold"
            >
              {verificationSummary.flaggedCount > 0 ? 'Review Flagged Entries' : 'Close'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchDetail;