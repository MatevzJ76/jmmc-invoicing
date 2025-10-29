import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { ArrowLeft, UserPlus, Archive, Shield, Users, Mail, Lock } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const UserManagement = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Create user form
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('USER');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      navigate('/login');
      return;
    }
    const userData = JSON.parse(userStr);
    setUser(userData);
    
    if (userData.role !== 'ADMIN') {
      toast.error('Admin access required');
      navigate('/batches');
      return;
    }
    
    loadUsers();
  }, [navigate]);

  const loadUsers = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${BACKEND_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data);
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreating(true);

    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${BACKEND_URL}/api/admin/users`,
        {
          email: newUserEmail,
          username: newUserUsername,
          password: newUserPassword,
          role: newUserRole
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast.success('User created successfully!');
      setShowCreateModal(false);
      setNewUserEmail('');
      setNewUserUsername('');
      setNewUserPassword('');
      setNewUserRole('USER');
      loadUsers();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to create user';
      toast.error(errorMsg);
    } finally {
      setCreating(false);
    }
  };

  const handleArchiveUser = async (userId, userEmail) => {
    if (!window.confirm(`Are you sure you want to archive user ${userEmail}?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      await axios.put(
        `${BACKEND_URL}/api/admin/users/${userId}/archive`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast.success('User archived successfully');
      loadUsers();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to archive user';
      toast.error(errorMsg);
    }
  };

  const handleChangeRole = async (userId, newRole, currentRole) => {
    if (!window.confirm(`Change user role from ${currentRole} to ${newRole}?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      await axios.put(
        `${BACKEND_URL}/api/admin/users/${userId}/role`,
        { role: newRole },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast.success('User role updated successfully');
      loadUsers();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to update user role';
      toast.error(errorMsg);
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
            <Button variant="outline" size="sm" onClick={() => navigate('/batches')} className="rounded-full">
              Dashboard
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-full">
              Logout
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Button 
              variant="ghost" 
              onClick={() => navigate(-1)}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h2 className="text-3xl font-bold text-slate-800 mb-2 flex items-center gap-2">
              <Users className="w-8 h-8" />
              User Management
            </h2>
            <p className="text-slate-600">Manage system users and permissions</p>
          </div>
          <Button
            onClick={() => setShowCreateModal(!showCreateModal)}
            className="bg-blue-600 hover:bg-blue-700 rounded-full"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Create User
          </Button>
        </div>

        {/* Create User Form */}
        {showCreateModal && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200 p-6 mb-6">
            <h3 className="text-xl font-semibold text-slate-800 mb-4">Create New User</h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email" className="text-slate-700">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    required
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="username" className="text-slate-700">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    value={newUserUsername}
                    onChange={(e) => setNewUserUsername(e.target.value)}
                    required
                    placeholder="John Doe"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="password" className="text-slate-700">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    required
                    placeholder="Secure password"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Min 8 chars, uppercase, lowercase, number, special char
                  </p>
                </div>
                <div>
                  <Label htmlFor="role" className="text-slate-700">Role</Label>
                  <Select value={newUserRole} onValueChange={setNewUserRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USER">User</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={creating}
                  className="bg-blue-600 hover:bg-blue-700 rounded-full"
                >
                  {creating ? 'Creating...' : 'Create User'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-full"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Email</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Username</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Role</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Created</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-700">{u.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">{u.username || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        u.role === 'ADMIN' 
                          ? 'bg-purple-100 text-purple-700' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        u.status === 'active' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        {u.email !== user?.email && u.status === 'active' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleChangeRole(u.id, u.role === 'ADMIN' ? 'USER' : 'ADMIN', u.role)}
                              className="rounded-full text-xs"
                            >
                              <Shield className="w-3 h-3 mr-1" />
                              {u.role === 'ADMIN' ? 'Make User' : 'Make Admin'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleArchiveUser(u.id, u.email)}
                              className="rounded-full text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Archive className="w-3 h-3 mr-1" />
                              Archive
                            </Button>
                          </>
                        )}
                        {u.email === user?.email && (
                          <span className="text-xs text-slate-500 italic">Current User</span>
                        )}
                        {u.status === 'archived' && (
                          <span className="text-xs text-slate-500 italic">Archived</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
