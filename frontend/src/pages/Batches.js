import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { LogOut, Upload, Filter, Search, Archive, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

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

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      navigate('/login');
      return;
    }
    setUser(JSON.parse(userStr));
    loadBatches();
  }, [navigate]);

  useEffect(() => {
    filterBatches();
  }, [batches, searchTerm, statusFilter, sortColumn, sortDirection]);

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

  const sortBatches = (batchesToSort) => {
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
  };

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

  const filterBatches = () => {
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
  };

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
  
  const handleBatchClick = async (batch) => {
    // If status is "in progress", load verification page
    if (batch.status === 'in progress') {
      try {
        const token = localStorage.getItem('access_token');
        
        // Fetch time entries for this batch
        const entriesResponse = await axios.get(`${BACKEND_URL}/api/batches/${batch.id}/time-entries`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        const timeEntries = entriesResponse.data;
        
        // Convert time entries to verification format
        const rows = timeEntries.map(entry => ({
          project: entry.projectName || entry.tariff || '',  // Use projectName from backend
          customer: entry.customerName || '',
          date: entry.date || '',
          tariff: entry.tariff || '',
          employee: entry.employeeName || '',  // Fixed: was entry.employee
          comments: entry.notes || '',
          hours: entry.hours || 0,
          value: entry.value || 0,
          invoiceNumber: entry.invoiceNumber || ''
        }));
        
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
              batchId: batch.id
            }
          }
        });
      } catch (error) {
        toast.error('Failed to load batch data');
        console.error(error);
      }
    } else {
      // Normal batches open BatchDetail
      navigate(`/batches/${batch.id}`);
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
                          <span className="text-xs text-gray-400">Archived</span>
                        )}
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
    </div>
  );
};

export default Batches;