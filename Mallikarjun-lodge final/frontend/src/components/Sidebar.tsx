import React from 'react';
import { 
  LayoutDashboard, 
  Bed, 
  Settings, 
  CalendarDays, 
  FileSpreadsheet, 
  MessageSquare, 
  BookOpen, 
  BarChart3, 
  UserCheck, 
  Activity, 
  LogOut,
  Database
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  user: { email: string; name: string; role: string } | null;
  onLogout: () => void;
}

export default function Sidebar({ currentTab, setCurrentTab, user, onLogout }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'rooms', label: 'Rooms', icon: Bed },
    { id: 'room-master', label: 'Room Master', icon: Settings },
    { id: 'bookings', label: 'Bookings', icon: CalendarDays },
    { id: 'invoices', label: 'Invoices', icon: FileSpreadsheet },
    { id: 'reviews', label: 'Reviews', icon: MessageSquare },
    { id: 'ledger-book', label: 'Ledger Book', icon: BookOpen },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
  ];

  const adminItems = [
    { id: 'user-access', label: 'User Access', icon: UserCheck },
    { id: 'activity-log', label: 'Activity Log', icon: Activity },
  ];

  // System Backup — Owner and Admin only
  const isOwnerOrAdmin = user?.role === 'Owner' || user?.role === 'Admin';

  return (
    <aside className="w-64 bg-lodge-brown text-lodge-textBeige flex flex-col min-h-screen shadow-lg no-print select-none">
      {/* Brand Header */}
      <div className="p-6 flex items-center gap-3 border-b border-lodge-brown/20 bg-lodge-brown/10">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-white p-0.5 flex items-center justify-center">
          <img src="/logo.png" alt="MR Logo" className="w-full h-full object-contain" />
        </div>
        <div>
          <h1 className="font-semibold text-white tracking-wide text-sm leading-tight">MR Lodge</h1>
          <p className="text-[10px] text-gray-400 font-medium">Management</p>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive 
                  ? 'bg-lodge-accent text-lodge-brown font-semibold shadow-md' 
                  : 'hover:bg-white/5 hover:text-white text-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}

        {/* Admin Section Header */}
        <div className="pt-6 pb-2 px-4 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
          Admin
        </div>

        {adminItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive 
                  ? 'bg-lodge-accent text-lodge-brown font-semibold shadow-md' 
                  : 'hover:bg-white/5 hover:text-white text-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
        {/* System Backup — Owner / Admin only */}
        {isOwnerOrAdmin && (
          <button
            onClick={() => setCurrentTab('system-backup')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              currentTab === 'system-backup'
                ? 'bg-lodge-accent text-lodge-brown font-semibold shadow-md'
                : 'hover:bg-white/5 hover:text-white text-gray-300'
            }`}
          >
            <Database className="w-4 h-4" />
            System Backup
          </button>
        )}
      </nav>

      {/* User Footer */}
      <div className="p-4 border-t border-lodge-brown/20 bg-lodge-brown/20 flex flex-col gap-2">
        {user && (
          <div className="px-2 py-1">
            <p className="text-xs text-gray-400 font-medium truncate">{user.email}</p>
            <p className="text-[10px] text-lodge-accent font-semibold">{user.role}</p>
          </div>
        )}
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all duration-200"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
