import React, { useState } from 'react';
import { Database, Download, ShieldAlert, CheckCircle2, Clock } from 'lucide-react';
import { API_BASE } from '../utils/api';

export default function SystemBackup() {
  const [downloading, setDownloading] = useState(false);
  const [lastBackup, setLastBackup] = useState<{ time: string; size: string; filename: string } | null>(null);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const userStr = localStorage.getItem('mrlodge_user');
  const currentUser = userStr ? JSON.parse(userStr) : { name: 'Unknown', email: '', role: '' };
  const dbName = import.meta.env?.VITE_DB_NAME || 'mallikarjun_lodge';

  const handleDownloadClick = () => {
    setError('');
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setShowConfirm(false);
    setDownloading(true);
    setError('');

    try {
      const token = localStorage.getItem('mrlodge_token');
      const res = await fetch(`${API_BASE}/backup/download`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Backup generation failed');
      }

      // Get filename from Content-Disposition header
      const disposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `MRLodge_Backup_${new Date().toISOString().slice(0,16).replace('T','_').replace(':','-')}.sql`;

      // Download the blob
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      // Record backup info for display
      const now = new Date();
      const sizeKB = (blob.size / 1024).toFixed(1);
      const sizeMB = blob.size > 1024 * 1024 ? `${(blob.size / (1024 * 1024)).toFixed(2)} MB` : `${sizeKB} KB`;

      setLastBackup({
        time: now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }),
        size: sizeMB,
        filename,
      });

    } catch (err: any) {
      console.error('Backup error:', err);
      setError(err.message || 'Unable to generate database backup. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col space-y-6 pb-12">

      {/* ── Confirmation dialog ──────────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
              <Database className="w-5 h-5 text-lodge-brown" />
              <h3 className="text-sm font-bold text-gray-800">Confirm Backup Download</h3>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-gray-600 font-semibold">
                Download complete database backup?
              </p>
              <p className="text-xs text-gray-400 font-medium">
                This will export all tables and data from <span className="font-bold text-gray-600">{dbName}</span> as a <code className="bg-gray-100 px-1 rounded text-[11px]">.sql</code> file you can use to restore later.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex items-center gap-1.5 px-5 py-2 bg-lodge-brown text-white rounded-lg text-xs font-bold hover:bg-lodge-textDark shadow transition"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold text-lodge-textDark">System Backup</h2>
        <p className="text-gray-500 text-sm font-medium">Download a complete backup of the lodge database</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ── Download card ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
            <div className="p-2.5 bg-lodge-brown/10 rounded-xl">
              <Database className="w-5 h-5 text-lodge-brown" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-800">Database Backup</h3>
              <p className="text-[11px] text-gray-400 font-medium">Full SQL export of all tables and records</p>
            </div>
          </div>

          <p className="text-xs text-gray-500 font-semibold leading-relaxed">
            Download the latest backup of the entire lodge database. The backup file contains all tables, records, bookings, invoices, guests, payments, and settings — and can be used to restore the database at any time.
          </p>

          {/* Database info */}
          <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100">
            {[
              { label: 'Database Name', value: dbName },
              { label: 'Generated By', value: `${currentUser.name} (${currentUser.role})` },
              { label: 'Format', value: '.sql — MySQL compatible' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center px-4 py-3 text-xs">
                <span className="font-bold text-gray-400 uppercase tracking-wider">{label}</span>
                <span className="font-semibold text-gray-700">{value}</span>
              </div>
            ))}
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-3">
              <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 font-semibold">{error}</p>
            </div>
          )}

          {/* Success / last backup info */}
          {lastBackup && (
            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-700 font-semibold space-y-0.5">
                <p>Backup downloaded successfully!</p>
                <p className="text-emerald-500 font-medium">{lastBackup.filename}</p>
              </div>
            </div>
          )}

          <button
            onClick={handleDownloadClick}
            disabled={downloading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-lodge-brown text-white rounded-xl font-bold text-sm hover:bg-lodge-textDark transition shadow disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'Generating Backup…' : 'Download Database Backup'}
          </button>
        </div>

        {/* ── Last backup info card ──────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
            <div className="p-2.5 bg-gray-100 rounded-xl">
              <Clock className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-800">Last Backup</h3>
              <p className="text-[11px] text-gray-400 font-medium">Most recent download in this session</p>
            </div>
          </div>

          {lastBackup ? (
            <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100">
              {[
                { label: 'Backup Time', value: lastBackup.time },
                { label: 'File Size', value: lastBackup.size },
                { label: 'Filename', value: lastBackup.filename },
                { label: 'Generated By', value: `${currentUser.name} (${currentUser.role})` },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center px-4 py-3 text-xs">
                  <span className="font-bold text-gray-400 uppercase tracking-wider">{label}</span>
                  <span className="font-semibold text-gray-700 text-right max-w-[55%] break-all">{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-40 flex flex-col items-center justify-center text-center text-gray-300 border border-dashed rounded-xl gap-2">
              <Clock className="w-8 h-8" />
              <p className="text-xs font-semibold">No backup downloaded yet in this session.</p>
              <p className="text-[10px] font-medium text-gray-200">Click Download to create the first backup.</p>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-2">
            <p className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider">Restore Instructions</p>
            <ul className="text-[10px] text-amber-700 font-semibold space-y-1 list-disc list-inside leading-relaxed">
              <li>Open MySQL Workbench or phpMyAdmin</li>
              <li>Create or select target database</li>
              <li>Import the downloaded <code className="bg-amber-100 px-1 rounded">.sql</code> file</li>
              <li>All tables and data will be restored</li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
