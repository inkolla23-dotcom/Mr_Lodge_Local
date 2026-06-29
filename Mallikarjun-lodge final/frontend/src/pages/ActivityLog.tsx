import React, { useState, useEffect } from 'react';
import { Activity, ShieldAlert, Trash2, Eye, EyeOff, Lock, KeyRound } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface Log {
  id: number;
  email: string;
  action: string;
  details: string;
  timestamp: string;
}

// ── Password verification modal ───────────────────────────────────────────────
function PasswordModal({
  title,
  onConfirm,
  onCancel,
}: {
  title: string;
  onConfirm: (password: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [pwd, setPwd] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwd) { setError('Please enter the password.'); return; }
    setError('');
    setLoading(true);
    try {
      await onConfirm(pwd);
    } catch (err: any) {
      setError(err.message || 'Incorrect password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-red-100 bg-red-50">
          <Lock className="w-5 h-5 text-red-600" />
          <h3 className="text-sm font-bold text-red-800">Password Required</h3>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-xs text-gray-600 font-semibold leading-relaxed">{title}</p>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">
              Activity Log Delete Password
            </label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                autoFocus
                placeholder="Enter password"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 pr-10 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-red-300"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && <p className="text-[10px] text-red-600 font-bold mt-1.5">⚠ {error}</p>}
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-60 transition shadow"
            >
              {loading ? 'Verifying…' : 'Confirm Delete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ActivityLog() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  // Data management inputs
  const [delTxFrom, setDelTxFrom] = useState('');
  const [delTxTo, setDelTxTo] = useState('');
  const [delLogFrom, setDelLogFrom] = useState('');
  const [delLogTo, setDelLogTo] = useState('');

  const [deletingTx, setDeletingTx] = useState(false);
  const [deletingLogs, setDeletingLogs] = useState(false);

  // Password modal state — shared for both log-delete and records-delete
  const [showPwdModal, setShowPwdModal] = useState(false);
  // 'logs' or 'records' — which action is pending password confirmation
  const [pwdModalTarget, setPwdModalTarget] = useState<'logs' | 'records'>('logs');
  // Store the pending log-delete action to execute after password verified
  const [pendingLogDelete, setPendingLogDelete] = useState<{ from: string; to: string } | null>(null);
  // Store the pending records-delete action to execute after password verified
  const [pendingRecordsDelete, setPendingRecordsDelete] = useState<{ from: string; to: string } | null>(null);

  // Change password section
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [cpCurrent, setCpCurrent] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpShowCurrent, setCpShowCurrent] = useState(false);
  const [cpShowNew, setCpShowNew] = useState(false);
  const [cpError, setCpError] = useState('');
  const [cpSuccess, setCpSuccess] = useState('');
  const [cpLoading, setCpLoading] = useState(false);

  // Get current user role from localStorage
  const userStr = localStorage.getItem('mrlodge_user');
  const currentUser = userStr ? JSON.parse(userStr) : { role: 'Staff' };
  const canChangePassword = currentUser.role === 'Owner' || currentUser.role === 'Admin';

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/activity-logs');
      setLogs(data);
    } catch (err) {
      console.error('Failed to load activity logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLogs(); }, []);

  // ── Delete Transaction Records — password required ───────────────────────
  const handleDeleteRecords = (e: React.FormEvent) => {
    e.preventDefault();
    if (!delTxFrom || !delTxTo) { alert('Please specify both from and to dates'); return; }
    // Require password before deleting — same flow as log deletion
    setPendingRecordsDelete({ from: delTxFrom, to: delTxTo });
    setPwdModalTarget('records');
    setShowPwdModal(true);
  };

  // ── Delete Activity Logs — requires password ─────────────────────────────
  const handleDeleteLogsClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!delLogFrom || !delLogTo) { alert('Please specify both from and to dates'); return; }
    setPendingLogDelete({ from: delLogFrom, to: delLogTo });
    setPwdModalTarget('logs');
    setShowPwdModal(true);
  };

  // Called by PasswordModal after user enters password
  const executeLogDelete = async (password: string) => {
    // Verify password with backend
    const verifyRes = await apiFetch('/settings/verify-log-password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (!verifyRes.verified) throw new Error('Incorrect password.');

    // Password correct — proceed with deletion
    setShowPwdModal(false);
    setDeletingLogs(true);
    try {
      const res = await apiFetch('/data-management/delete-logs', {
        method: 'POST',
        body: JSON.stringify({ fromDate: pendingLogDelete?.from, toDate: pendingLogDelete?.to })
      });
      setPendingLogDelete(null);
      setDelLogFrom('');
      setDelLogTo('');
      alert(res.message || 'Logs cleared successfully');
      loadLogs();
    } catch (err: any) {
      alert(err.message || 'Deletion failed');
    } finally {
      setDeletingLogs(false);
    }
  };

  // ── Execute records delete after password verified ──────────────────────
  const executeRecordsDelete = async (password: string) => {
    // Verify password with backend (same password as log deletion)
    const verifyRes = await apiFetch('/settings/verify-log-password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (!verifyRes.verified) throw new Error('Incorrect password.');

    setShowPwdModal(false);
    setDeletingTx(true);
    try {
      const res = await apiFetch('/data-management/delete-records', {
        method: 'POST',
        body: JSON.stringify({ fromDate: pendingRecordsDelete?.from, toDate: pendingRecordsDelete?.to })
      });
      setPendingRecordsDelete(null);
      setDelTxFrom('');
      setDelTxTo('');
      alert(res.message || 'Records deleted successfully');
      loadLogs();
    } catch (err: any) {
      alert(err.message || 'Deletion failed');
    } finally {
      setDeletingTx(false);
    }
  };

  // ── Change password ──────────────────────────────────────────────────────
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setCpError(''); setCpSuccess('');
    if (cpNew !== cpConfirm) { setCpError('New passwords do not match.'); return; }
    if (cpNew.length < 6) { setCpError('New password must be at least 6 characters.'); return; }
    setCpLoading(true);
    try {
      const res = await apiFetch('/settings/log-delete-password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword: cpCurrent, newPassword: cpNew }),
      });
      setCpSuccess(res.message || 'Password changed successfully.');
      setCpCurrent(''); setCpNew(''); setCpConfirm('');
    } catch (err: any) {
      setCpError(err.message || 'Failed to change password.');
    } finally {
      setCpLoading(false);
    }
  };

  return (
    <div className="flex flex-col space-y-6 pb-12">

      {/* Password verification modal */}
      {showPwdModal && (
        <PasswordModal
          title={
            pwdModalTarget === 'records'
              ? 'Enter the administrator password to permanently delete all lodge data in this date range. This cannot be undone.'
              : 'Enter the Activity Log Delete Password to confirm this action. This cannot be undone.'
          }
          onConfirm={pwdModalTarget === 'records' ? executeRecordsDelete : executeLogDelete}
          onCancel={() => {
            setShowPwdModal(false);
            setPendingLogDelete(null);
            setPendingRecordsDelete(null);
          }}
        />
      )}

      <div>
        <h2 className="text-2xl font-bold text-lodge-textDark">Activity Log & Data Management</h2>
        <p className="text-gray-500 text-sm font-medium">Audit logs of all user actions and database maintenance utilities</p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* Left: Logs list */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-50 pb-3">
            <Activity className="w-4 h-4 text-lodge-brown" />
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">System Audit Logs</h3>
          </div>
          <div className="space-y-4 max-h-[550px] overflow-y-auto pr-2">
            {loading ? (
              <p className="text-center py-12 text-xs text-gray-400 font-medium">Loading logs database...</p>
            ) : logs.length === 0 ? (
              <p className="text-center py-12 text-xs text-gray-400 font-medium">No activity records logged.</p>
            ) : logs.map((log) => (
              <div key={log.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100/50 flex flex-col space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-extrabold text-lodge-textDark uppercase tracking-wide">{log.action}</span>
                  <span className="text-[10px] text-gray-400 font-bold">{log.timestamp}</span>
                </div>
                <p className="text-xs text-gray-600 font-medium leading-relaxed">{log.details}</p>
                <span className="text-[10px] text-gray-400 font-bold block pt-0.5">Performed by: {log.email}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Data Management */}
        <div className="lg:col-span-5 space-y-6">

          {/* Delete Transaction Records */}
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-red-50 pb-3 text-red-700">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-sm font-bold uppercase tracking-wider">Delete Lodge Data</h3>
            </div>
            <p className="text-xs text-gray-500 font-semibold leading-relaxed">
              Delete all bookings, check-ins, checkout history, invoices, invoice payments, and additional guest records within the range.
            </p>
            <form onSubmit={handleDeleteRecords} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">From</label>
                  <input type="date" required value={delTxFrom} onChange={(e) => setDelTxFrom(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs font-semibold text-gray-700 outline-none focus:bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">To</label>
                  <input type="date" required value={delTxTo} onChange={(e) => setDelTxTo(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs font-semibold text-gray-700 outline-none focus:bg-white" />
                </div>
              </div>
              <button type="submit" disabled={deletingTx}
                className="w-full bg-red-600 text-white py-2.5 rounded-lg text-xs font-bold hover:bg-red-700 shadow-sm transition disabled:opacity-50">
                {deletingTx ? 'Deleting Transaction Records...' : 'Clear Records'}
              </button>
            </form>
          </div>

          {/* Delete Activity Logs — password protected */}
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-red-50 pb-3 text-red-700">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-sm font-bold uppercase tracking-wider">Delete Activity Logs</h3>
            </div>
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <Lock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
              <p className="text-[10px] text-amber-700 font-bold">Password required to clear audit logs.</p>
            </div>
            <p className="text-xs text-gray-500 font-semibold leading-relaxed">
              Clear audit activity logs. You will be prompted for the log delete password before deletion proceeds.
            </p>
            <form onSubmit={handleDeleteLogsClick} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">From</label>
                  <input type="date" required value={delLogFrom} onChange={(e) => setDelLogFrom(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs font-semibold text-gray-700 outline-none focus:bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">To</label>
                  <input type="date" required value={delLogTo} onChange={(e) => setDelLogTo(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs font-semibold text-gray-700 outline-none focus:bg-white" />
                </div>
              </div>
              <button type="submit" disabled={deletingLogs}
                className="w-full bg-red-600 text-white py-2.5 rounded-lg text-xs font-bold hover:bg-red-700 shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                {deletingLogs ? 'Clearing Logs...' : 'Clear Activity Logs'}
              </button>
            </form>
          </div>

          {/* Change Log Delete Password — Owner/Admin only */}
          {canChangePassword && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <button
                type="button"
                onClick={() => { setShowChangePwd(!showChangePwd); setCpError(''); setCpSuccess(''); }}
                className="flex items-center gap-2 w-full border-b border-gray-50 pb-3 text-left"
              >
                <KeyRound className="w-4 h-4 text-lodge-brown" />
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex-1">
                  Change Log Delete Password
                </h3>
                <span className="text-[10px] font-bold text-gray-400">{showChangePwd ? '▲ Hide' : '▼ Show'}</span>
              </button>

              {showChangePwd && (
                <form onSubmit={handleChangePassword} className="space-y-3">
                  {/* Current password */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">Current Password</label>
                    <div className="relative">
                      <input type={cpShowCurrent ? 'text' : 'password'} value={cpCurrent}
                        onChange={(e) => setCpCurrent(e.target.value)} required placeholder="Current password"
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 pr-9 text-sm font-medium outline-none focus:bg-white" />
                      <button type="button" onClick={() => setCpShowCurrent(!cpShowCurrent)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {cpShowCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {/* New password */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">New Password</label>
                    <div className="relative">
                      <input type={cpShowNew ? 'text' : 'password'} value={cpNew}
                        onChange={(e) => setCpNew(e.target.value)} required placeholder="Min 6 characters"
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 pr-9 text-sm font-medium outline-none focus:bg-white" />
                      <button type="button" onClick={() => setCpShowNew(!cpShowNew)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {cpShowNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {/* Confirm password */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">Confirm New Password</label>
                    <input type="password" value={cpConfirm} onChange={(e) => setCpConfirm(e.target.value)}
                      required placeholder="Repeat new password"
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm font-medium outline-none focus:bg-white" />
                  </div>

                  {cpError && <p className="text-[10px] text-red-600 font-bold bg-red-50 p-2 rounded-lg">⚠ {cpError}</p>}
                  {cpSuccess && <p className="text-[10px] text-emerald-600 font-bold bg-emerald-50 p-2 rounded-lg">✓ {cpSuccess}</p>}

                  <button type="submit" disabled={cpLoading}
                    className="w-full bg-lodge-brown text-white py-2.5 rounded-lg text-xs font-bold hover:bg-lodge-textDark shadow-sm transition disabled:opacity-50">
                    {cpLoading ? 'Updating...' : 'Update Password'}
                  </button>
                </form>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
