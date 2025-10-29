import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { ArrowLeft, Lock, User as UserIcon, Mail, Shield } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const UserProfile = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      navigate('/login');
      return;
    }
    setUser(JSON.parse(userStr));
    loadProfile();
  }, [navigate]);

  const loadProfile = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/user/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProfile(response.data);
    } catch (error) {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const validatePassword = (password) => {
    const errors = [];
    if (password.length < 8) {
      errors.push('At least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('One uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('One lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('One number');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
      errors.push('One special character');
    }
    return errors;
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();

    // Validate new password
    const errors = validatePassword(newPassword);
    if (errors.length > 0) {
      toast.error(`Password requirements: ${errors.join(', ')}`);
      return;
    }

    // Check if passwords match
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setChangingPassword(true);

    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${BACKEND_URL}/api/auth/change-password`,
        {
          currentPassword,
          newPassword
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast.success('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to change password';
      toast.error(errorMsg);
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

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
            {user?.role === 'ADMIN' && (
              <Button variant="outline" size="sm" onClick={() => navigate('/users')} className="rounded-full">
                Users
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate('/batches')} className="rounded-full">
              Dashboard
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-full">
              Logout
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={() => navigate(-1)}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h2 className="text-3xl font-bold text-slate-800 mb-2">User Profile</h2>
          <p className="text-slate-600">Manage your account settings</p>
        </div>

        <div className="grid gap-6">
          {/* Profile Information */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200 p-6">
            <h3 className="text-xl font-semibold text-slate-800 mb-6 flex items-center gap-2">
              <UserIcon className="w-5 h-5" />
              Profile Information
            </h3>
            
            {/* Avatar Display */}
            <div className="flex items-center gap-4 mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl">
              <Avatar name={profile?.username || profile?.email} size="xl" />
              <div>
                <p className="font-semibold text-slate-800">{profile?.username || 'User'}</p>
                <p className="text-sm text-slate-600">{profile?.email}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-700 flex items-center gap-2 mb-2">
                    <Mail className="w-4 h-4" />
                    Email
                  </Label>
                  <Input
                    value={profile?.email || ''}
                    disabled
                    className="bg-slate-100"
                  />
                </div>
                <div>
                  <Label className="text-slate-700 flex items-center gap-2 mb-2">
                    <UserIcon className="w-4 h-4" />
                    Username
                  </Label>
                  <Input
                    value={profile?.username || 'Not set'}
                    disabled
                    className="bg-slate-100"
                  />
                </div>
              </div>
              <div>
                <Label className="text-slate-700 flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4" />
                  Role
                </Label>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    profile?.role === 'ADMIN' 
                      ? 'bg-purple-100 text-purple-700' 
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {profile?.role}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200 p-6">
            <h3 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Change Password
            </h3>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <Label htmlFor="currentPassword" className="text-slate-700">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <Label htmlFor="newPassword" className="text-slate-700">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="Enter new password"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Must contain: 8+ characters, uppercase, lowercase, number, special character
                </p>
              </div>
              <div>
                <Label htmlFor="confirmPassword" className="text-slate-700">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Confirm new password"
                />
              </div>
              <Button
                type="submit"
                disabled={changingPassword}
                className="bg-blue-600 hover:bg-blue-700 rounded-full"
              >
                {changingPassword ? 'Changing Password...' : 'Change Password'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
