import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, Save, Send, Trash2, Plus, Sparkles, ArrowRightLeft, CheckCircle, FileCheck, X, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// European number formatting helper
const formatEuro = (amount) => {
  if (amount === null || amount === undefined || isNaN(amount)) return '€0,00';
  const num = parseFloat(amount);
  return '€' + num.toLocaleString('de-DE', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

// Sortable Line Item Component
const SortableLineItem = ({ 
  line, 
  index, 
  invoice, 
  aiEnabled,
  lines,
  allCustomers,
  showMoveDropdown,
  setShowMoveDropdown,
  movingLine,
  customerSearch,
  setCustomerSearch,
  updateLine,
  removeLine,
  handleAISuggestion,
  handleMoveLineItem,
  moveLineUp,
  moveLineDown,
  isEditingAllowed
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: line.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className="bg-slate-50 rounded-lg p-4 border border-slate-200" 
      data-testid={`line-item-${index}`}
    >
      <div className="grid gap-4">
        <div className="flex items-start gap-2">
          {/* Drag Handle */}
          <button
            {...attributes}
            {...listeners}
            disabled={!isEditingAllowed}
            className="mt-6 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Drag to reorder"
          >
            <GripVertical className="w-5 h-5" />
          </button>
          
          <div className="flex-1">
            <Label htmlFor={`desc-${index}`}>Description</Label>
            <Textarea
              id={`desc-${index}`}
              value={line.description}
              onChange={(e) => updateLine(index, 'description', e.target.value)}
              placeholder="Service description"
              rows={2}
              disabled={!isEditingAllowed}
              data-testid={`description-input-${index}`}
            />
          </div>
          {aiEnabled && isEditingAllowed && (
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

        <div className="grid grid-cols-7 gap-4">
          <div>
            <Label htmlFor={`qty-${index}`}>Quantity</Label>
            <Input
              id={`qty-${index}`}
              type="number"
              step="0.01"
              value={parseFloat(line.quantity).toFixed(2)}
              onChange={(e) => updateLine(index, 'quantity', parseFloat(e.target.value) || 0)}
              onFocus={(e) => e.target.select()}
              disabled={!isEditingAllowed}
              data-testid={`quantity-input-${index}`}
            />
          </div>
          <div>
            <Label htmlFor={`price-${index}`}>Unit Price (€)</Label>
            <Input
              id={`price-${index}`}
              type="number"
              step="0.01"
              value={parseFloat(line.unitPrice).toFixed(2)}
              onChange={(e) => updateLine(index, 'unitPrice', parseFloat(e.target.value) || 0)}
              onFocus={(e) => e.target.select()}
              disabled={!isEditingAllowed}
              data-testid={`unit-price-input-${index}`}
            />
          </div>
          <div>
            <Label>Amount (€)</Label>
            <p className="mt-2 text-lg font-semibold text-slate-800" data-testid={`amount-${index}`}>
              {formatEuro(line.amount)}
            </p>
          </div>
          <div className="flex items-end relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMoveDropdown(showMoveDropdown === line.id ? null : line.id)}
              disabled={movingLine === line.id || !isEditingAllowed}
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
          
          {/* Up/Down Arrow Buttons */}
          <div className="flex items-end gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => moveLineUp(index)}
              disabled={index === 0 || !isEditingAllowed}
              className="rounded-full disabled:opacity-30 disabled:cursor-not-allowed px-2"
              title="Move up"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => moveLineDown(index)}
              disabled={index === lines.length - 1 || !isEditingAllowed}
              className="rounded-full disabled:opacity-30 disabled:cursor-not-allowed px-2"
              title="Move down"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="flex items-end">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => removeLine(index)}
              disabled={!isEditingAllowed}
              className="w-full rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid={`remove-line-${index}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

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
  const [showApiDebugModal, setShowApiDebugModal] = useState(false);
  const [apiDebugData, setApiDebugData] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [customerDefaultUnitPrice, setCustomerDefaultUnitPrice] = useState(0);
  const [customerDetails, setCustomerDetails] = useState(null);
  const [processingButtons, setProcessingButtons] = useState({
    save: false,
    confirmDraft: false,
    issue: false,
    post: false
  });

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setLines((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      toast.success('Line item reordered');
    }
  };

  const moveLineUp = (index) => {
    if (index === 0) return;
    setLines((items) => arrayMove(items, index, index - 1));
    toast.success('Line item moved up');
  };

  const moveLineDown = (index) => {
    if (index === lines.length - 1) return;
    setLines((items) => arrayMove(items, index, index + 1));
    toast.success('Line item moved down');
  };

  // Determine button states based on invoice status
  const getButtonStates = () => {
    if (!invoice) return { save: false, confirmDraft: false, issue: false, post: false };
    
    const status = invoice.status;
    
    // Define workflow order
    const statusOrder = ['imported', 'edited', 'draft', 'issued', 'posted'];
    const currentStatusIndex = statusOrder.indexOf(status);
    const draftIndex = statusOrder.indexOf('draft');
    const issuedIndex = statusOrder.indexOf('issued');
    const postedIndex = statusOrder.indexOf('posted');
    
    return {
      save: currentStatusIndex >= draftIndex || processingButtons.save,
      confirmDraft: currentStatusIndex >= draftIndex || processingButtons.confirmDraft,
      issue: currentStatusIndex >= issuedIndex || processingButtons.issue,
      post: currentStatusIndex >= postedIndex || processingButtons.post
    };
  };

  // Check if editing is allowed based on invoice status
  const isEditingAllowed = () => {
    if (!invoice) return false;
    const editableStatuses = ['imported', 'edited', 'draft'];
    return editableStatuses.includes(invoice.status);
  };

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) setUser(JSON.parse(userStr));
    loadCompanies();
    loadInvoice();
    loadAllCustomers();
  }, [id]);

  const loadCompanies = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/companies`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCompanies(response.data);
    } catch (error) {
      console.error('Failed to load companies:', error);
    }
  };

  const loadInvoice = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/invoices/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInvoice(response.data.invoice);
      setLines(response.data.lines);
      
      // Load customer details to get their company and default unit price
      if (response.data.invoice.customerId) {
        const customerResponse = await axios.get(
          `${BACKEND_URL}/api/customers/${response.data.invoice.customerId}`,
          { headers: { Authorization: `Bearer ${token}` }}
        );
        setSelectedCompanyId(customerResponse.data.companyId || '');
        setCustomerDefaultUnitPrice(customerResponse.data.unitPrice || 0);
        setCustomerDetails(customerResponse.data);
      }
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
    setProcessingButtons(prev => ({ ...prev, save: true }));
    try {
      const token = localStorage.getItem('access_token');
      await axios.put(
        `${BACKEND_URL}/api/invoices/${id}`,
        { 
          number: invoice.number, 
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          periodFrom: invoice.periodFrom,
          periodTo: invoice.periodTo,
          lines 
        },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success('Invoice saved');
      loadInvoice();
      
      // Notify BatchDetail to reload invoices
      window.dispatchEvent(new Event('invoiceUpdated'));
    } catch (error) {
      toast.error('Failed to save invoice');
      setProcessingButtons(prev => ({ ...prev, save: false }));
    } finally {
      setSaving(false);
    }
  };


  const handleConfirmDraft = async () => {
    setProcessingButtons(prev => ({ 
      ...prev, 
      save: true,
      confirmDraft: true 
    }));
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
      setProcessingButtons(prev => ({ 
        ...prev, 
        save: false,
        confirmDraft: false 
      }));
    }
  };

  const handleIssueInvoice = async () => {
    if (user?.role !== 'ADMIN') {
      toast.error('Only admins can issue invoices');
      return;
    }

    if (!window.confirm('Issue this invoice? This will mark it as issued.')) return;

    setProcessingButtons(prev => ({ 
      ...prev, 
      save: true,
      confirmDraft: true,
      issue: true 
    }));
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
      setProcessingButtons(prev => ({ 
        ...prev, 
        save: false,
        confirmDraft: false,
        issue: false 
      }));
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

    setProcessingButtons(prev => ({ 
      ...prev, 
      save: true,
      confirmDraft: true,
      issue: true,
      post: true 
    }));

    try {
      const token = localStorage.getItem('access_token');
      
      // Build complete e-računi API request structure for debugging
      const eracuniItems = lines.map(line => ({
        description: line.description || "Services",
        productCode: "000001",
        quantity: line.quantity,
        unit: "h",
        netPrice: line.unitPrice
      }));
      
      const eracuniRequest = {
        username: "ERACUNAPI",
        secretKey: "4df213a39d7acbc16cc0f58444D363cb",
        token: "E746E154C9F2D00DB0379EF30737090A",
        method: "SalesInvoiceCreate",
        parameters: {
          SalesInvoice: {
            status: "IssuedInvoice",
            dateOfSupplyFrom: invoice.invoiceDate,
            date: invoice.invoiceDate,
            documentCurrency: "EUR",
            documentLanguage: "English",
            vatTransactionType: "0",
            type: "Gross",
            methodOfPayment: "BankTransfer",
            buyerName: invoice.customerName || "",
            buyerStreet: "",
            buyerPostalCode: "",
            buyerCity: "",
            buyerCountry: "SI",
            buyerEMail: "",
            buyerPhone: "",
            buyerCode: "",
            buyerDocumentID: "",
            buyerTaxNumber: "",
            buyerVatRegistration: "None",
            Items: eracuniItems,
            city: "Nova Gorica"
          }
        }
      };
      
      // Store complete API debug data
      setApiDebugData({
        request: eracuniRequest,
        response: null,
        timestamp: new Date().toISOString()
      });
      
      const response = await axios.post(
        `${BACKEND_URL}/api/invoices/${id}/post`,
        {},
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      // Update debug data with response
      setApiDebugData(prev => ({
        ...prev,
        response: response.data
      }));
      
      toast.success(`Invoice posted: ${response.data.externalNumber}`);
      loadInvoice();
    } catch (error) {
      console.error('Post to e-računi error:', error);
      
      // Store detailed error response
      const errorDetails = {
        error: error.response?.data?.detail || error.message,
        statusCode: error.response?.status,
        timestamp: new Date().toISOString(),
        fullError: error.response?.data || error.message
      };
      
      setApiDebugData(prev => ({
        ...prev,
        response: errorDetails
      }));
      
      setProcessingButtons(prev => ({ 
        ...prev, 
        save: false,
        confirmDraft: false,
        issue: false,
        post: false 
      }));
      
      toast.error(`Failed to post invoice: ${error.response?.data?.detail || error.message}`);
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
    const newLine = {
      id: `new-${Date.now()}`,
      invoiceId: id,
      description: '',
      quantity: 1,
      unitPrice: customerDefaultUnitPrice || 0,
      amount: customerDefaultUnitPrice || 0,
      taxCode: null
    };
    // Add new line at the beginning (first row) instead of at the end
    setLines([newLine, ...lines]);
    
    // Show a toast notification if default price was applied
    if (customerDefaultUnitPrice > 0) {
      toast.info(`Default unit price ${formatEuro(customerDefaultUnitPrice)} applied from customer settings`);
    }
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
  // Note: Invoice number is automatically set when posting to e-računi

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
                disabled={!isEditingAllowed()}
                data-testid="ai-toggle" 
              />
            </div>
            <Button 
              onClick={handleSave} 
              disabled={saving || !isEditingAllowed() || getButtonStates().save} 
              className="rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed" 
              data-testid="save-invoice-button"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button 
              onClick={handleConfirmDraft} 
              disabled={invoice.status === 'posted' || getButtonStates().confirmDraft}
              className="rounded-full bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="confirm-draft-button"
            >
              <FileCheck className="w-4 h-4 mr-2" />
              Confirm Draft
            </Button>
            {user?.role === 'ADMIN' && (
              <>
                <Button 
                  onClick={handleIssueInvoice} 
                  disabled={invoice.status === 'posted' || getButtonStates().issue}
                  className="rounded-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed" 
                  data-testid="issue-invoice-button"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Issue Invoice
                </Button>
                <Button 
                  onClick={handlePost}
                  disabled={invoice.status === 'posted' || getButtonStates().post}
                  className="rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed" 
                  data-testid="post-eracuni-button"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Post to eRačuni
                </Button>
                <Button 
                  onClick={() => setShowApiDebugModal(true)}
                  disabled={!apiDebugData}
                  variant="outline"
                  className="rounded-full"
                  data-testid="view-api-invoice-button"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  View API
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
                  placeholder="Will be set after posting to e-računi"
                  disabled={true}
                  readOnly={true}
                  className="bg-slate-50 cursor-not-allowed"
                  data-testid="invoice-number-input"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Invoice number is automatically assigned when posting to e-računi
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="invoiceDate">Invoice Date</Label>
                  <Input
                    id="invoiceDate"
                    type="date"
                    value={invoice.invoiceDate}
                    onChange={(e) => setInvoice({...invoice, invoiceDate: e.target.value})}
                    disabled={!isEditingAllowed()}
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
                    disabled={!isEditingAllowed()}
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
                    disabled={!isEditingAllowed()}
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
                    disabled={!isEditingAllowed()}
                    data-testid="period-to-input"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={invoice.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-full">
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
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Customer:</span>
                <button
                  onClick={() => navigate(`/customers/${invoice.customerId}`)}
                  className="font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors"
                  title="View customer details"
                >
                  {invoice.customerName}
                </button>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Company:</span>
                <select
                  value={selectedCompanyId}
                  disabled
                  className="w-48 h-9 px-3 rounded-md border border-input bg-slate-50 text-sm font-bold ring-offset-background cursor-not-allowed"
                >
                  <option value="">No Company</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Customer Statistics */}
              {customerDetails && (
                <>
                  <div className="flex justify-between pt-2 border-t border-slate-200">
                    <span className="text-slate-600 text-sm">Default Unit Price:</span>
                    <span className="font-semibold text-slate-800 text-sm">{formatEuro(customerDetails.unitPrice || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 text-sm">Total Invoices:</span>
                    <span className="font-semibold text-slate-800 text-sm">{customerDetails.invoiceCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 text-sm">Total Invoiced:</span>
                    <span className="font-semibold text-green-600 text-sm">{formatEuro(customerDetails.totalInvoiced || 0)}</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b border-slate-200">
                    <span className="text-slate-600 text-sm">Avg Invoice:</span>
                    <span className="font-semibold text-blue-600 text-sm">{formatEuro(customerDetails.averageInvoice || 0)}</span>
                  </div>
                </>
              )}
              
              <div className="flex justify-between">
                <span className="text-slate-600">Line Items:</span>
                <span className="font-semibold text-slate-800">{lines.length}</span>
              </div>
              <div className="flex justify-between pt-3 border-t border-slate-200">
                <span className="text-lg font-bold text-slate-800">Total:</span>
                <span className="text-2xl font-bold text-blue-600">{formatEuro(total)}</span>
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
              disabled={!isEditingAllowed()}
              size="sm" 
              variant="outline" 
              className="rounded-full disabled:opacity-50 disabled:cursor-not-allowed" 
              data-testid="add-line-button"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Line
            </Button>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={lines.map(line => line.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {lines.map((line, index) => (
                  <SortableLineItem
                    key={line.id}
                    line={line}
                    index={index}
                    invoice={invoice}
                    aiEnabled={aiEnabled}
                    lines={lines}
                    allCustomers={allCustomers}
                    showMoveDropdown={showMoveDropdown}
                    setShowMoveDropdown={setShowMoveDropdown}
                    movingLine={movingLine}
                    customerSearch={customerSearch}
                    setCustomerSearch={setCustomerSearch}
                    updateLine={updateLine}
                    removeLine={removeLine}
                    handleAISuggestion={handleAISuggestion}
                    handleMoveLineItem={handleMoveLineItem}
                    moveLineUp={moveLineUp}
                    moveLineDown={moveLineDown}
                    isEditingAllowed={isEditingAllowed()}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      {/* API Debug Modal */}
      {showApiDebugModal && apiDebugData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  <h3 className="text-xl font-bold">e-računi API Debug</h3>
                </div>
                <button
                  onClick={() => setShowApiDebugModal(false)}
                  className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-100px)]">
              {/* Invoice Details */}
              <div className="mb-6">
                <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs">1</span>
                  Invoice Information
                </h4>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 min-w-32">Customer:</span>
                      <code className="text-slate-800 font-mono">{apiDebugData.request?.parameters?.SalesInvoice?.buyerName || 'N/A'}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 min-w-32">Invoice Number:</span>
                      <code className="text-slate-800 font-mono">{invoice.number || 'Not set'}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 min-w-32">Invoice Date:</span>
                      <code className="text-slate-800 font-mono">{apiDebugData.request?.parameters?.SalesInvoice?.date}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 min-w-32">Line Items:</span>
                      <code className="text-slate-800 font-mono">{apiDebugData.request?.parameters?.SalesInvoice?.Items?.length || 0}</code>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expected API Call */}
              <div className="mb-6">
                <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-xs">2</span>
                  e-računi API Call (SalesInvoiceCreate)
                </h4>
                <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-green-400 text-xs font-mono">
{JSON.stringify(apiDebugData.request, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Backend Response */}
              <div className="mb-2">
                <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs">3</span>
                  e-računi Response
                </h4>
                <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-blue-400 text-xs font-mono">
{JSON.stringify(apiDebugData.response, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceDetail;