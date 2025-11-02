import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { LogOut, Upload, Filter, Search, Archive, ArrowUpDown, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';

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

const Batches = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [batches, setBatches] = useState([]);
  const [filteredBatches, setFilteredBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortColumn, setSortColumn] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState('desc');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      navigate('/login');
      return;
    }
    setUser(JSON.parse(userStr));
    loadBatches();
  }, [navigate]);

  // Define sortBatches with useCallback BEFORE filterBatches uses it
  const sortBatches = useCallback((batchesToSort) => {
    return [...batchesToSort].sort((a, b) => {
      // Always put "in progress" batches at the top
      if (a.status === 'in progress' && b.status !== 'in progress') return -1;
      if (a.status !== 'in progress' && b.status === 'in progress') return 1;
      
      let aValue, bValue;

      switch (sortColumn) {
        case 'title':
          aValue = (a.title || 'Untitled').toLowerCase();
          bValue = (b.title || 'Untitled').toLowerCase();
          break;
        case 'periodFrom':
          aValue = new Date(a.periodFrom);
          bValue = new Date(b.periodFrom);
          break;
        case 'periodTo':
          aValue = new Date(a.periodTo);
          bValue = new Date(b.periodTo);
          break;
        case 'invoiceDate':
          aValue = new Date(a.invoiceDate);
          bValue = new Date(b.invoiceDate);
          break;
        case 'dueDate':
          aValue = new Date(a.dueDate);
          bValue = new Date(b.dueDate);
          break;
        case 'invoiceCount':
          aValue = a.invoiceCount || 0;
          bValue = b.invoiceCount || 0;
          break;
        case 'totalAmount':
          aValue = a.totalAmount || 0;
          bValue = b.totalAmount || 0;
          break;
        case 'status':
          aValue = a.status.toLowerCase();
          bValue = b.status.toLowerCase();
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt);
          bValue = new Date(b.createdAt);
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sortColumn, sortDirection]);

  // Define filterBatches with useCallback AFTER sortBatches
  const filterBatches = useCallback(() => {
    let filtered = [...batches];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(batch =>
        batch.filename.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(batch => batch.status === statusFilter);
    }

    // Apply sorting
    filtered = sortBatches(filtered);

    setFilteredBatches(filtered);
  }, [batches, searchTerm, statusFilter, sortBatches]);

  useEffect(() => {
    filterBatches();
  }, [filterBatches]);

  const handleSort = (column) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortBatches = useCallback((batchesToSort) => {
    return [...batchesToSort].sort((a, b) => {
      // Always put "in progress" batches at the top
      if (a.status === 'in progress' && b.status !== 'in progress') return -1;
      if (a.status !== 'in progress' && b.status === 'in progress') return 1;
      
      let aValue, bValue;

      switch (sortColumn) {
        case 'title':
          aValue = (a.title || 'Untitled').toLowerCase();
          bValue = (b.title || 'Untitled').toLowerCase();
          break;
        case 'periodFrom':
          aValue = new Date(a.periodFrom);
          bValue = new Date(b.periodFrom);
          break;
        case 'periodTo':
          aValue = new Date(a.periodTo);
          bValue = new Date(b.periodTo);
          break;
        case 'invoiceDate':
          aValue = new Date(a.invoiceDate);
          bValue = new Date(b.invoiceDate);
          break;
        case 'dueDate':
          aValue = new Date(a.dueDate);
          bValue = new Date(b.dueDate);
          break;
        case 'invoiceCount':
          aValue = a.invoiceCount || 0;
          bValue = b.invoiceCount || 0;
          break;
        case 'totalAmount':
          aValue = a.totalAmount || 0;
          bValue = b.totalAmount || 0;
          break;
        case 'status':
          aValue = a.status.toLowerCase();
          bValue = b.status.toLowerCase();
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt);
          bValue = new Date(b.createdAt);
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sortColumn, sortDirection]);

  const loadBatches = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/batches`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Store raw data - sorting will be handled by sortBatches function
      setBatches(response.data);
    } catch (error) {
      toast.error('Failed to load batches');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filterBatches = useCallback(() => {
    let filtered = [...batches];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(batch =>
        batch.filename.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(batch => batch.status === statusFilter);
    }

    // Apply sorting
    filtered = sortBatches(filtered);

    setFilteredBatches(filtered);
  }, [batches, searchTerm, statusFilter, sortBatches]);

  const handleArchive = async (batchId, e) => {
    e.stopPropagation(); // Prevent row click
    
    if (!window.confirm('Archive this batch? It will be moved to the bottom of the list.')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(`${BACKEND_URL}/api/batches/${batchId}/archive`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Batch archived');
      loadBatches(); // Reload to reflect changes
    } catch (error) {
      toast.error('Failed to archive batch');
    }
  };

  const handleDeleteClick = (batch, e) => {
    e.stopPropagation(); // Prevent row click
    
    // Check if batch has invoices
    const invoiceCount = batch.invoiceCount || 0;
    
    if (invoiceCount > 0) {
      // Show info why delete is not possible
      toast.info(
        `Cannot delete batch with ${invoiceCount} invoice(s). To delete this batch, first delete all its invoices or use the Archive option instead.`,
        { duration: 6000 }
      );
      return;
    }
    
    // Show delete confirmation modal
    setBatchToDelete(batch);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!batchToDelete) return;
    
    setDeleting(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.delete(
        `${BACKEND_URL}/api/batches/${batchToDelete.id}`,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      toast.success(
        `Batch deleted: ${response.data.batchTitle}. Removed ${response.data.timeEntriesDeleted} time entries.`,
        { duration: 5000 }
      );
      
      setShowDeleteModal(false);
      setBatchToDelete(null);
      loadBatches(); // Reload to reflect changes
      
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to delete batch';
      toast.error(errorMsg, { duration: 6000 });
    } finally {
      setDeleting(false);
    }
  };

  
  const handleBatchClick = async (batch) => {
    // ALWAYS load Import Verification page first (user can navigate to Invoices & Verification manually)
    try {
      const token = localStorage.getItem('access_token');
      
      // Fetch time entries for this batch
      const entriesResponse = await axios.get(`${BACKEND_URL}/api/batches/${batch.id}/time-entries`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const timeEntries = entriesResponse.data;
      
      // Convert time entries to verification format and track AI-corrected rows and original values
      const aiCorrectedRows = [];
      const manuallyEditedRows = [];
      const originalValues = {};
      const rows = timeEntries.map((entry, index) => {
        // Track which rows have AI corrections applied
        if (entry.aiCorrectionApplied) {
          aiCorrectedRows.push(index);
          
          // Store original values if they exist (check for not undefined, not just not null)
          if (entry.originalNotes !== undefined || entry.originalHours !== undefined || entry.originalCustomerId !== undefined) {
            originalValues[index] = {
              comments: entry.originalNotes || '',
              hours: entry.originalHours || 0,
              customerId: entry.originalCustomerId || '',
              customer: entry.originalCustomerName || '', // Backend should populate this
              tariff: entry.originalTariff || ''
            };
          }
        }
        
        // Track which rows have manual edits
        if (entry.manuallyEdited) {
          manuallyEditedRows.push(index);
          
          // Store original values if they exist and not already stored (check for not undefined)
          if (!originalValues[index] && (entry.originalNotes !== undefined || entry.originalHours !== undefined || entry.originalCustomerId !== undefined)) {
            originalValues[index] = {
              comments: entry.originalNotes || '',
              hours: entry.originalHours || 0,
              customerId: entry.originalCustomerId || '',
              customer: entry.originalCustomerName || '', // Backend should populate this
              tariff: entry.originalTariff || ''
            };
          }
        }
        
        return {
          project: entry.projectName || entry.tariff || '',  // Use projectName from backend
          customer: entry.customerName || '',
          customerId: entry.customerId || '',  // Add customerId to row data
          date: entry.date || '',
          tariff: entry.tariff || '',
          employee: entry.employeeName || '',  // Fixed: was entry.employee
          comments: entry.notes || '',
          hours: entry.hours || 0,
          hourlyRate: entry.hourlyRate || 0,  // Add hourlyRate from backend
          value: entry.value || 0,
          invoiceNumber: entry.invoiceNumber || '',
          status: entry.status || 'uninvoiced'  // Row status
        };
      });
      
      // Navigate to verification page with batch data
      navigate('/import/verify', {
        state: {
          verificationData: {
            fileName: batch.filename,
            fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            fileData: [], // Not needed for resume
            metadata: {
              title: batch.title,
              invoiceDate: batch.invoiceDate,
              periodFrom: batch.periodFrom,
              periodTo: batch.periodTo,
              dueDate: batch.dueDate
            },
            rows,
            resuming: true,
            batchId: batch.id,
            aiCorrectedRows,  // Pass AI-corrected row indices
            manuallyEditedRows,  // Pass manually-edited row indices
            originalValues  // Pass original values before corrections
          }
        }
      });
    } catch (error) {
      toast.error('Failed to load batch data');
      console.error(error);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const SortableHeader = ({ column, label }) => {
    const isSorted = sortColumn === column;
    return (
      <th 
        className="px-6 py-4 text-left text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors select-none"
        onClick={() => handleSort(column)}
      >
        <div className="flex items-center gap-2">
          <span>{label}</span>
          {isSorted ? (
            sortDirection === 'asc' ? (
              <ArrowUp className="w-4 h-4 text-blue-600" />
            ) : (
              <ArrowDown className="w-4 h-4 text-blue-600" />
            )
          ) : (
            <ArrowUpDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <nav className="bg-white/90 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            JMMC Invoicing
          </h1>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/profile')} className="rounded-full">
              {user?.email}
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/customers')} className="rounded-full">
              Customers
            </Button>
            {user?.role === 'ADMIN' && (
              <Button variant="outline" size="sm" onClick={() => navigate('/users')} className="rounded-full">
                Users
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate('/settings')} className="rounded-full">
              Settings
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-full">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-slate-800 mb-2">Monthly Batches</h2>
            <p className="text-slate-600">View and manage invoice batches by month</p>
          </div>
          <Button
            onClick={() => navigate('/import')}
            className="rounded-full bg-blue-600 hover:bg-blue-700"
            data-testid="new-import-button"
          >
            <Upload className="w-4 h-4 mr-2" />
            New Import
          </Button>
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
                placeholder="Search batches..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="search-input"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="in progress">In Progress</SelectItem>
                <SelectItem value="imported">Imported</SelectItem>
                <SelectItem value="composed">Composed</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Batches Table */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-500">Loading...</div>
          ) : filteredBatches.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-500 mb-4">No batches found</p>
              <Button onClick={() => navigate('/import')} className="rounded-full">
                <Upload className="w-4 h-4 mr-2" />
                Import First Batch
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <SortableHeader column="title" label="Title" />
                    <SortableHeader column="periodTo" label="Period" />
                    <SortableHeader column="invoiceDate" label="Invoice Date" />
                    <SortableHeader column="dueDate" label="Due Date" />
                    <SortableHeader column="invoiceCount" label="Invoices" />
                    <SortableHeader column="totalAmount" label="Total" />
                    <SortableHeader column="status" label="Status" />
                    <SortableHeader column="createdAt" label="Created" />
                    <th className="px-6 py-4 text-center text-sm font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBatches.map((batch) => (
                    <tr
                      key={batch.id}
                      onClick={() => handleBatchClick(batch)}
                      className={`hover:bg-slate-100 transition-colors cursor-pointer ${
                        batch.status === 'in progress' ? 'bg-orange-50 border-l-4 border-orange-500' : ''
                      }`}
                      data-testid={`batch-row-${batch.id}`}
                    >
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-800">{batch.title || 'Untitled'}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {batch.periodFrom} - {batch.periodTo}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{batch.invoiceDate}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{batch.dueDate}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
                          {batch.invoiceCount || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-green-700">
                        €{formatEuro(batch.totalAmount || 0)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                          batch.status === 'archived' ? 'bg-gray-100 text-gray-700' :
                          batch.status === 'posted' ? 'bg-green-100 text-green-700' :
                          batch.status === 'composed' ? 'bg-blue-100 text-blue-700' :
                          batch.status === 'in progress' ? 'bg-orange-100 text-orange-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {batch.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(batch.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          {/* Archive Button */}
                          {batch.status !== 'archived' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleArchive(batch.id, e)}
                              className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full"
                              data-testid={`archive-button-${batch.id}`}
                              title="Archive batch"
                            >
                              <Archive className="w-4 h-4" />
                            </Button>
                          ) : (
                            <span className="text-xs text-gray-400 mr-2">Archived</span>
                          )}
                          
                          {/* Delete Button - Show for all batches, active only when invoiceCount = 0 */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleDeleteClick(batch, e)}
                            className={`rounded-full ${
                              batch.invoiceCount === 0 
                                ? 'text-red-600 hover:text-red-900 hover:bg-red-50' 
                                : 'text-gray-300 cursor-not-allowed'
                            }`}
                            data-testid={`delete-button-${batch.id}`}
                            title={
                              batch.invoiceCount === 0 
                                ? 'Delete batch and all time entries' 
                                : `Cannot delete: ${batch.invoiceCount} invoice(s) prepared`
                            }
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-4 text-center text-sm text-slate-500">
          Showing {filteredBatches.length} of {batches.length} batches
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteModal && batchToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-red-600 to-rose-600 p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-3 rounded-full">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Delete Monthly Batch</h3>
                  <p className="text-sm text-red-100">This action cannot be undone</p>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-red-800 mb-2">⚠️ Warning</p>
                <p className="text-sm text-red-700">
                  You are about to permanently delete this batch and all its time entries. 
                  This action cannot be undone.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-800">Batch Details:</p>
                <div className="text-sm text-slate-600 space-y-1">
                  <p><span className="font-medium">Title:</span> {batchToDelete.title}</p>
                  <p><span className="font-medium">Period:</span> {batchToDelete.periodFrom} to {batchToDelete.periodTo}</p>
                  <p><span className="font-medium">Total Amount:</span> €{formatEuro(batchToDelete.totalAmount)}</p>
                  <p><span className="font-medium">Status:</span> {batchToDelete.status}</p>
                  <p className="text-red-600 font-semibold">
                    <span className="font-medium text-slate-600">Time Entries to Delete:</span> All entries in this batch will be permanently removed
                  </p>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-yellow-800 mb-1">Double Confirmation Required</p>
                <p className="text-sm text-yellow-700">
                  Please confirm that you understand this will delete the batch and all its time entries permanently.
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-6 bg-slate-50 border-t border-slate-200 flex gap-3">
              <Button
                onClick={() => {
                  setShowDeleteModal(false);
                  setBatchToDelete(null);
                }}
                variant="outline"
                className="flex-1 rounded-full"
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 rounded-full bg-red-600 hover:bg-red-700"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {deleting ? 'Deleting...' : 'Yes, Delete Permanently'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Batches;