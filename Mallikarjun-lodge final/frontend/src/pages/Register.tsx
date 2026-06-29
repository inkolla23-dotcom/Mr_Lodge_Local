import React, { useState } from 'react';
import { User, Mail, Lock, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface RegisterProps {
  onNavigateToLogin: () => void;
}

export default function Register({ onNavigateToLogin }: RegisterProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
      });
      setSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Access request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-lodge-light flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8 flex flex-col items-center">
        {/* Logo */}
        <div className="w-20 h-20 rounded-full bg-lodge-light p-2 border border-gray-200 flex items-center justify-center mb-4">
          <img src="/logo.png" alt="Mallikarjun Lodge Logo" className="w-full h-full object-contain" />
        </div>

        {success ? (
          <div className="w-full flex flex-col items-center text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-emerald-500" />
            <h2 className="text-xl font-bold text-gray-800">Access Request Submitted</h2>
            <p className="text-sm text-gray-500 max-w-xs font-medium">
              Your registration request has been received. Please contact the Owner or Admin to approve your account.
            </p>
            <button
              onClick={onNavigateToLogin}
              className="mt-4 bg-lodge-brown text-white px-6 py-2.5 rounded-lg text-sm font-semibold shadow hover:bg-lodge-textDark transition"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-lodge-textDark text-center mb-1">Request Staff Access</h2>
            <p className="text-gray-500 text-sm text-center mb-8 font-medium">Register for a new staff/admin account</p>

            {errorMsg && (
              <div className="w-full bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4 border border-red-100 font-medium">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="w-full space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Full Name</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent focus:border-lodge-accent outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Email Address</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@mrlodge.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent focus:border-lodge-accent outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Password</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent focus:border-lodge-accent outline-none transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-lodge-brown text-white py-3 rounded-lg font-semibold text-sm shadow hover:bg-lodge-textDark transition disabled:opacity-50 mt-2"
              >
                {loading ? 'Submitting Request...' : 'Submit Request'}
              </button>
            </form>

            <div className="mt-8 text-center text-sm">
              <span className="text-gray-500 font-medium">Already have an account? </span>
              <button
                onClick={onNavigateToLogin}
                className="text-lodge-accent hover:text-lodge-hover font-bold"
              >
                Sign In
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
