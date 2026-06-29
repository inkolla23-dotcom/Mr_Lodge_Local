import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface Booking {
  id: number;
  room_id: number;
  customer_id: number;
  check_in: string;
  check_out: string | null;
  stay_duration: string;
  num_persons: number;
  purpose: string;
  arriving_from: string;
  mode_of_travel: string;
  remarks: string;
  status: 'active' | 'checked_out';
  invoice_number: string;
  room_number: string;
  room_type: string;
  ac_type: string;
  guest_name: string;
  mobile: string;
}

interface BookingsListProps {
  onSelectInvoice: (invoiceNumber: string) => void;
}

export default function BookingsList({ onSelectInvoice }: BookingsListProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'checked_out' | 'all'>('active');

  const loadBookings = async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/bookings?status=${statusFilter}`);
      setBookings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, [statusFilter]);

  // Client search filter
  const filteredBookings = bookings.filter((b) => {
    const term = search.toLowerCase();
    if (!term) return true;
    return (
      b.guest_name.toLowerCase().includes(term) ||
      b.mobile.includes(term) ||
      b.room_number.includes(term) ||
      (b.invoice_number && b.invoice_number.toLowerCase().includes(term))
    );
  });

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-lodge-textDark">Bookings</h2>
        <p className="text-gray-500 text-sm font-medium">Registry of active stay bookings and guest archives</p>
      </div>

      {/* Search & Tabs */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by guest, mobile, room..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-lodge-accent focus:border-lodge-accent bg-gray-50/50"
          />
        </div>

        {/* Status Toggle Buttons */}
        <div className="flex gap-1.5 bg-gray-100/70 p-1 rounded-xl">
          {([
            { id: 'active', label: 'Active' },
            { id: 'checked_out', label: 'Checked Out' },
            { id: 'all', label: 'All' }
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                statusFilter === tab.id
                  ? 'bg-white text-lodge-textDark shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Room</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Guest</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Mobile</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Check-In</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Check-Out</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Invoice</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-xs text-gray-400 font-medium">
                  Loading bookings register...
                </td>
              </tr>
            ) : filteredBookings.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-xs text-gray-400 font-medium">
                  No bookings found.
                </td>
              </tr>
            ) : (
              filteredBookings.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50/50 transition">
                  <td className="p-4 text-sm font-bold text-gray-800">
                    <div>{b.room_number}</div>
                    <div className="text-[9px] text-gray-400 font-medium uppercase tracking-wider">{b.ac_type}</div>
                  </td>
                  <td className="p-4 text-sm font-semibold text-gray-800">{b.guest_name}</td>
                  <td className="p-4 text-sm text-gray-600 font-medium">{b.mobile}</td>
                  <td className="p-4 text-xs text-gray-500 font-semibold">{b.check_in}</td>
                  <td className="p-4 text-xs text-gray-500 font-semibold">{b.check_out || '—'}</td>
                  <td className="p-4 text-xs">
                    <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${
                      b.status === 'active' 
                        ? 'bg-rose-100 text-rose-700' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {b.status === 'active' ? 'active' : 'checked out'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {b.invoice_number ? (
                      <button
                        onClick={() => onSelectInvoice(b.invoice_number)}
                        className="px-3 py-1.5 border border-gray-200 text-[10px] font-bold rounded-lg hover:bg-gray-50 text-gray-600 shadow-sm transition"
                      >
                        {b.invoice_number}
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs font-semibold">Pending</span>
                    )}
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
