import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, Save, Send, Trash2, Plus, Sparkles, ArrowRightLeft, CheckCircle, FileCheck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const InvoiceDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [user, setUser] = useState(null);
  const [allCustomers, setAllCustomers] = useState([]);
  const [showMoveDropdown, setShowMoveDropdown] = useState(null);
  const [movingLine, setMovingLine] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) setUser(JSON.parse(userStr));
    loadInvoice();
    loadAllCustomers();
  }, [id]);

  const loadInvoice = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/invoices/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInvoice(response.data.invoice);
      setLines(response.data.lines);
    } catch (error) {
      toast.error('Failed to load invoice');
      console.error(error);
    } finally {
      setLoading(false);
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

  const handleMoveLineItem = async (line, newCustomerId) => {
    setMovingLine(line.id);
    setShowMoveDropdown(null);
    
    try {
      const token = localStorage.getItem('access_token');
      
      // Get the time entry ID from the line
      const timeEntryId = line.timeEntryId;
      
      if (!timeEntryId) {
        toast.error('Cannot move this line item');
        return;
      }
      
      const formData = new FormData();
      formData.append('new_customer_id', newCustomerId);
      
      await axios.post(
        `${BACKEND_URL}/api/time-entries/${timeEntryId}/move-customer`,
        formData,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      toast.success('Line item moved successfully');
      
      // Reload invoice to reflect changes
      await loadInvoice();
    } catch (error) {
      toast.error('Failed to move line item');
      console.error(error);
    } finally {
      setMovingLine(null);
    }
  };


  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.put(
        `${BACKEND_URL}/api/invoices/${id}`,
        { number: invoice.number, lines },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success('Invoice saved');
      loadInvoice();
    } catch (error) {
      toast.error('Failed to save invoice');
    } finally {
      setSaving(false);
    }
  };


  const handleConfirmDraft = async () => {
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${BACKEND_URL}/api/invoices/${id}/confirm-draft`,
        {},
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success('Invoice confirmed as draft');
      loadInvoice();
    } catch (error) {
      toast.error('Failed to confirm draft');
    }
  };

  const handleIssueInvoice = async () => {
    if (user?.role !== 'ADMIN') {
      toast.error('Only admins can issue invoices');
      return;
    }

    if (!window.confirm('Issue this invoice? This will mark it as issued.')) return;

    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${BACKEND_URL}/api/invoices/${id}/issue`,
        {},
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success('Invoice issued successfully');
      loadInvoice();
    } catch (error) {
      toast.error('Failed to issue invoice');
    }
  };

  const handleDeleteInvoice = async () => {
    if (!window.confirm('Delete this invoice? (Soft delete - status will be set to deleted)')) return;

    try {
      const token = localStorage.getItem('access_token');
      await axios.delete(
        `${BACKEND_URL}/api/invoices/${id}`,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success('Invoice deleted');
      navigate(-1); // Go back to previous page
    } catch (error) {
      toast.error('Failed to delete invoice');
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      const token = localStorage.getItem('access_token');
      const formData = new FormData();
      formData.append('new_status', newStatus);
      
      await axios.put(
        `${BACKEND_URL}/api/invoices/${id}/status`,
        formData,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success(`Status updated to ${newStatus}`);
      loadInvoice();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };


  const handlePost = async () => {
    if (user?.role !== 'ADMIN') {
      toast.error('Only admins can post invoices');
      return;
    }

    if (!window.confirm('Post this invoice to eRačuni?')) return;

    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(
        `${BACKEND_URL}/api/invoices/${id}/post`,
        {},
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success(`Invoice posted: ${response.data.externalNumber}`);
      loadInvoice();
    } catch (error) {
      toast.error('Failed to post invoice');
    }
  };

  const handleAISuggestion = async (lineIndex, field) => {
    if (!aiEnabled) return;

    try {
      const token = localStorage.getItem('access_token');
      const line = lines[lineIndex];
      const response = await axios.post(
        `${BACKEND_URL}/api/ai/suggest`,
        { text: line[field], feature: field === 'description' ? 'grammar' : 'gdpr' },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      const newLines = [...lines];
      newLines[lineIndex][field] = response.data.suggestion;
      setLines(newLines);
      toast.success('AI suggestion applied');
    } catch (error) {
      toast.error('AI suggestion failed');
    }
  };

  const addLine = () => {
    setLines([...lines, {
      id: `new-${Date.now()}`,
      invoiceId: id,
      description: '',
      quantity: 1,
      unitPrice: 0,
      amount: 0,
      taxCode: null
    }]);
  };

  const removeLine = (index) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const updateLine = (index, field, value) => {
    const newLines = [...lines];
    newLines[index][field] = value;
    
    if (field === 'quantity' || field === 'unitPrice') {
      newLines[index].amount = newLines[index].quantity * newLines[index].unitPrice;
    }
    
    setLines(newLines);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <p className="text-slate-600">Invoice not found</p>
      </div>
    );
  }

  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const warnings = [];
  if (total === 0) warnings.push('Invoice total is zero');
  if (!invoice.number) warnings.push('Invoice number not set');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <nav className="bg-white/90 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => navigate(-1)} 
              className="rounded-full bg-gradient-to-r from-slate-700 to-slate-900 hover:from-slate-800 hover:to-black text-white shadow-md hover:shadow-lg transition-all duration-200 font-medium px-5"
              size="sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-100 rounded-full px-4 py-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium text-slate-700">AI Agent</span>
              <Switch 
                checked={aiEnabled} 
                onCheckedChange={setAiEnabled} 
                disabled={invoice.status === 'posted'}
                data-testid="ai-toggle" 
              />
            </div>
            <Button 
              onClick={handleSave} 
              disabled={saving || invoice.status === 'posted'} 
              className="rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed" 
              data-testid="save-invoice-button"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button 
              onClick={handleConfirmDraft} 
              disabled={invoice.status === 'posted'}
              variant="outline"
              className="rounded-full border-green-500 text-green-700 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="confirm-draft-button"
            >
              <FileCheck className="w-4 h-4 mr-2" />
              Confirm Draft
            </Button>
            {user?.role === 'ADMIN' && (
              <>
                <Button 
                  onClick={handleIssueInvoice} 
                  disabled={invoice.status === 'posted'}
                  className="rounded-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed" 
                  data-testid="issue-invoice-button"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Issue Invoice
                </Button>
                <Button 
                  onClick={handlePost}
                  disabled={invoice.status === 'posted'}
                  className="rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed" 
                  data-testid="post-eracuni-button"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Post to eRačuni
                </Button>
              </>
            )}
            <Button 
              onClick={handleDeleteInvoice} 
              disabled={invoice.status === 'posted'}
              variant="destructive"
              className="rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="delete-invoice-button"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {warnings.length > 0 && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4" data-testid="warnings-section">
            <p className="text-sm font-semibold text-yellow-800 mb-2">⚠️ Warnings:</p>
            <ul className="text-sm text-yellow-700 space-y-1">
              {warnings.map((w, i) => <li key={i}>• {w}</li>)}
            </ul>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Invoice Details</h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="number">Invoice Number</Label>
                <Input
                  id="number"
                  value={invoice.number || ''}
                  onChange={(e) => setInvoice({...invoice, number: e.target.value})}
                  placeholder="INV-2025-001"
                  disabled={invoice.status === 'posted'}
                  data-testid="invoice-number-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="invoiceDate">Invoice Date</Label>
                  <Input
                    id="invoiceDate"
                    type="date"
                    value={invoice.invoiceDate}
                    onChange={(e) => setInvoice({...invoice, invoiceDate: e.target.value})}
                    disabled={invoice.status === 'posted'}
                    data-testid="invoice-date-input"
                  />
                </div>
                <div>
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={invoice.dueDate}
                    onChange={(e) => setInvoice({...invoice, dueDate: e.target.value})}
                    disabled={invoice.status === 'posted'}
                    data-testid="due-date-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="periodFrom">Period From</Label>
                  <Input
                    id="periodFrom"
                    type="date"
                    value={invoice.periodFrom}
                    onChange={(e) => setInvoice({...invoice, periodFrom: e.target.value})}
                    disabled={invoice.status === 'posted'}
                    data-testid="period-from-input"
                  />
                </div>
                <div>
                  <Label htmlFor="periodTo">Period To</Label>
                  <Input
                    id="periodTo"
                    type="date"
                    value={invoice.periodTo}
                    onChange={(e) => setInvoice({...invoice, periodTo: e.target.value})}
                    disabled={invoice.status === 'posted'}
                    data-testid="period-to-input"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-600">Customer:</span>
                <span className="font-semibold text-slate-800">{invoice.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Line Items:</span>
                <span className="font-semibold text-slate-800">{lines.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Status:</span>
                <Select value={invoice.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="imported">Imported</SelectItem>
                    <SelectItem value="edited">Edited</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="issued">Issued</SelectItem>
                    <SelectItem value="posted">Posted</SelectItem>
                    <SelectItem value="deleted">Deleted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-between pt-3 border-t border-slate-200">
                <span className="text-lg font-bold text-slate-800">Total:</span>
                <span className="text-2xl font-bold text-blue-600">€{total.toFixed(2)}</span>
              </div>
              {invoice.externalNumber && (
                <div className="pt-3 border-t border-slate-200">
                  <span className="text-sm text-slate-600">eRačuni Number:</span>
                  <p className="font-mono text-sm text-green-600">{invoice.externalNumber}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">Line Items</h2>
            <Button 
              onClick={addLine} 
              disabled={invoice.status === 'posted'}
              size="sm" 
              variant="outline" 
              className="rounded-full disabled:opacity-50 disabled:cursor-not-allowed" 
              data-testid="add-line-button"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Line
            </Button>
          </div>

          <div className="space-y-4">
            {lines.map((line, index) => (
              <div key={line.id} className="bg-slate-50 rounded-lg p-4 border border-slate-200" data-testid={`line-item-${index}`}>
                <div className="grid gap-4">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <Label htmlFor={`desc-${index}`}>Description</Label>
                      <Textarea
                        id={`desc-${index}`}
                        value={line.description}
                        onChange={(e) => updateLine(index, 'description', e.target.value)}
                        placeholder="Service description"
                        rows={2}
                        disabled={invoice.status === 'posted'}
                        data-testid={`description-input-${index}`}
                      />
                    </div>
                    {aiEnabled && invoice.status !== 'posted' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAISuggestion(index, 'description')}
                        className="mt-6"
                        title="Apply AI grammar correction"
                      >
                        <Sparkles className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-5 gap-4">
                    <div>
                      <Label htmlFor={`qty-${index}`}>Quantity</Label>
                      <Input
                        id={`qty-${index}`}
                        type="number"
                        step="0.01"
                        value={line.quantity}
                        onChange={(e) => updateLine(index, 'quantity', parseFloat(e.target.value) || 0)}
                        onFocus={(e) => e.target.select()}
                        disabled={invoice.status === 'posted'}
                        data-testid={`quantity-input-${index}`}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`price-${index}`}>Unit Price (€)</Label>
                      <Input
                        id={`price-${index}`}
                        type="number"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                        onFocus={(e) => e.target.select()}
                        disabled={invoice.status === 'posted'}
                        data-testid={`unit-price-input-${index}`}
                      />
                    </div>
                    <div>
                      <Label>Amount (€)</Label>
                      <p className="mt-2 text-lg font-semibold text-slate-800" data-testid={`amount-${index}`}>
                        €{line.amount.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-end relative">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowMoveDropdown(showMoveDropdown === line.id ? null : line.id)}
                        disabled={movingLine === line.id || invoice.status === 'posted'}
                        className="w-full rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Move to different customer"
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                      </Button>
                      
                      {showMoveDropdown === line.id && (
                        <div className="absolute left-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-20">
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
                                    handleMoveLineItem(line, customer.id);
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
                    <div className="flex items-end">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeLine(index)}
                        disabled={invoice.status === 'posted'}
                        className="w-full rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                        data-testid={`remove-line-${index}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceDetail;