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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-slate-200">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-800 mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Emergent Invoicing
            </h1>
            <p className="text-slate-600">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@local"
                required
                data-testid="login-email-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoFocus
                data-testid="login-password-input"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-full py-6 text-lg font-semibold"
              disabled={loading}
              data-testid="login-submit-button"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-700 font-bold mb-3">🔑 Test Credentials:</p>
            <div className="space-y-3 text-xs">
              <div className="bg-white p-2 rounded border border-blue-300">
                <div className="font-semibold text-blue-800">Admin Account:</div>
                <div className="font-mono text-slate-700">Email: admin@local</div>
                <div className="font-mono text-slate-700">Password: Admin2025!</div>
              </div>
              <div className="bg-white p-2 rounded border border-blue-300">
                <div className="font-semibold text-blue-800">User Account:</div>
                <div className="font-mono text-slate-700">Email: user@local</div>
                <div className="font-mono text-slate-700">Password: User2025!</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;