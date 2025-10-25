import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Search, Filter, Edit, Save, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, AlertTriangle, Sparkles, Info } from 'lucide-react';

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
    noClient: []
  });
  const [expandedCategories, setExpandedCategories] = useState({
    jmmcHP: false,
    jmmcFinance: false,
    noClient: false
  });
  const [aiVerifying, setAiVerifying] = useState(false);
  const [aiResults, setAiResults] = useState({});
  const [showAiWarnings, setShowAiWarnings] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [verificationSummary, setVerificationSummary] = useState(null);

  useEffect(() => {
    loadBatchAndInvoices();
    loadAllBatches();
    loadVerificationData();
  }, [id]);

  useEffect(() => {
    filterInvoices();
  }, [invoices, searchTerm, statusFilter]);

  useEffect(() => {
    // Find current batch index whenever batches or id changes
    if (allBatches.length > 0) {
      const index = allBatches.findIndex(b => b.id === id);
      setCurrentIndex(index);
    }
  }, [allBatches, id]);

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
      
      const flaggedCount = Object.keys(response.data.results || {}).length;
      const totalChecked = response.data.total_checked || 0;
      
      if (flaggedCount > 0) {
        toast.success(`AI verification complete: ${flaggedCount} of ${totalChecked} entries flagged as suspicious`);
      } else {
        toast.success(`AI verification complete: All ${totalChecked} entries passed verification`);
      }
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
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
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
                ({verificationData.jmmcHP.length + verificationData.jmmcFinance.length + verificationData.noClient.length} items need review)
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
                      <div className="grid grid-cols-4 gap-2 text-sm">
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
                          <p className="font-medium">{entry.hours}</p>
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
                      <div className="grid grid-cols-4 gap-2 text-sm">
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
                          <p className="font-medium">{entry.hours}</p>
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
                      <div className="grid grid-cols-4 gap-2 text-sm">
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
                          <p className="font-medium">{entry.hours}</p>
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