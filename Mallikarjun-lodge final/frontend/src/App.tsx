import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Rooms from './pages/Rooms';
import RoomMaster from './pages/RoomMaster';
import BookingsList from './pages/BookingsList';
import InvoicesList from './pages/InvoicesList';
import InvoiceDetail from './pages/InvoiceDetail';
import ReviewsPage from './pages/ReviewsPage';
import LedgerBook from './pages/LedgerBook';
import Reports from './pages/Reports';
import UserAccess from './pages/UserAccess';
import ActivityLog from './pages/ActivityLog';
import CheckIn from './pages/CheckIn';
import Login from './pages/Login';
import Register from './pages/Register';
import Feedback from './pages/Feedback';
import { SESSION_EXPIRED_EVENT, clearSession } from './utils/api';
import PublicInvoice from './pages/PublicInvoice';
import PublicFeedback from './pages/PublicFeedback';
import SystemBackup from './pages/SystemBackup';

interface User { email: string; name: string; role: string; }

// ── Tiny path-based router helper ────────────────────────────────────────────
function getPublicRoute(): { type: 'invoice' | 'feedback' | 'none'; param: string } {
  const path = window.location.pathname;

  // /public/invoice/MR-26-10001
  const invoiceMatch = path.match(/^\/public\/invoice\/(.+)$/);
  if (invoiceMatch) return { type: 'invoice', param: invoiceMatch[1] };

  // /public/feedback/MR-26-10001
  const feedbackMatch = path.match(/^\/public\/feedback\/(.+)$/);
  if (feedbackMatch) return { type: 'feedback', param: feedbackMatch[1] };

  // Legacy: /feedback?inv=MR-26-10001
  if (path.includes('/feedback') || window.location.search.includes('inv=')) {
    const inv = new URLSearchParams(window.location.search).get('inv') || '';
    return { type: 'feedback', param: inv };
  }

  return { type: 'none', param: '' };
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [showRegister, setShowRegister] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState<string>('');
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState<string>('');

  // Detect public routes before auth check
  const publicRoute = getPublicRoute();

  useEffect(() => {
    const savedUser = localStorage.getItem('mrlodge_user');
    const savedToken = localStorage.getItem('mrlodge_token');
    if (savedUser && savedToken && savedToken !== 'undefined' && savedToken !== 'null') {
      try { setUser(JSON.parse(savedUser)); } catch {
        clearSession();
      }
    }
    setAuthChecked(true);

    // Listen for session-expired events fired by apiFetch when backend returns 401.
    // This handles token expiry and invalid-token scenarios gracefully —
    // instead of showing "Invalid token", we clear state and return to login.
    const handleSessionExpired = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      clearSession();
      setUser(null);
      setCurrentTab('dashboard');
      setSessionExpiredMsg(detail?.message || 'Session expired. Please login again.');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  // ── Public pages — render immediately, NO login required ─────────────────
  if (publicRoute.type === 'invoice') {
    return <PublicInvoice invoiceNumber={publicRoute.param} />;
  }
  if (publicRoute.type === 'feedback') {
    return <PublicFeedback invoiceNumber={publicRoute.param} />;
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-lodge-light flex items-center justify-center font-bold text-gray-400">
        Booting Mallikarjun Lodge System…
      </div>
    );
  }

  if (!user) {
    if (showRegister) return <Register onNavigateToLogin={() => setShowRegister(false)} />;
    return (
      <>
        {sessionExpiredMsg && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold px-5 py-3 rounded-xl shadow-lg">
            ⚠ {sessionExpiredMsg}
          </div>
        )}
        <Login
          onLoginSuccess={(userData) => {
            setUser(userData);
            setShowRegister(false);
            setCurrentTab('dashboard');
            setSessionExpiredMsg('');
          }}
          onNavigateToRegister={() => setShowRegister(true)}
        />
      </>
    );
  }

  const handleLogout = () => {
    localStorage.removeItem('mrlodge_token');
    localStorage.removeItem('mrlodge_user');
    setUser(null);
    setCurrentTab('dashboard');
  };

  const renderTabContent = () => {
    switch (currentTab) {
      case 'dashboard': return <Dashboard />;
      case 'rooms':
        return (
          <Rooms
            onCheckInRedirect={(room) => { setSelectedRoom(room); setCurrentTab('check-in'); }}
            onViewInvoice={(inv) => { setSelectedInvoiceNumber(inv); setCurrentTab('invoice-detail'); }}
          />
        );
      case 'check-in':
        return (
          <CheckIn
            selectedRoom={selectedRoom}
            onCheckInComplete={(inv) => { setSelectedInvoiceNumber(inv); setCurrentTab('invoice-detail'); }}
            onCancel={() => setCurrentTab('rooms')}
          />
        );
      case 'room-master': return <RoomMaster />;
      case 'bookings':
        return (
          <BookingsList
            onSelectInvoice={(inv) => { setSelectedInvoiceNumber(inv); setCurrentTab('invoice-detail'); }}
          />
        );
      case 'invoices':
        return (
          <InvoicesList
            onSelectInvoice={(inv) => { setSelectedInvoiceNumber(inv); setCurrentTab('invoice-detail'); }}
          />
        );
      case 'invoice-detail':
        return (
          <InvoiceDetail
            invoiceNumber={selectedInvoiceNumber}
            onBackToList={() => setCurrentTab('invoices')}
          />
        );
      case 'reviews': return <ReviewsPage />;
      case 'ledger-book': return <LedgerBook />;
      case 'reports': return <Reports />;
      case 'user-access': return user?.role === 'Owner' ? <UserAccess /> : <Dashboard />;
      case 'activity-log': return (user?.role === 'Owner' || user?.role === 'Admin') ? <ActivityLog /> : <Dashboard />;
      case 'system-backup': return (user?.role === 'Owner' || user?.role === 'Admin') ? <SystemBackup /> : <Dashboard />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex bg-lodge-light min-h-screen">
      <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} user={user} onLogout={handleLogout} />
      <main className="flex-1 p-6 md:p-10 overflow-y-auto max-h-screen">
        {renderTabContent()}
      </main>
    </div>
  );
}
