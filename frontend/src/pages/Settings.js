import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Save, Zap, Check, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const Settings = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testingEracuni, setTestingEracuni] = useState(false);
  const [eracuniTestResult, setEracuniTestResult] = useState(null);
  
  const [settings, setSettings] = useState({
    aiProvider: 'emergent',
    customApiKey: '',
    customModel: 'gpt-4o',
    grammarPrompt: 'Fix grammar and spelling errors in this invoice text. Return only the corrected text without explanations.',
    fraudPrompt: 'Analyze this invoice description for potential fraud indicators or suspicious patterns. Provide a brief risk assessment.',
    gdprPrompt: 'Identify and mask any personal data (names, emails, phone numbers, addresses) in this text. Return the masked version with [REDACTED] in place of sensitive data.',
    verificationPrompt: 'Analyze this work description for suspicious patterns, irregularities, or fraud indicators. Look for: vague descriptions, unusual time patterns, duplicate entries, inconsistent work details. If suspicious, respond with JSON: {"flagged": true, "reason": "brief explanation"}. If normal, respond with: {"flagged": false, "reason": ""}',
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
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(
        `${BACKEND_URL}/api/settings/ai/test`,
        settings,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      setTestResult({ success: true, message: response.data.message });
      toast.success('Connection test successful!');
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Connection test failed';
      setTestResult({ success: false, message: errorMsg });
      toast.error(errorMsg);
    } finally {
      setTesting(false);
    }
  };

  const handleTestEracuni = async () => {
    setTestingEracuni(true);
    setEracuniTestResult(null);
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(
        `${BACKEND_URL}/api/settings/eracuni/test`,
        {
          username: settings.eracuniUsername,
          secretKey: settings.eracuniSecretKey,
          apiToken: settings.eracuniToken
        },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      setEracuniTestResult({ success: true, message: response.data.message });
      toast.success('e-računi connection test successful!');
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'e-računi connection test failed';
      setEracuniTestResult({ success: false, message: errorMsg });
      toast.error(errorMsg);
    } finally {
      setTestingEracuni(false);
    }
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
          <div className="flex items-center gap-3 mb-6">
            <Zap className="w-6 h-6 text-purple-600" />
            <h2 className="text-xl font-bold text-slate-800">AI Provider Configuration</h2>
          </div>
            
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
                      <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                      <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                      <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Test Connection */}
            <div className="pt-4">
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
                <div className={`mt-3 p-3 rounded-lg flex items-start gap-2 ${
                  testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}>
                  {testResult.success ? (
                    <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <X className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <p className={`text-sm ${
                    testResult.success ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {testResult.message}
                  </p>
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
            <div className="space-y-2 mb-6">
              <Label htmlFor="grammar">Grammar Correction</Label>
              <Textarea
                id="grammar"
                value={settings.grammarPrompt}
                onChange={(e) => updateSetting('grammarPrompt', e.target.value)}
                rows={3}
                className="font-mono text-sm"
                data-testid="grammar-prompt-input"
              />
              <p className="text-xs text-slate-500">Used when clicking the AI sparkle icon on description fields</p>
            </div>

            {/* Fraud Detection Prompt */}
            <div className="space-y-2 mb-6">
              <Label htmlFor="fraud">Fraud Detection</Label>
              <Textarea
                id="fraud"
                value={settings.fraudPrompt}
                onChange={(e) => updateSetting('fraudPrompt', e.target.value)}
                rows={3}
                className="font-mono text-sm"
                data-testid="fraud-prompt-input"
              />
              <p className="text-xs text-slate-500">Analyzes invoice descriptions for suspicious patterns</p>
            </div>

            {/* GDPR Masking Prompt */}
            <div className="space-y-2 mb-6">
              <Label htmlFor="gdpr">GDPR Data Masking</Label>
              <Textarea
                id="gdpr"
                value={settings.gdprPrompt}
                onChange={(e) => updateSetting('gdprPrompt', e.target.value)}
                rows={3}
                className="font-mono text-sm"
                data-testid="gdpr-prompt-input"
              />
              <p className="text-xs text-slate-500">Identifies and masks personal data in invoice text</p>
            </div>

            {/* Verification Prompt */}
            <div className="space-y-2 mb-6">
              <Label htmlFor="verification">Invoice Verification (Batch Review)</Label>
              <Textarea
                id="verification"
                value={settings.verificationPrompt}
                onChange={(e) => updateSetting('verificationPrompt', e.target.value)}
                rows={4}
                className="font-mono text-sm"
                data-testid="verification-prompt-input"
              />
              <p className="text-xs text-slate-500">Checks work descriptions in batch verification for fraud, irregularities, or suspicious patterns. Must return JSON format.</p>
            </div>
          </div>

          {/* e-računi API Configuration */}
          <div className="border-t border-slate-200 pt-8">
            <div className="flex items-center gap-3 mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h2 className="text-xl font-bold text-slate-800">e-računi API Configuration</h2>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Configure your e-računi integration for posting invoices. <a href="https://e-racuni.com/si9/ApiDocumentation-Method-SalesInvoiceCreate" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View API Documentation</a>
            </p>

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
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-end gap-4 pt-6 border-t border-slate-200">
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
    </div>
  );
};

export default Settings;