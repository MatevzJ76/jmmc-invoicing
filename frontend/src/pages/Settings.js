import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Save, Zap, Check, X, Sparkles } from 'lucide-react';
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
  const [aiTestPrompt, setAiTestPrompt] = useState('');
  
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
    
    // Easter egg: Special response for Tjaša variants (tjaš* or tjas*)
    const words = testPromptText.toLowerCase().split(/\s+/);
    const containsTjasa = words.some(word => 
      word.startsWith('tjaš') || word.startsWith('tjas')
    );
    
    if (containsTjasa) {
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
    } finally {
      setTesting(false);
    }
  };

  const handleTestEracuni = async () => {
    setTestingEracuni(true);
    setEracuniTestResult(null);
    try {
      const token = localStorage.getItem('access_token');
      const formData = new FormData();
      formData.append('username', settings.eracuniUsername);
      formData.append('secretKey', settings.eracuniSecretKey);


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

      formData.append('apiToken', settings.eracuniToken);
      
      const response = await axios.post(
        `${BACKEND_URL}/api/settings/eracuni/test`,
        formData,
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
          
          <div className="space-y-6">
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

            {/* Test Connection Button */}
            <div className="pt-4">
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
    </div>
  );
};

export default Settings;