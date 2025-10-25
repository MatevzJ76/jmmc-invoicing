import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem('lastEmail');
    if (savedEmail) setEmail(savedEmail);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${BACKEND_URL}/api/auth/login`, {
        email,
        password
      });

      localStorage.setItem('access_token', response.data.access_token);
      localStorage.setItem('refresh_token', response.data.refresh_token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      localStorage.setItem('lastEmail', email);

      if (response.data.user.mustReset) {
        toast.warning('Please change your password');
        navigate('/change-password');
      } else {
        toast.success('Login successful!');
        navigate('/batches');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 
                       (typeof error.response?.data === 'string' ? error.response.data : 'Login failed');
      
      if (error.response?.status === 429) {
        toast.error('Too many login attempts. Please wait 15 minutes and try again.', { duration: 10000 });
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo/Brand Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-2xl mb-4 shadow-2xl relative overflow-hidden">
            {/* AI Neural Network Icon */}
            <svg className="w-12 h-12 text-white" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Central node */}
              <circle cx="24" cy="24" r="4" fill="currentColor" className="animate-pulse"/>
              
              {/* Outer nodes */}
              <circle cx="12" cy="12" r="2.5" fill="currentColor" opacity="0.8"/>
              <circle cx="36" cy="12" r="2.5" fill="currentColor" opacity="0.8"/>
              <circle cx="12" cy="36" r="2.5" fill="currentColor" opacity="0.8"/>
              <circle cx="36" cy="36" r="2.5" fill="currentColor" opacity="0.8"/>
              
              {/* Mid nodes */}
              <circle cx="24" cy="8" r="2" fill="currentColor" opacity="0.6"/>
              <circle cx="40" cy="24" r="2" fill="currentColor" opacity="0.6"/>
              <circle cx="24" cy="40" r="2" fill="currentColor" opacity="0.6"/>
              <circle cx="8" cy="24" r="2" fill="currentColor" opacity="0.6"/>
              
              {/* Connection lines */}
              <line x1="24" y1="24" x2="12" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
              <line x1="24" y1="24" x2="36" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
              <line x1="24" y1="24" x2="12" y2="36" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
              <line x1="24" y1="24" x2="36" y2="36" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
              <line x1="24" y1="24" x2="24" y2="8" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
              <line x1="24" y1="24" x2="40" y2="24" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
              <line x1="24" y1="24" x2="24" y2="40" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
              <line x1="24" y1="24" x2="8" y2="24" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
            </svg>
            
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/20 to-purple-400/20 animate-pulse"></div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            JMMC Invoicing
          </h1>
          <p className="text-blue-200 text-sm">Powered by AI Intelligence</p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-semibold text-white mb-1">Welcome Back</h2>
            <p className="text-blue-200 text-sm">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/90 font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@local"
                required
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/20 focus:border-blue-400 rounded-xl"
                data-testid="login-email-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/90 font-medium">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoFocus
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/20 focus:border-blue-400 rounded-xl"
                data-testid="login-password-input"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl py-6 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
              disabled={loading}
              data-testid="login-submit-button"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10 backdrop-blur-sm">
            <p className="text-xs text-blue-200 font-bold mb-3">🔑 Test Credentials:</p>
            <div className="space-y-3 text-xs">
              <div className="bg-white/10 p-3 rounded-lg border border-white/20">
                <div className="font-semibold text-white mb-1">Admin Account:</div>
                <div className="font-mono text-blue-200">Email: admin@local</div>
                <div className="font-mono text-blue-200">Password: Admin2025!</div>
              </div>
              <div className="bg-white/10 p-3 rounded-lg border border-white/20">
                <div className="font-semibold text-white mb-1">User Account:</div>
                <div className="font-mono text-blue-200">Email: user@local</div>
                <div className="font-mono text-blue-200">Password: User2025!</div>
              </div>
            </div>
          </div>

          {/* AI Badge */}
          <div className="mt-4 flex items-center justify-center gap-2 text-white/60 text-xs">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
            <span>AI-Powered Invoice Management</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;