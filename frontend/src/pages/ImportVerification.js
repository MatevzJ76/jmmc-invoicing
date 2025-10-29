import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle, Clock, Euro, AlertTriangle, Users, Filter, Search } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const ImportVerification = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [verificationData, setVerificationData] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [tariffFilter, setTariffFilter] = useState('all');
  const [filteredRows, setFilteredRows] = useState([]);

  useEffect(() => {
    // Get data from navigation state or sessionStorage
    const data = location.state?.verificationData || JSON.parse(sessionStorage.getItem('importVerificationData') || 'null');
    
    if (!data) {
      toast.error('No import data found');
      navigate('/import');
      return;
    }
    
    setVerificationData(data);
    
    // Save to sessionStorage in case of page refresh
    if (location.state?.verificationData) {
      sessionStorage.setItem('importVerificationData', JSON.stringify(data));
    }
  }, [location, navigate]);
  
  // Filter rows based on filters
  useEffect(() => {
    if (!verificationData) return;
    
    let filtered = verificationData.rows;
    
    // Search filter (searches in customer, employee, and comments)
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(row => 
        (row.customer || '').toLowerCase().includes(term) ||
        (row.employee || '').toLowerCase().includes(term) ||
        (row.comments || '').toLowerCase().includes(term)
      );
    }
    
    // Project filter
    if (projectFilter !== 'all') {
      filtered = filtered.filter(row => row.project === projectFilter);
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
    
    setFilteredRows(filtered);
  }, [verificationData, searchTerm, projectFilter, customerFilter, employeeFilter, tariffFilter]);

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

  const handleProceed = async () => {
    if (!verificationData) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const formData = new FormData();
      
      // Re-create the file from the stored data
      const uint8Array = new Uint8Array(verificationData.fileData);
      const blob = new Blob([uint8Array], { type: verificationData.fileType });
      const file = new File([blob], verificationData.fileName, { type: verificationData.fileType });
      
      formData.append('file', file);
      formData.append('title', verificationData.metadata.title);
      formData.append('invoiceDate', verificationData.metadata.invoiceDate);
      formData.append('periodFrom', verificationData.metadata.periodFrom);
      formData.append('periodTo', verificationData.metadata.periodTo);
      formData.append('dueDate', verificationData.metadata.dueDate);

      // Import data
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
      
      sessionStorage.removeItem('importVerificationData');
      navigate('/batches');
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Import failed';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    sessionStorage.removeItem('importVerificationData');
    navigate('/import');
  };

  if (!verificationData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  const totalHours = verificationData.rows.reduce((sum, row) => sum + (parseFloat(row.hours) || 0), 0);
  const totalValue = verificationData.rows.reduce((sum, row) => sum + (parseFloat(row.value) || 0), 0);
  
  // Get unique values for filters
  const uniqueProjects = [...new Set(verificationData.rows.map(r => r.project).filter(Boolean))];
  const uniqueCustomers = [...new Set(verificationData.rows.map(r => r.customer).filter(Boolean))];
  const uniqueEmployees = [...new Set(verificationData.rows.map(r => r.employee).filter(Boolean))];
  const uniqueTariffs = [...new Set(verificationData.rows.map(r => r.tariff).filter(Boolean))];
  
  // Use filtered rows for display
  const displayRows = filteredRows.length > 0 || searchTerm || projectFilter !== 'all' || customerFilter !== 'all' || employeeFilter !== 'all' || tariffFilter !== 'all' 
    ? filteredRows 
    : verificationData.rows;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <nav className="bg-white/90 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            JMMC Invoicing
          </h1>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={handleBack}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h2 className="text-3xl font-bold text-slate-800 mb-2">Import Verification</h2>
          <p className="text-slate-600">Review imported data before creating invoices</p>
        </div>

        {/* Summary Tiles */}
        <div className="grid grid-cols-3 gap-4 mb-6">
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
                <p className="text-sm text-slate-600">Vrednost</p>
                <p className="text-2xl font-bold text-slate-800">€{totalValue.toFixed(2)}</p>
              </div>
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
              <p className="text-white text-xs mt-2 opacity-90">Review data below first</p>
            </div>
          </div>
        </div>

        {/* Import Metadata */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200 mb-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Import Details</h3>
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

        {/* Hours by Employee Breakdown */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200 mb-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Hours by Employee</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {(() => {
              // Calculate hours per employee
              const hoursByEmployee = {};
              verificationData.rows.forEach(row => {
                const employee = row.employee || 'Unknown';
                const hours = parseFloat(row.hours) || 0;
                hoursByEmployee[employee] = (hoursByEmployee[employee] || 0) + hours;
              });
              
              // Sort by hours (descending)
              const sorted = Object.entries(hoursByEmployee).sort((a, b) => b[1] - a[1]);
              
              return sorted.map(([employee, hours]) => (
                <div key={employee} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <p className="text-xs text-slate-600 mb-1">{employee}</p>
                  <p className="text-xl font-bold text-blue-600">{hours.toFixed(2)} h</p>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-slate-600" />
            <h3 className="text-lg font-semibold text-slate-800">Filters</h3>
            {(searchTerm || projectFilter !== 'all' || customerFilter !== 'all' || employeeFilter !== 'all' || tariffFilter !== 'all') && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                Showing {displayRows.length} of {verificationData.rows.length} rows
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
            
            {/* Project Filter */}
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {uniqueProjects.map(project => (
                  <SelectItem key={project} value={project}>{project}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Customer Filter */}
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {uniqueCustomers.map(customer => (
                  <SelectItem key={customer} value={customer}>{customer}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
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
          </div>
          
          {/* Clear Filters Button */}
          {(searchTerm || projectFilter !== 'all' || customerFilter !== 'all' || employeeFilter !== 'all' || tariffFilter !== 'all') && (
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setProjectFilter('all');
                  setCustomerFilter('all');
                  setEmployeeFilter('all');
                  setTariffFilter('all');
                }}
                className="rounded-full"
              >
                Clear All Filters
              </Button>
            </div>
          )}
        </div>

        {/* Data Table */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200 overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">#</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">Projekt</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">Stranka</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">Datum</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">Tarifa</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">Delavec</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">Opombe</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-700">Porabljene ure</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-700">Vrednost</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">Št.računa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayRows.length > 0 ? (
                  displayRows.map((row, index) => (
                    <tr key={index} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-600">{index + 1}</td>
                      <td className="px-3 py-2 text-slate-700">{row.project}</td>
                      <td className="px-3 py-2 text-slate-700 font-medium">{row.customer}</td>
                      <td className="px-3 py-2 text-slate-600">{row.date}</td>
                      <td className="px-3 py-2 text-slate-600">{row.tariff}</td>
                      <td className="px-3 py-2 text-slate-700">{row.employee}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-md truncate" title={row.comments}>
                        {row.comments}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700 font-medium">{row.hours}</td>
                      <td className="px-3 py-2 text-right text-slate-700">€{parseFloat(row.value || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-slate-600">{row.invoiceNumber || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="10" className="px-3 py-8 text-center text-slate-500">
                      No rows match the current filters
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                <tr>
                  <td colSpan="7" className="px-3 py-3 text-right text-sm font-bold text-slate-800">
                    Total {displayRows.length > 0 && displayRows.length !== verificationData.rows.length && `(${displayRows.length} rows)`}:
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-blue-700">
                    {displayRows.reduce((sum, row) => sum + (parseFloat(row.hours) || 0), 0).toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-green-700">
                    €{displayRows.reduce((sum, row) => sum + (parseFloat(row.value) || 0), 0).toFixed(2)}
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

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Confirm Import</h3>
              <p className="text-slate-600">
                Have you reviewed and compared the import file data with the verification table displayed below?
              </p>
            </div>
            
            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>Important:</strong> Please verify that all data is correct before proceeding. 
                This action will create {verificationData?.rows.length} time entries and generate invoices.
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
    </div>
  );
};

export default ImportVerification;
