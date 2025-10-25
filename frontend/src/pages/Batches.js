import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { LogOut, Upload, Filter, Search, Archive } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const Batches = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [batches, setBatches] = useState([]);
  const [filteredBatches, setFilteredBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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
  }, [batches, searchTerm, statusFilter]);

  const loadBatches = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/batches`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Sort: archived batches at bottom, others by periodTo descending
      const sorted = response.data.sort((a, b) => {
        // Archived batches go to bottom
        if (a.status === 'archived' && b.status !== 'archived') return 1;
        if (a.status !== 'archived' && b.status === 'archived') return -1;
        
        // For non-archived, sort by periodTo descending (newest first)
        return new Date(b.periodTo) - new Date(a.periodTo);
      });
      
      setBatches(sorted);
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

  const handleLogout = () => {
    localStorage.clear();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <nav className="bg-white/90 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Emergent Invoicing
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{user?.email}</span>
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
                placeholder="Search filename..."
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
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Title</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Period</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Invoice Date</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Due Date</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Invoices</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Status</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Created</th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBatches.map((batch) => (
                    <tr
                      key={batch.id}
                      className="hover:bg-slate-50 transition-colors"
                      data-testid={`batch-row-${batch.id}`}
                    >
                      <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/batches/${batch.id}`)}>
                        <div className="font-semibold text-slate-800">{batch.title || 'Untitled'}</div>
                      </td>
                      <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/batches/${batch.id}`)}>
                        <div className="text-sm text-slate-600">{batch.filename}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 cursor-pointer" onClick={() => navigate(`/batches/${batch.id}`)}>
                        {batch.periodFrom} - {batch.periodTo}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 cursor-pointer" onClick={() => navigate(`/batches/${batch.id}`)}>{batch.invoiceDate}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 cursor-pointer" onClick={() => navigate(`/batches/${batch.id}`)}>{batch.dueDate}</td>
                      <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/batches/${batch.id}`)}>
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
                          {batch.invoiceCount || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/batches/${batch.id}`)}>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                          batch.status === 'archived' ? 'bg-gray-100 text-gray-700' :
                          batch.status === 'posted' ? 'bg-green-100 text-green-700' :
                          batch.status === 'composed' ? 'bg-blue-100 text-blue-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {batch.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 cursor-pointer" onClick={() => navigate(`/batches/${batch.id}`)}>
                        {new Date(batch.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-center">
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