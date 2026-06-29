import React, { useState, useEffect } from 'react';
import { UserCheck, ShieldAlert, Trash2, UserX } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface User {
  id: number;
  email: string;
  name: string;
  role: 'Owner' | 'Admin' | 'Staff';
  status: 'pending' | 'approved';
  created_at: string;
}

export default function UserAccess() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/auth/all-users');
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users access records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleUpdateStatus = async (userId: number, role: string, status: string) => {
    setUpdatingId(userId);
    try {
      await apiFetch('/auth/approve-user', {
        method: 'POST',
        body: JSON.stringify({ userId, role, status })
      });
      await loadUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to update access level');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemoveUser = async (userId: number) => {
    if (!confirm('Are you sure you want to permanently delete this user?')) return;
    try {
      await apiFetch('/auth/remove-user', {
        method: 'POST',
        body: JSON.stringify({ userId })
      });
      await loadUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to remove user');
    }
  };

  return (
    <div className="flex flex-col space-y-6 pb-12">
      <div>
        <h2 className="text-2xl font-bold text-lodge-textDark">User Access Controls</h2>
        <p className="text-gray-500 text-sm font-medium">Approve staff registrations and manage permissions</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Role</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Registered</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-xs text-gray-400 font-medium">
                  Fetching user credentials list...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-xs text-gray-400 font-medium">
                  No registered users found.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/50 transition">
                  {/* Name */}
                  <td className="p-4 text-sm font-bold text-gray-800">{user.name}</td>
                  
                  {/* Email */}
                  <td className="p-4 text-sm text-gray-600 font-semibold">{user.email}</td>
                  
                  {/* Role Selection */}
                  <td className="p-4 text-xs">
                    <select
                      value={user.role}
                      disabled={user.email === 'mrlodge26@gmail.com' || updatingId === user.id}
                      onChange={(e) => handleUpdateStatus(user.id, e.target.value, user.status)}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-1.5 font-bold text-gray-700 outline-none focus:bg-white"
                    >
                      <option value="Staff">Staff</option>
                      <option value="Admin">Admin</option>
                      <option value="Owner">Owner</option>
                    </select>
                  </td>

                  {/* Registered date */}
                  <td className="p-4 text-xs text-gray-400 font-bold">
                    {new Date(user.created_at).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </td>

                  {/* Status toggle Badge */}
                  <td className="p-4 text-xs">
                    <span className={`px-2.5 py-1 rounded-full font-extrabold uppercase text-[9px] border ${
                      user.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : 'bg-amber-100 text-amber-800 border-amber-200'
                    }`}>
                      {user.status}
                    </span>
                  </td>

                  {/* Approve/Revoke & Delete buttons */}
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      {user.status === 'pending' ? (
                        <button
                          onClick={() => handleUpdateStatus(user.id, user.role, 'approved')}
                          disabled={updatingId === user.id}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 shadow-sm transition disabled:opacity-50"
                        >
                          Approve
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUpdateStatus(user.id, user.role, 'pending')}
                          disabled={user.email === 'mrlodge26@gmail.com' || updatingId === user.id}
                          className="px-3 py-1.5 border border-gray-200 bg-white text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 transition disabled:opacity-50"
                        >
                          Suspend
                        </button>
                      )}
                      
                      <button
                        onClick={() => handleRemoveUser(user.id)}
                        disabled={user.email === 'mrlodge26@gmail.com' || updatingId === user.id}
                        className="p-1.5 border border-gray-200 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
