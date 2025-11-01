import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Save, Zap, Check, X, Sparkles, Eye, EyeOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// AddCustomerForm Component
const AddCustomerForm = () => {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    companyId: '',
    unitPrice: 0
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadCompanies();
  }, []);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Customer name is required');
      return;
    }

    setCreating(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${BACKEND_URL}/api/customers`,
        formData,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      toast.success('Customer created successfully!');
      
      // Reset form
      setFormData({
        name: '',
        companyId: '',
        unitPrice: 0
      });
    } catch (error) {
      if (error.response?.status === 400) {
        toast.error(error.response.data.detail || 'Customer already exists');
      } else if (error.response?.status === 401) {
        toast.error('Session expired. Please log in again.');
        setTimeout(() => navigate('/login'), 2000);
      } else {
        toast.error('Failed to create customer');
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Customer Name */}
        <div className="space-y-2">
          <Label htmlFor="customer-name">Customer Name *</Label>
          <Input
            id="customer-name"
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            placeholder="Enter customer name"
            required
          />
        </div>

        {/* Company */}
        <div className="space-y-2">
          <Label htmlFor="customer-company">Company (Optional)</Label>
          <select
            id="customer-company"
            value={formData.companyId}
            onChange={(e) => setFormData({...formData, companyId: e.target.value})}
            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">No Company</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        {/* Unit Price */}
        <div className="space-y-2">
          <Label htmlFor="customer-unit-price">Unit Price (€)</Label>
          <Input
            id="customer-unit-price"
            type="number"
            step="0.01"
            min="0"
            value={formData.unitPrice}
            onChange={(e) => setFormData({...formData, unitPrice: parseFloat(e.target.value) || 0})}
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={creating || !formData.name.trim()}
          className="rounded-full bg-indigo-600 hover:bg-indigo-700"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {creating ? 'Creating...' : 'Create Customer'}
        </Button>
      </div>
    </form>
  );
};

// TariffCodesSection Component
const TariffCodesSection = () => {
  const [tariffs, setTariffs] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [editedTariffs, setEditedTariffs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTariff, setNewTariff] = useState({ code: '', description: '', value: 0 });
  const [focusedField, setFocusedField] = useState(null); // Track which field is being edited

  useEffect(() => {
    loadTariffs();
  }, []);

  const loadTariffs = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/tariffs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTariffs(response.data);
    } catch (error) {
      toast.error('Failed to load tariffs');
      console.error('Tariff load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatEuro = (number) => {
    if (number === null || number === undefined || number === '') return '0,00';
    const num = parseFloat(number);
    if (isNaN(num)) return '0,00';
    const fixed = num.toFixed(2);
    const [integer, decimal] = fixed.split('.');
    const withThousands = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${withThousands},${decimal}`;
  };

  const parseEuro = (value) => {
    if (!value) return 0;
    // Remove thousand separators (.) and replace decimal comma (,) with dot
    const normalized = value.toString().replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  };

  const handleFieldChange = (code, field, value) => {
    setEditedTariffs({
      ...editedTariffs,
      [code]: {
        ...(editedTariffs[code] || {}),
        [field]: value
      }
    });
  };

  const handleSaveTariff = async (tariff) => {
    if (!editedTariffs[tariff.code]) return;

    setSaving(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.put(
        `${BACKEND_URL}/api/tariffs/${encodeURIComponent(tariff.code)}`,
        editedTariffs[tariff.code],
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      toast.success('Tariff updated');
      
      // Update local state
      setTariffs(tariffs.map(t => 
        t.code === tariff.code 
          ? { ...t, ...editedTariffs[tariff.code] }
          : t
      ));
      
      // Clear edited state
      const newEdited = { ...editedTariffs };
      delete newEdited[tariff.code];
      setEditedTariffs(newEdited);
      
    } catch (error) {
      toast.error('Failed to update tariff');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTariff = async () => {
    if (!newTariff.code.trim()) {
      toast.error('Tariff code is required');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${BACKEND_URL}/api/tariffs`,
        newTariff,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      toast.success('Tariff added successfully');
      setNewTariff({ code: '', description: '', value: 0 });
      setShowAddForm(false);
      loadTariffs(); // Reload list
      
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add tariff');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = (code) => {
    return editedTariffs[code] && Object.keys(editedTariffs[code]).length > 0;
  };

  if (loading) {
    return (
      <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-slate-200 mb-6">
        <p className="text-slate-600">Loading tariffs...</p>
      </div>
    );
  }

  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-slate-200 mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between cursor-pointer group"
      >
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h2 className="text-xl font-bold text-slate-800">Tariff Codes</h2>
          <span className="text-xs text-slate-500">({tariffs.length} tariffs)</span>
        </div>
        
        <svg 
          className={`w-5 h-5 text-slate-600 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-6">
          <p className="text-sm text-slate-600 mb-4">
            Manage tariff codes used in XLSX imports
          </p>

          {/* Add New Tariff Button */}
          <div className="mb-4">
            <Button
              onClick={() => setShowAddForm(!showAddForm)}
              size="sm"
              className="rounded-full bg-indigo-600 hover:bg-indigo-700"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add New Tariff
            </Button>
          </div>

          {/* Add Tariff Form */}
          {showAddForm && (
            <div className="mb-4 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
              <h4 className="text-sm font-bold text-indigo-800 mb-3">New Tariff</h4>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <Input
                    placeholder="Code (e.g., 001 - Računovodstvo)"
                    value={newTariff.code}
                    onChange={(e) => setNewTariff({ ...newTariff, code: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Input
                    placeholder="Description"
                    value={newTariff.description}
                    onChange={(e) => setNewTariff({ ...newTariff, description: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Input
                    placeholder="Value (€)"
                    type="text"
                    value={
                      focusedField === 'new-tariff-value'
                        ? (newTariff.value || 0)
                        : formatEuro(newTariff.value)
                    }
                    onChange={(e) => {
                      const rawValue = e.target.value.replace(/[^0-9,.]/g, '');
                      setNewTariff({ ...newTariff, value: rawValue });
                    }}
                    onFocus={(e) => {
                      setFocusedField('new-tariff-value');
                      e.target.select();
                    }}
                    onBlur={(e) => {
                      setFocusedField(null);
                      const parsedValue = parseEuro(e.target.value);
                      setNewTariff({ ...newTariff, value: parsedValue });
                    }}
                    className="text-sm text-right"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddTariff}
                  disabled={!newTariff.code.trim() || saving}
                  size="sm"
                  className="rounded-full bg-indigo-600 hover:bg-indigo-700"
                >
                  Add Tariff
                </Button>
                <Button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewTariff({ code: '', description: '', value: 0 });
                  }}
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Tariff List */}
          <div className="space-y-2">
            {tariffs.map((tariff) => {
              const edited = editedTariffs[tariff.code] || {};
              const currentData = { ...tariff, ...edited };
              
              return (
                <div key={tariff.code} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    {/* Tariff Code (Read-only) */}
                    <div>
                      <label className="text-xs text-slate-600 block mb-1">Tariff Code</label>
                      <Input
                        value={tariff.code}
                        disabled
                        className="bg-white font-mono font-semibold text-indigo-700"
                      />
                    </div>

                    {/* Description (Editable) */}
                    <div>
                      <label className="text-xs text-slate-600 block mb-1">Description</label>
                      <Input
                        value={currentData.description}
                        onChange={(e) => handleFieldChange(tariff.code, 'description', e.target.value)}
                        placeholder="Tariff description"
                      />
                    </div>

                    {/* Value (Editable) */}
                    <div>
                      <label className="text-xs text-slate-600 block mb-1">Value (€)</label>
                      <Input
                        type="text"
                        value={
                          focusedField === `${tariff.code}-value`
                            ? (editedTariffs[tariff.code]?.value !== undefined ? editedTariffs[tariff.code].value : tariff.value || 0)
                            : formatEuro(currentData.value)
                        }
                        onChange={(e) => {
                          const rawValue = e.target.value.replace(/[^0-9,.]/g, '');
                          handleFieldChange(tariff.code, 'value', rawValue);
                        }}
                        onFocus={(e) => {
                          setFocusedField(`${tariff.code}-value`);
                          e.target.select();
                        }}
                        onBlur={(e) => {
                          setFocusedField(null);
                          // Parse and normalize the value on blur
                          const parsedValue = parseEuro(e.target.value);
                          handleFieldChange(tariff.code, 'value', parsedValue);
                        }}
                        placeholder="0,00"
                        className="text-right"
                      />
                    </div>

                    {/* Save Button */}
                    <div>
                      <Button
                        onClick={() => handleSaveTariff(tariff)}
                        disabled={!hasChanges(tariff.code) || saving}
                        className="rounded-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                        size="sm"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// EmployeeCostsSection Component
const EmployeeCostsSection = () => {
  const [employees, setEmployees] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [editedEmployees, setEditedEmployees] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/employee-costs?archived=false`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Employees loaded:', response.data);
      setEmployees(response.data);
    } catch (error) {
      toast.error('Failed to load employees');
      console.error('Employee load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (employeeName, value) => {
    setEditedEmployees({
      ...editedEmployees,
      [employeeName]: value
    });
  };

  const handleSaveEmployee = async (employee) => {
    if (editedEmployees[employee.employee_name] === undefined) return;

    setSaving(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${BACKEND_URL}/api/employee-costs`,
        {
          employee_name: employee.employee_name,
          cost: editedEmployees[employee.employee_name]
        },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      toast.success('Employee cost updated');
      
      // Update local state
      setEmployees(employees.map(e => 
        e.employee_name === employee.employee_name 
          ? { ...e, cost: editedEmployees[employee.employee_name] }
          : e
      ));
      
      // Clear edited state
      const newEdited = { ...editedEmployees };
      delete newEdited[employee.employee_name];
      setEditedEmployees(newEdited);
      
    } catch (error) {
      toast.error('Failed to update employee cost');
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveEmployee = async (employee) => {
    if (!window.confirm(`Are you sure you want to archive ${employee.employee_name}? This will hide them from the list.`)) {
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.put(
        `${BACKEND_URL}/api/employee-costs/${encodeURIComponent(employee.employee_name)}/archive`,
        {},
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      toast.success('Employee archived');
      
      // Remove from local state
      setEmployees(employees.filter(e => e.employee_name !== employee.employee_name));
      
    } catch (error) {
      toast.error('Failed to archive employee');
    } finally {
      setSaving(false);
    }
  };

  const formatEuro = (number) => {
    if (number === null || number === undefined || number === '') return '';
    const num = parseFloat(number);
    if (isNaN(num)) return '';
    const fixed = num.toFixed(2);
    const [integer, decimal] = fixed.split('.');
    const withThousands = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${withThousands},${decimal}`;
  };

  const parseEuro = (value) => {
    if (!value) return null;
    // Remove thousand separators (.) and replace decimal comma (,) with dot
    const normalized = value.toString().replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? null : parsed;
  };

  const hasChanges = (employeeName) => {
    return editedEmployees[employeeName] !== undefined;
  };

  if (loading) {
    return (
      <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-slate-200 mb-6">
        <p className="text-slate-600">Loading employees...</p>
      </div>
    );
  }

  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-slate-200 mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between cursor-pointer group"
      >
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-bold text-slate-800">Costs</h2>
          <span className="text-xs text-slate-500">({employees.length} employees)</span>
        </div>
        
        <svg 
          className={`w-5 h-5 text-slate-600 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-6">
          <p className="text-sm text-slate-600 mb-6">
            Manage employee cost settings. Employees are automatically extracted from XLSX imports.
          </p>

          <div className="space-y-2">
            {employees.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No employees found. Import an XLSX file to populate the list.</p>
            ) : (
              employees.map((employee) => {
                const edited = editedEmployees[employee.employee_name];
                const currentCost = edited !== undefined ? edited : employee.cost;
                
                return (
                  <div key={employee.employee_name} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                      {/* Employee Name (Read-only) */}
                      <div>
                        <Label className="text-xs text-slate-600">Employee Name</Label>
                        <Input
                          value={employee.employee_name}
                          disabled
                          className="bg-white font-medium"
                        />
                      </div>

                      {/* Cost (Editable) */}
                      <div>
                        <Label className="text-xs text-slate-600">Cost (€)</Label>
                        <Input
                          type="text"
                          value={currentCost !== null ? formatEuro(currentCost) : ''}
                          onChange={(e) => handleFieldChange(employee.employee_name, parseEuro(e.target.value))}
                          placeholder="0,00"
                          className="text-right"
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleSaveEmployee(employee)}
                          disabled={!hasChanges(employee.employee_name) || saving}
                          className="rounded-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
                          size="sm"
                        >
                          <Save className="w-4 h-4 mr-2" />
                          Save
                        </Button>
                        <Button
                          onClick={() => handleArchiveEmployee(employee)}
                          disabled={saving}
                          variant="outline"
                          className="rounded-full"
                          size="sm"
                        >
                          Archive
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ArticleCodesSection Component
const ArticleCodesSection = () => {
  const [articles, setArticles] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [editedArticles, setEditedArticles] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newArticle, setNewArticle] = useState({ 
    code: '', 
    description: '', 
    unitMeasure: 'kos',
    priceWithoutVAT: 0,
    vatPercentage: 22
  });

  useEffect(() => {
    loadArticles();
  }, []);

  const loadArticles = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/articles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setArticles(response.data);
    } catch (error) {
      toast.error('Failed to load articles');
      console.error('Article load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (code, field, value) => {
    setEditedArticles({
      ...editedArticles,
      [code]: {
        ...(editedArticles[code] || {}),
        [field]: value
      }
    });
  };

  const handleSaveArticle = async (article) => {
    if (!editedArticles[article.code]) return;

    setSaving(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.put(
        `${BACKEND_URL}/api/articles/${article.code}`,
        editedArticles[article.code],
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      toast.success('Article updated');
      
      // Update local state
      setArticles(articles.map(a => 
        a.code === article.code 
          ? { ...a, ...editedArticles[article.code] }
          : a
      ));
      
      // Clear edited state
      const newEdited = { ...editedArticles };
      delete newEdited[article.code];
      setEditedArticles(newEdited);
      
    } catch (error) {
      toast.error('Failed to update article');
    } finally {
      setSaving(false);
    }
  };

  const handleAddArticle = async () => {
    if (!newArticle.code.trim()) {
      toast.error('Article code is required');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${BACKEND_URL}/api/articles`,
        newArticle,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      toast.success('Article added successfully');
      setNewArticle({ 
        code: '', 
        description: '', 
        unitMeasure: 'kos',
        priceWithoutVAT: 0,
        vatPercentage: 22
      });
      setShowAddForm(false);
      loadArticles(); // Reload list
      
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add article');
    } finally {
      setSaving(false);
    }
  };

  const formatEuro = (number) => {
    const num = parseFloat(number);
    if (isNaN(num)) return '0,00';
    const fixed = num.toFixed(2);
    const [integer, decimal] = fixed.split('.');
    const withThousands = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${withThousands},${decimal}`;
  };

  const parseEuro = (value) => {
    if (!value) return 0;
    const normalized = value.toString().replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  };

  const hasChanges = (code) => {
    return editedArticles[code] && Object.keys(editedArticles[code]).length > 0;
  };

  if (loading) {
    return (
      <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-slate-200 mb-6">
        <p className="text-slate-600">Loading articles...</p>
      </div>
    );
  }

  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-slate-200 mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between cursor-pointer group"
      >
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <h2 className="text-xl font-bold text-slate-800">Article Codes</h2>
          <span className="text-xs text-slate-500">({articles.length} articles)</span>
        </div>
        
        <svg 
          className={`w-5 h-5 text-slate-600 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-6">
          <p className="text-sm text-slate-600 mb-4">
            Manage e-računi article codes and pricing
          </p>

          {/* Add New Article Button */}
          <div className="mb-4">
            <Button
              onClick={() => setShowAddForm(!showAddForm)}
              size="sm"
              className="rounded-full bg-purple-600 hover:bg-purple-700"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add New Article
            </Button>
          </div>

          {/* Add Article Form */}
          {showAddForm && (
            <div className="mb-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
              <h4 className="text-sm font-bold text-purple-800 mb-3">New Article</h4>
              <div className="grid grid-cols-5 gap-3 mb-3">
                <div>
                  <Input
                    placeholder="Code (e.g., 000046)"
                    value={newArticle.code}
                    onChange={(e) => setNewArticle({ ...newArticle, code: e.target.value })}
                    className="text-sm font-mono"
                  />
                </div>
                <div>
                  <Input
                    placeholder="Description"
                    value={newArticle.description}
                    onChange={(e) => setNewArticle({ ...newArticle, description: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Input
                    placeholder="Unit"
                    value={newArticle.unitMeasure}
                    onChange={(e) => setNewArticle({ ...newArticle, unitMeasure: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Input
                    placeholder="Price (€)"
                    type="text"
                    value={
                      focusedField === 'new-article-price'
                        ? (newArticle.priceWithoutVAT || 0)
                        : formatEuro(newArticle.priceWithoutVAT)
                    }
                    onChange={(e) => {
                      const rawValue = e.target.value.replace(/[^0-9,.]/g, '');
                      setNewArticle({ ...newArticle, priceWithoutVAT: rawValue });
                    }}
                    onFocus={(e) => {
                      setFocusedField('new-article-price');
                      e.target.select();
                    }}
                    onBlur={(e) => {
                      setFocusedField(null);
                      const parsedValue = parseEuro(e.target.value);
                      setNewArticle({ ...newArticle, priceWithoutVAT: parsedValue });
                    }}
                    className="text-sm text-right"
                  />
                </div>
                <div>
                  <Input
                    placeholder="VAT %"
                    type="number"
                    value={newArticle.vatPercentage}
                    onChange={(e) => setNewArticle({ ...newArticle, vatPercentage: parseFloat(e.target.value) || 0 })}
                    className="text-sm text-right"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddArticle}
                  disabled={!newArticle.code.trim() || saving}
                  size="sm"
                  className="rounded-full bg-purple-600 hover:bg-purple-700"
                >
                  Add Article
                </Button>
                <Button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewArticle({ 
                      code: '', 
                      description: '', 
                      unitMeasure: 'kos',
                      priceWithoutVAT: 0,
                      vatPercentage: 22
                    });
                  }}
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Article List */}
          <div className="space-y-2">
            {articles.map((article) => {
              const edited = editedArticles[article.code] || {};
              const currentData = { ...article, ...edited };
              
              return (
                <div key={article.code} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                    {/* Article Code (Read-only) */}
                    <div>
                      <label className="text-xs text-slate-600 block mb-1">Article Code</label>
                      <Input
                        value={article.code}
                        disabled
                        className="bg-white font-mono font-semibold text-purple-700"
                      />
                    </div>

                    {/* Description (Editable) */}
                    <div className="md:col-span-2">
                      <label className="text-xs text-slate-600 block mb-1">Description</label>
                      <Input
                        value={currentData.description}
                        onChange={(e) => handleFieldChange(article.code, 'description', e.target.value)}
                        placeholder="Article description"
                      />
                    </div>

                    {/* Unit Measure (Editable) */}
                    <div>
                      <label className="text-xs text-slate-600 block mb-1">Unit (EM)</label>
                      <Input
                        value={currentData.unitMeasure}
                        onChange={(e) => handleFieldChange(article.code, 'unitMeasure', e.target.value)}
                        placeholder="kos, ur"
                      />
                    </div>

                    {/* Price without VAT (Editable) */}
                    <div>
                      <label className="text-xs text-slate-600 block mb-1">Price (€)</label>
                      <Input
                        type="text"
                        value={
                          focusedField === `${article.code}-price`
                            ? (editedArticles[article.code]?.priceWithoutVAT !== undefined ? editedArticles[article.code].priceWithoutVAT : article.priceWithoutVAT || 0)
                            : formatEuro(currentData.priceWithoutVAT)
                        }
                        onChange={(e) => {
                          const rawValue = e.target.value.replace(/[^0-9,.]/g, '');
                          handleFieldChange(article.code, 'priceWithoutVAT', rawValue);
                        }}
                        onFocus={(e) => {
                          setFocusedField(`${article.code}-price`);
                          e.target.select();
                        }}
                        onBlur={(e) => {
                          setFocusedField(null);
                          const parsedValue = parseEuro(e.target.value);
                          handleFieldChange(article.code, 'priceWithoutVAT', parsedValue);
                        }}
                        placeholder="0,00"
                        className="text-right"
                      />
                    </div>

                    {/* Save Button */}
                    <div>
                      <Button
                        onClick={() => handleSaveArticle(article)}
                        disabled={!hasChanges(article.code) || saving}
                        className="rounded-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                        size="sm"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const Settings = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testingEracuni, setTestingEracuni] = useState(false);
  const [eracuniTestResult, setEracuniTestResult] = useState(null);
  const [aiTestPrompt, setAiTestPrompt] = useState('');
  const [showEracuniCreds, setShowEracuniCreds] = useState(false);
  const [showApiDebugModal, setShowApiDebugModal] = useState(false);
  const [apiDebugData, setApiDebugData] = useState(null);
  
  // Collapsible tiles state
  const [aiProviderExpanded, setAiProviderExpanded] = useState(false);
  const [aiPromptsExpanded, setAiPromptsExpanded] = useState(false);
  const [eracuniExpanded, setEracuniExpanded] = useState(false);
  
  // Prompt testing states
  const [testInputs, setTestInputs] = useState({
    grammar: '',
    fraud: '',
    gdpr: '',
    verification: ''
  });
  const [testResults, setTestResults] = useState({
    grammar: null,
    fraud: null,
    gdpr: null,
    verification: null
  });
  const [testingPrompt, setTestingPrompt] = useState(null);
  
  const [settings, setSettings] = useState({
    aiProvider: 'emergent',
    customApiKey: '',
    customModel: 'gpt-5',
    grammarPrompt: 'Fix grammar and spelling errors in this invoice text. Return only the corrected text without explanations.',
    fraudPrompt: 'Analyze this invoice description for potential fraud indicators or suspicious patterns. Provide a brief risk assessment.',
    gdprPrompt: 'Identify and mask any personal data (names, emails, phone numbers, addresses) in this text. Return the masked version with [REDACTED] in place of sensitive data.',
    verificationPrompt: 'Analyze this work description for suspicious patterns, irregularities, or fraud indicators. Look for: vague descriptions, unusual time patterns, duplicate entries, inconsistent work details. If suspicious, respond with JSON: {"flagged": true, "reason": "brief explanation"}. If normal, respond with: {"flagged": false, "reason": ""}',
    eracuniEndpoint: 'https://e-racuni.com/WebServicesSI/API',
    eracuniUsername: '',
    eracuniSecretKey: '',
    eracuniToken: ''
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/settings/ai`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSettings({...settings, ...response.data});
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(`${BACKEND_URL}/api/settings/ai`, settings, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Settings saved successfully');
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error('Session expired. Please log in again.');
        setTimeout(() => navigate('/login'), 2000);
      } else {
        toast.error('Failed to save settings');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    
    // Use test prompt if provided, otherwise use default
    const testPromptText = aiTestPrompt || "Hello, this is a connection test. Please respond with 'OK'.";
    
    // Easter egg: Special response for Tjaša variants (tjaš* or tjas*) + number 67
    const words = testPromptText.toLowerCase().split(/\s+/);
    const containsTjasa = words.some(word => 
      word.startsWith('tjaš') || word.startsWith('tjas')
    );
    const contains67 = /\b67\b/.test(testPromptText);
    
    if (containsTjasa && contains67) {
      // Detect language (simple check - if contains Slovenian characters or common words)
      const isSlovenian = /[čšž]/i.test(testPromptText) || 
                          /\b(kaj|kdo|kako|zakaj|je|si|ste|sem)\b/i.test(testPromptText);
      
      // Randomized compliments pool - Slovenian
      const complimentsSL = [
        '🌟 Neverjetna mama, ki daje vse z ljubeznijo in toplino',
        '💝 Najboljša sodelavka, kakršno si lahko želiš - resnično najboljša od najboljših',
        '💪 Prava borka, a hkrati izjemno prisrčna in topla',
        '✨ Izredno pozitivna oseba, ki širi dobre vibracije vsem okoli sebe',
        '😊 Njen nasmeh je neodoljiv in nalezljiv - razsvetli vsak prostor',
        '⭐ Prava zvezda, ki žari v vsem kar počne',
        '💖 Oseba z zlatim srcem in najlepšo dušo',
        '🦋 Ljubka, skrbna in popolnoma čudovita',
        '🌸 Ostani takšna kot si - popolna si!',
        '🏆 Zaposlena, o kakršni lahko samo sanjaš - absolutno najboljša',
        '🌈 Prinašaš barve in veselje v življenje vseh',
        '💫 Edinstven človek, ki pusti vtis kamorkoli pride',
        '🌺 Tvoja predanost in ljubezen navdihujeta vse okrog tebe',
        '✨ Skrivnost uspeha našega tima - nepogrešljiva'
      ];
      
      // Randomized compliments pool - English
      const complimentsEN = [
        '🌟 An incredible mom who gives everything with love and warmth',
        '💝 The best coworker you could ever wish for - truly the best of the best',
        '💪 A real fighter, yet incredibly hearty and warm',
        '✨ Extremely positive person who spreads good vibes to everyone around',
        '😊 Her smile is addictive and contagious - lights up every room',
        '⭐ A true star who shines in everything she does',
        '💖 A person with a heart of gold and the most beautiful soul',
        '🦋 Lovely, caring, and absolutely wonderful',
        '🌸 Stay as you are - you are perfect!',
        '🏆 The kind of employee you can only dream of - absolutely the best',
        '🌈 Brings colors and joy into everyone\'s life',
        '💫 A unique person who leaves an impression wherever she goes',
        '🌺 Your dedication and love inspire everyone around you',
        '✨ The secret to our team\'s success - irreplaceable'
      ];
      
      const compliments = isSlovenian ? complimentsSL : complimentsEN;
      
      // Shuffle and pick 8-10 random compliments
      const shuffled = [...compliments].sort(() => Math.random() - 0.5);
      const selectedCompliments = shuffled.slice(0, 8 + Math.floor(Math.random() * 3));
      
      // Create title variants
      const titlesSL = [
        '💖 Tjaša - Resnično Dragocena Duša 💖',
        '✨ Tjaša - Izjemna Oseba ✨',
        '🌟 Tjaša - Enkratna Duša 🌟',
        '💝 Tjaša - Absolutno Najboljša 💝'
      ];
      
      const titlesEN = [
        '💖 Tjaša - A Truly Precious Soul 💖',
        '✨ Tjaša - An Extraordinary Person ✨',
        '🌟 Tjaša - A Remarkable Soul 🌟',
        '💝 Tjaša - Absolutely The Best 💝'
      ];
      
      const titles = isSlovenian ? titlesSL : titlesEN;
      const randomTitle = titles[Math.floor(Math.random() * titles.length)];
      
      // Closing messages
      const closingsSL = [
        'Tjaša, resnično si posebna in globoko cenjena! ❤️💫',
        'Draga Tjaša, tvoj čudoviti duh razsvetljuje vsak prostor! 🌟',
        'Ljubka Tjaša, blagoslov si! 💫',
        'Tjaša, hvala, da si takšna kot si! 💕✨'
      ];
      
      const closingsEN = [
        'Tjaša, you are truly special and deeply appreciated! ❤️💫',
        'Dear Tjaša, your beautiful spirit lights up every room! 🌟',
        'Sweet Tjaša, you are a blessing! 💫',
        'Tjaša, thank you for being exactly who you are! 💕✨'
      ];
      
      const closings = isSlovenian ? closingsSL : closingsEN;
      const randomClosing = closings[Math.floor(Math.random() * closings.length)];
      
      // Final messages
      const finalsSL = [
        'S poljubi in hvaležnostjo ❤️🤗',
        'Za vedno hvaležni za tebe! 🤗❤️',
        'Ljubljena in cenjena si! ❤️🤗💝',
        'Z ljubeznijo in občudovanjem 🌺✨'
      ];
      
      const finalsEN = [
        'With love and appreciation ❤️🤗',
        'Forever grateful for you! 🤗❤️',
        'You are loved and appreciated! ❤️🤗💝',
        'With love and admiration 🌺✨'
      ];
      
      const finals = isSlovenian ? finalsSL : finalsEN;
      const randomFinal = finals[Math.floor(Math.random() * finals.length)];
      
      // Build the complete message
      const complimentsText = selectedCompliments.join('\n');
      const randomMessage = `${randomTitle}

${complimentsText}

${randomClosing}

${randomFinal}`;
      
      setTimeout(() => {
        setTestResult({ 
          success: true, 
          message: "✨ Special Message Detected ✨",
          fullResponse: randomMessage
        });
        toast.success('💖 A special message just for you!');
        setTesting(false);
      }, 1000);
      return;
    }
    
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(
        `${BACKEND_URL}/api/settings/ai/test`,
        { ...settings, testPrompt: testPromptText },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      setTestResult({ 
        success: true, 
        message: response.data.message,
        fullResponse: response.data.response 
      });
      toast.success('Connection test successful!');
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Connection test failed';
      setTestResult({ success: false, message: errorMsg });
      toast.error(errorMsg);
      
      if (error.response?.status === 401) {
        setTimeout(() => navigate('/login'), 2000);
      }
    } finally {
      setTesting(false);
    }
  };

  const handleTestEracuni = async () => {
    setTestingEracuni(true);
    setEracuniTestResult(null);
    
    // Build API debug data
    const requestPayload = {
      username: settings.eracuniUsername,
      secretKey: settings.eracuniSecretKey,
      token: settings.eracuniToken,
      method: "PartnerList",
      parameters: { page: 1, limit: 1 }
    };
    
    setApiDebugData({
      request: requestPayload,
      response: null,
      timestamp: new Date().toISOString()
    });
    
    try {
      const token = localStorage.getItem('access_token');
      const formData = new FormData();
      formData.append('endpoint', settings.eracuniEndpoint);
      formData.append('username', settings.eracuniUsername);
      formData.append('secretKey', settings.eracuniSecretKey);
      formData.append('apiToken', settings.eracuniToken);
      
      const response = await axios.post(
        `${BACKEND_URL}/api/settings/eracuni/test`,
        formData,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      setEracuniTestResult({ success: true, message: response.data.message });
      setApiDebugData(prev => ({ ...prev, response: response.data }));
      
      // Show warning toast for partial success
      if (response.data.warning) {
        toast.warning('e-računi API test completed with warnings');
      } else {
        toast.success('e-računi connection test successful!');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'e-računi connection test failed';
      setEracuniTestResult({ success: false, message: errorMsg });
      setApiDebugData(prev => ({ ...prev, response: { error: errorMsg } }));
      toast.error(errorMsg);
    } finally {
      setTestingEracuni(false);
    }
  };

  const handleTestPrompt = async (promptType) => {
    setTestingPrompt(promptType);
    const testInput = testInputs[promptType];
    
    if (!testInput || testInput.trim() === '') {
      toast.error('Please enter test input');
      setTestingPrompt(null);
      return;
    }
    
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(
        `${BACKEND_URL}/api/ai/suggest`,
        {
          text: testInput,
          feature: promptType
        },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      setTestResults({
        ...testResults,
        [promptType]: {
          success: true,
          result: response.data.suggestion,
          original: testInput
        }
      });
      toast.success('Prompt test complete!');
    } catch (error) {
      setTestResults({
        ...testResults,
        [promptType]: {
          success: false,
          result: error.response?.data?.detail || 'Test failed',
          original: testInput
        }
      });
      toast.error('Prompt test failed');
    } finally {
      setTestingPrompt(null);
    }
  };

  const updateTestInput = (promptType, value) => {
    setTestInputs({
      ...testInputs,
      [promptType]: value
    });
  };

  const updateSetting = (key, value) => {
    setSettings({...settings, [key]: value});
    setTestResult(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <nav className="bg-white/90 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/batches')} className="rounded-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Settings
          </h1>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* AI Provider Settings Tile */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-slate-200 mb-6">
          <button
            onClick={() => setAiProviderExpanded(!aiProviderExpanded)}
            className="w-full flex items-center justify-between cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <Zap className="w-6 h-6 text-purple-600" />
              <h2 className="text-xl font-bold text-slate-800">AI Provider Configuration</h2>
            </div>
            
            <svg 
              className={`w-5 h-5 text-slate-600 transition-transform ${aiProviderExpanded ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {aiProviderExpanded && (
          <div className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label htmlFor="provider">AI Provider</Label>
              <Select value={settings.aiProvider} onValueChange={(value) => updateSetting('aiProvider', value)}>
                <SelectTrigger id="provider" data-testid="ai-provider-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="emergent">Emergent LLM (Universal Key)</SelectItem>
                  <SelectItem value="custom">Custom OpenAI API</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                {settings.aiProvider === 'emergent' 
                  ? 'Uses the built-in Emergent universal key for OpenAI models'
                  : 'Use your own OpenAI API key for custom integration'}
              </p>
            </div>

            {settings.aiProvider === 'custom' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="apiKey">OpenAI API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={settings.customApiKey}
                    onChange={(e) => updateSetting('customApiKey', e.target.value)}
                    placeholder="sk-..."
                    data-testid="custom-api-key-input"
                  />
                  <p className="text-xs text-slate-500">Your API key is stored securely and never shared</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Select value={settings.customModel} onValueChange={(value) => updateSetting('customModel', value)}>
                    <SelectTrigger id="model" data-testid="model-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-5">GPT-5 (Latest)</SelectItem>
                      <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                      <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                      <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                      <SelectItem value="claude-sonnet-4-20250514">Claude Sonnet 4</SelectItem>
                      <SelectItem value="claude-opus-4-20250514">Claude Opus 4</SelectItem>
                      <SelectItem value="claude-haiku-4-20250514">Claude Haiku 4</SelectItem>
                      <SelectItem value="gemini-2.0-flash-exp">Gemini 2.0 Flash</SelectItem>
                      <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Test Connection */}
            <div className="pt-4 border-t border-slate-200">
              <Label htmlFor="ai-test-prompt" className="text-sm font-medium mb-2 block">Test Prompt (Optional):</Label>
              <Textarea
                id="ai-test-prompt"
                value={aiTestPrompt}
                onChange={(e) => setAiTestPrompt(e.target.value)}
                rows={2}
                placeholder="Enter a custom test message to check model quality... (Leave empty for default test)"
                className="text-sm mb-3"
              />
              
              <Button
                onClick={handleTestConnection}
                disabled={testing || (settings.aiProvider === 'custom' && !settings.customApiKey)}
                variant="outline"
                className="rounded-full"
                data-testid="test-connection-button"
              >
                <Zap className="w-4 h-4 mr-2" />
                {testing ? 'Testing...' : 'Test Connection'}
              </Button>
              
              {testResult && (
                <div className={`mt-3 p-4 rounded-lg border ${
                  testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-start gap-2 mb-2">
                    {testResult.success ? (
                      <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <X className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    )}
                    <p className={`text-sm font-semibold ${
                      testResult.success ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {testResult.message}
                    </p>
                  </div>
                  
                  {testResult.success && testResult.fullResponse && (
                    <div className="mt-3 p-3 bg-white rounded border border-green-300">
                      <p className="text-xs font-semibold text-slate-700 mb-1">AI Response:</p>
                      <p className="text-sm text-slate-800 whitespace-pre-wrap">{testResult.fullResponse}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI Agent Prompts Tile */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-slate-200 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-slate-800">AI Agent Prompts</h2>
          </div>
          <p className="text-sm text-slate-600 mb-6">
            Customize the prompts that control how the AI Agent processes your invoice data.
          </p>

            {/* Grammar Correction Prompt */}
            <div className="space-y-3 mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <Label htmlFor="grammar" className="text-base font-semibold">Grammar Correction</Label>
              <Textarea
                id="grammar"
                value={settings.grammarPrompt}
                onChange={(e) => updateSetting('grammarPrompt', e.target.value)}
                rows={3}
                className="font-mono text-sm"
                data-testid="grammar-prompt-input"
              />
              <p className="text-xs text-slate-500">Used when clicking the AI sparkle icon on description fields</p>
              
              {/* Test Section */}
              <div className="mt-4 pt-4 border-t border-slate-300">
                <Label htmlFor="grammar-test" className="text-sm font-medium mb-2 block">Test Input:</Label>
                <Textarea
                  id="grammar-test"
                  value={testInputs.grammar}
                  onChange={(e) => updateTestInput('grammar', e.target.value)}
                  rows={2}
                  placeholder="Enter text with grammar errors to test..."
                  className="text-sm mb-2"
                />
                <Button
                  onClick={() => handleTestPrompt('grammar')}
                  disabled={testingPrompt === 'grammar' || !testInputs.grammar}
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                >
                  <Sparkles className="w-3 h-3 mr-2" />
                  {testingPrompt === 'grammar' ? 'Testing...' : 'Test Prompt'}
                </Button>
                
                {testResults.grammar && (
                  <div className={`mt-3 p-3 rounded-lg border ${
                    testResults.grammar.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <p className="text-xs font-semibold mb-1">Result:</p>
                    <p className="text-sm">{testResults.grammar.result}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Fraud Detection Prompt */}
            <div className="space-y-3 mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <Label htmlFor="fraud" className="text-base font-semibold">Fraud Detection</Label>
              <Textarea
                id="fraud"
                value={settings.fraudPrompt}
                onChange={(e) => updateSetting('fraudPrompt', e.target.value)}
                rows={3}
                className="font-mono text-sm"
                data-testid="fraud-prompt-input"
              />
              <p className="text-xs text-slate-500">Analyzes invoice descriptions for suspicious patterns</p>
              
              {/* Test Section */}
              <div className="mt-4 pt-4 border-t border-slate-300">
                <Label htmlFor="fraud-test" className="text-sm font-medium mb-2 block">Test Input:</Label>
                <Textarea
                  id="fraud-test"
                  value={testInputs.fraud}
                  onChange={(e) => updateTestInput('fraud', e.target.value)}
                  rows={2}
                  placeholder="Enter invoice description to analyze..."
                  className="text-sm mb-2"
                />
                <Button
                  onClick={() => handleTestPrompt('fraud')}
                  disabled={testingPrompt === 'fraud' || !testInputs.fraud}
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                >
                  <Sparkles className="w-3 h-3 mr-2" />
                  {testingPrompt === 'fraud' ? 'Testing...' : 'Test Prompt'}
                </Button>
                
                {testResults.fraud && (
                  <div className={`mt-3 p-3 rounded-lg border ${
                    testResults.fraud.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <p className="text-xs font-semibold mb-1">Result:</p>
                    <p className="text-sm">{testResults.fraud.result}</p>
                  </div>
                )}
              </div>
            </div>

            {/* GDPR Masking Prompt */}
            <div className="space-y-3 mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <Label htmlFor="gdpr" className="text-base font-semibold">GDPR Data Masking</Label>
              <Textarea
                id="gdpr"
                value={settings.gdprPrompt}
                onChange={(e) => updateSetting('gdprPrompt', e.target.value)}
                rows={3}
                className="font-mono text-sm"
                data-testid="gdpr-prompt-input"
              />
              <p className="text-xs text-slate-500">Identifies and masks personal data in invoice text</p>
              
              {/* Test Section */}
              <div className="mt-4 pt-4 border-t border-slate-300">
                <Label htmlFor="gdpr-test" className="text-sm font-medium mb-2 block">Test Input:</Label>
                <Textarea
                  id="gdpr-test"
                  value={testInputs.gdpr}
                  onChange={(e) => updateTestInput('gdpr', e.target.value)}
                  rows={2}
                  placeholder="Enter text with personal data to test masking..."
                  className="text-sm mb-2"
                />
                <Button
                  onClick={() => handleTestPrompt('gdpr')}
                  disabled={testingPrompt === 'gdpr' || !testInputs.gdpr}
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                >
                  <Sparkles className="w-3 h-3 mr-2" />
                  {testingPrompt === 'gdpr' ? 'Testing...' : 'Test Prompt'}
                </Button>
                
                {testResults.gdpr && (
                  <div className={`mt-3 p-3 rounded-lg border ${
                    testResults.gdpr.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <p className="text-xs font-semibold mb-1">Result:</p>
                    <p className="text-sm">{testResults.gdpr.result}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Verification Prompt */}
            <div className="space-y-3 mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <Label htmlFor="verification" className="text-base font-semibold">Invoice Verification (Batch Review)</Label>
              <Textarea
                id="verification"
                value={settings.verificationPrompt}
                onChange={(e) => updateSetting('verificationPrompt', e.target.value)}
                rows={4}
                className="font-mono text-sm"
                data-testid="verification-prompt-input"
              />
              <p className="text-xs text-slate-500">Checks work descriptions in batch verification for fraud, irregularities, or suspicious patterns. Must return JSON format.</p>
              
              {/* Test Section */}
              <div className="mt-4 pt-4 border-t border-slate-300">
                <Label htmlFor="verification-test" className="text-sm font-medium mb-2 block">Test Input:</Label>
                <Textarea
                  id="verification-test"
                  value={testInputs.verification}
                  onChange={(e) => updateTestInput('verification', e.target.value)}
                  rows={2}
                  placeholder="Enter work description to verify..."
                  className="text-sm mb-2"
                />
                <Button
                  onClick={() => handleTestPrompt('verification')}
                  disabled={testingPrompt === 'verification' || !testInputs.verification}
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                >
                  <Sparkles className="w-3 h-3 mr-2" />
                  {testingPrompt === 'verification' ? 'Testing...' : 'Test Prompt'}
                </Button>
                
                {testResults.verification && (
                  <div className={`mt-3 p-3 rounded-lg border ${
                    testResults.verification.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <p className="text-xs font-semibold mb-1">Result:</p>
                    <p className="text-sm whitespace-pre-wrap">{testResults.verification.result}</p>
                  </div>
                )}
              </div>
            </div>
        </div>

        {/* e-računi API Configuration Tile */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-slate-200 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h2 className="text-xl font-bold text-slate-800">e-računi API Configuration</h2>
          </div>
          <p className="text-sm text-slate-600 mb-6">
              Configure your e-računi integration for posting invoices. <a href="https://e-racuni.com/si9/ApiDocumentation-Method-SalesInvoiceCreate" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View API Documentation</a>
            </p>

            {/* Credentials Reference Box */}
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-blue-700">📋 Your e-računi Credentials:</p>
                <button
                  onClick={() => setShowEracuniCreds(!showEracuniCreds)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                  type="button"
                >
                  {showEracuniCreds ? (
                    <>
                      <EyeOff className="w-4 h-4" />
                      <span>Hide</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" />
                      <span>Show</span>
                    </>
                  )}
                </button>
              </div>
              <div className="space-y-2 text-xs">
                <div className="bg-white p-2 rounded border border-blue-300">
                  <div className="font-semibold text-blue-800">Username:</div>
                  <div className="font-mono text-slate-700">
                    {showEracuniCreds ? 'ERACUNAPI' : '••••••••••'}
                  </div>
                </div>
                <div className="bg-white p-2 rounded border border-blue-300">
                  <div className="font-semibold text-blue-800">Secret Key (API Password):</div>
                  <div className="font-mono text-slate-700">
                    {showEracuniCreds ? '4df213a39d7acbc16cc0f58444D363cb' : '••••••••••••••••••••••••••••••••'}
                  </div>
                </div>
                <div className="bg-white p-2 rounded border border-blue-300">
                  <div className="font-semibold text-blue-800">API Token:</div>
                  <div className="font-mono text-slate-700">
                    {showEracuniCreds ? 'E746E154C9F2D00DB0379EF30737090A' : '••••••••••••••••••••••••••••••••'}
                  </div>
                </div>
              </div>
            </div>

            {/* API Endpoint */}
            <div className="space-y-2 mb-6">
              <Label htmlFor="eracuniEndpoint">API Endpoint</Label>
              <Input
                id="eracuniEndpoint"
                type="url"
                value={settings.eracuniEndpoint}
                onChange={(e) => updateSetting('eracuniEndpoint', e.target.value)}
                placeholder="https://e-racuni.com/WebServices/API"
                data-testid="eracuni-endpoint-input"
              />
              <p className="text-xs text-slate-500">Your e-računi API endpoint URL</p>
            </div>

            {/* Username */}
            <div className="space-y-2 mb-6">
              <Label htmlFor="eracuniUsername">Username</Label>
              <Input
                id="eracuniUsername"
                type="text"
                value={settings.eracuniUsername}
                onChange={(e) => updateSetting('eracuniUsername', e.target.value)}
                placeholder="Enter e-računi username"
                data-testid="eracuni-username-input"
              />
              <p className="text-xs text-slate-500">Your e-računi account username</p>
            </div>

            {/* Secret Key */}
            <div className="space-y-2 mb-6">
              <Label htmlFor="eracuniSecretKey">Secret Key</Label>
              <Input
                id="eracuniSecretKey"
                type="password"
                value={settings.eracuniSecretKey}
                onChange={(e) => updateSetting('eracuniSecretKey', e.target.value)}
                placeholder="Enter secret key"
                data-testid="eracuni-secret-key-input"
              />
              <p className="text-xs text-slate-500">Your e-računi API secret key (stored securely)</p>
            </div>

            {/* Token */}
            <div className="space-y-2 mb-6">
              <Label htmlFor="eracuniToken">API Token</Label>
              <Input
                id="eracuniToken"
                type="password"
                value={settings.eracuniToken}
                onChange={(e) => updateSetting('eracuniToken', e.target.value)}
                placeholder="Enter API token"
                data-testid="eracuni-token-input"
              />
              <p className="text-xs text-slate-500">Your e-računi API authentication token</p>
            </div>

            {/* Test Connection Buttons */}
            <div className="pt-4 flex items-center gap-3">
              <Button
                onClick={handleTestEracuni}
                disabled={testingEracuni || !settings.eracuniUsername || !settings.eracuniSecretKey || !settings.eracuniToken}
                variant="outline"
                className="rounded-full"
                data-testid="test-eracuni-button"
              >
                <Zap className="w-4 h-4 mr-2" />
                {testingEracuni ? 'Testing...' : 'Test Connection'}
              </Button>
              
              <Button
                onClick={() => setShowApiDebugModal(true)}
                disabled={!apiDebugData}
                variant="outline"
                className="rounded-full"
                data-testid="view-api-button"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                View API
              </Button>
              
              {eracuniTestResult && (
                <div className={`mt-3 p-3 rounded-lg flex items-start gap-2 ${
                  eracuniTestResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}>
                  {eracuniTestResult.success ? (
                    <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <X className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <p className={`text-sm ${
                    eracuniTestResult.success ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {eracuniTestResult.message}
                  </p>
                </div>
              )}
            </div>
        </div>

        {/* Article Codes Tile */}
        <ArticleCodesSection />

        {/* Tariff Codes Tile */}
        <TariffCodesSection />

        {/* Costs Tile */}
        <EmployeeCostsSection />

        {/* Customer Management Tile */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-slate-200 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h2 className="text-xl font-bold text-slate-800">Customer Management</h2>
          </div>
          <p className="text-sm text-slate-600 mb-6">
            Manually create new customers with their details
          </p>

          <AddCustomerForm />
        </div>

        {/* Save Button - Global */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Save all configuration changes</p>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-blue-600 hover:bg-blue-700"
              data-testid="save-settings-button"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
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
              {/* Search Parameters */}
              <div className="mb-6">
                <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs">1</span>
                  Search Parameters
                </h4>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 min-w-24">Endpoint:</span>
                      <code className="text-slate-800 font-mono text-xs">{settings.eracuniEndpoint}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 min-w-24">Username:</span>
                      <code className="text-slate-800 font-mono">{settings.eracuniUsername}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 min-w-24">Secret Key:</span>
                      <code className="text-slate-800 font-mono">{settings.eracuniSecretKey}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 min-w-24">Token:</span>
                      <code className="text-slate-800 font-mono">{settings.eracuniToken}</code>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expected API Call */}
              <div className="mb-6">
                <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-xs">2</span>
                  Expected e-računi API Call
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
                  Backend Response
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

export default Settings;