import React, { useState, useEffect } from 'react';
import { X, LogIn, FileText, CheckCheck, Wind, Users, Settings } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface Room {
  id: number;
  room_number: string;
  floor: number;
  room_type: 'Single' | 'Double';
  ac_type: 'AC' | 'Non AC';
  price: string;
  status: 'Available' | 'Occupied' | 'Reserved' | 'Cleaning' | 'Maintenance';
}

interface ActiveBooking {
  id: number;
  room_id: number;
  invoice_number: string;
  guest_name: string;
  check_in: string;
  status: string;
}

interface RoomsProps {
  onCheckInRedirect: (room: Room) => void;
  onViewInvoice?: (invoiceNumber: string) => void;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  Available:   { bg: 'bg-emerald-500',  text: 'text-white', label: 'AVAILABLE' },
  Occupied:    { bg: 'bg-red-500',      text: 'text-white', label: 'OCCUPIED' },
  Reserved:    { bg: 'bg-orange-400',   text: 'text-white', label: 'RESERVED' },
  Cleaning:    { bg: 'bg-purple-500',   text: 'text-white', label: 'CLEANING' },
  Maintenance: { bg: 'bg-gray-500',     text: 'text-white', label: 'MAINTENANCE' },
};

export default function Rooms({ onCheckInRedirect, onViewInvoice }: RoomsProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeBookings, setActiveBookings] = useState<ActiveBooking[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const loadData = async () => {
    setLoading(true);
    try {
      const [roomsData, bookingsData] = await Promise.all([
        apiFetch('/rooms'),
        apiFetch('/bookings?status=active'),
      ]);
      setRooms(roomsData);
      setActiveBookings(bookingsData);
    } catch (err) { console.error('Failed to load rooms:', err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const getActiveBooking = (roomId: number) => activeBookings.find((b) => b.room_id === roomId) || null;

  const handleUpdateStatus = async (newStatus: Room['status']) => {
    if (!selectedRoom) return;
    setUpdating(true);
    try {
      await apiFetch(`/rooms/${selectedRoom.id}/status`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
      await loadData();
      setSelectedRoom(null);
    } catch { alert('Error updating status'); }
    finally { setUpdating(false); }
  };

  const handleMarkAvailable = async (room: Room, e: React.MouseEvent) => {
    e.stopPropagation();
    setUpdating(true);
    try {
      await apiFetch(`/rooms/${room.id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'Available' }) });
      await loadData();
    } catch { alert('Error updating status'); }
    finally { setUpdating(false); }
  };

  // Status counts
  const statusCounts = rooms.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  // Group rooms by floor, then filter
  const filteredRooms = statusFilter === 'All' ? rooms : rooms.filter(r => r.status === statusFilter);
  const floors = [...new Set(filteredRooms.map(r => r.floor))].sort((a, b) => a - b);
  const roomsByFloor = floors.reduce<Record<number, Room[]>>((acc, f) => {
    acc[f] = filteredRooms.filter(r => r.floor === f).sort((a, b) => a.room_number.localeCompare(b.room_number));
    return acc;
  }, {});

  return (
    <div className="flex flex-col space-y-5">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-lodge-textDark">Rooms</h2>
          <p className="text-gray-500 text-sm font-medium">Floor-wise room occupancy — {rooms.length} total rooms</p>
        </div>
        <div className="flex gap-2 text-xs font-bold flex-wrap">
          <span className="bg-white border border-gray-100 rounded-lg px-3 py-1.5 shadow-sm text-gray-500">Total: <span className="text-gray-800">{rooms.length}</span></span>
          <span className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5 text-emerald-700">Free: {statusCounts['Available']||0}</span>
          <span className="bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 text-red-700">Occupied: {statusCounts['Occupied']||0}</span>
          <span className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-1.5 text-purple-700">Cleaning: {statusCounts['Cleaning']||0}</span>
        </div>
      </div>

      {/* Status Filter tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3.5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {['All', 'Available', 'Occupied', 'Reserved', 'Cleaning', 'Maintenance'].map((s) => {
            const cfg = STATUS_CONFIG[s];
            const count = statusCounts[s] || 0;
            return (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  statusFilter === s
                    ? s === 'All' ? 'bg-lodge-brown text-white shadow-sm' : `${cfg?.bg} ${cfg?.text} shadow-sm`
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-600'
                }`}>
                {s !== 'All' && <span className={`w-1.5 h-1.5 rounded-full ${statusFilter === s ? 'bg-white/60' : cfg?.bg}`} />}
                {s}
                {s !== 'All' && count > 0 && (
                  <span className={`rounded-full text-[9px] px-1.5 py-0.5 font-black ${statusFilter === s ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Floor-wise Room Layout ─────────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading rooms...</div>
      ) : filteredRooms.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400 border border-dashed rounded-2xl bg-white/50">No rooms match the selected filter.</div>
      ) : (
        <div className="space-y-4">
          {floors.map((floor) => (
            <div key={floor} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Floor Header */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/70">
                <span className="text-xs font-extrabold uppercase tracking-widest text-gray-400">Floor {floor}</span>
                <span className="text-[10px] font-bold text-gray-300">—</span>
                <span className="text-[10px] font-bold text-gray-400">{roomsByFloor[floor].length} room{roomsByFloor[floor].length !== 1 ? 's' : ''}</span>
                <div className="flex gap-1 ml-1 flex-wrap">
                  {Object.entries(
                    roomsByFloor[floor].reduce<Record<string,number>>((acc,r) => { acc[r.status]=(acc[r.status]||0)+1; return acc; }, {})
                  ).map(([s, c]) => (
                    <span key={s} className={`text-[9px] font-black px-2 py-0.5 rounded-full ${STATUS_CONFIG[s]?.bg} ${STATUS_CONFIG[s]?.text}`}>{c} {s}</span>
                  ))}
                </div>
              </div>

              {/* Room Cards Row */}
              <div className="p-4">
                <div className="flex flex-wrap gap-2.5">
                  {roomsByFloor[floor].map((room) => {
                    const cfg = STATUS_CONFIG[room.status] || STATUS_CONFIG['Available'];
                    const booking = getActiveBooking(room.id);
                    return (
                      <div
                        key={room.id}
                        className={`${cfg.bg} rounded-xl cursor-pointer shadow-sm hover:shadow-md hover:scale-[1.04] active:scale-[0.97] transition-all duration-150 overflow-hidden`}
                        style={{ width: '88px', minWidth: '80px' }}
                        onClick={() => setSelectedRoom(room)}
                      >
                        {/* Room Number */}
                        <div className="px-2.5 pt-2.5 pb-1">
                          <div className={`text-xl font-black ${cfg.text} leading-none tracking-tight`}>{room.room_number}</div>
                          <div className={`text-[8px] font-bold uppercase tracking-widest mt-0.5 ${cfg.text} opacity-70`}>{room.ac_type}</div>
                        </div>
                        {/* Type */}
                        <div className={`px-2.5 py-1 text-[8px] font-bold ${cfg.text} opacity-75 flex items-center gap-0.5`}>
                          <Users className="w-2.5 h-2.5" /> {room.room_type}
                        </div>
                        {/* Action bar */}
                        <div className="bg-black/15 px-2.5 py-1.5 flex items-center justify-between gap-1">
                          <span className={`text-[7px] font-black uppercase tracking-widest ${cfg.text} opacity-90 leading-tight`}>
                            {cfg.label}
                          </span>
                          {room.status === 'Available' && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); onCheckInRedirect(room); }}
                              title="Check In" className="p-0.5 rounded bg-white/20 hover:bg-white/40 text-white transition">
                              <LogIn className="w-2.5 h-2.5" />
                            </button>
                          )}
                          {room.status === 'Occupied' && booking && onViewInvoice && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); onViewInvoice(booking.invoice_number); }}
                              title="Open Invoice" className="p-0.5 rounded bg-white/20 hover:bg-white/40 text-white transition">
                              <FileText className="w-2.5 h-2.5" />
                            </button>
                          )}
                          {room.status === 'Cleaning' && (
                            <button type="button" onClick={(e) => handleMarkAvailable(room, e)} disabled={updating}
                              title="Mark Available" className="p-0.5 rounded bg-white/20 hover:bg-white/40 text-white transition disabled:opacity-50">
                              <CheckCheck className="w-2.5 h-2.5" />
                            </button>
                          )}
                          {(room.status === 'Reserved' || room.status === 'Maintenance') && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedRoom(room); }}
                              title="Edit Status" className="p-0.5 rounded bg-white/20 hover:bg-white/40 text-white transition">
                              <Settings className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Room Detail Modal ───────────────────────────────────────────── */}
      {selectedRoom && (() => {
        const cfg = STATUS_CONFIG[selectedRoom.status] || STATUS_CONFIG['Available'];
        const booking = getActiveBooking(selectedRoom.id);
        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden border border-gray-100">
              <div className={`${cfg.bg} px-6 py-5 flex justify-between items-start`}>
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${cfg.text} opacity-70`}>Floor {selectedRoom.floor} · Room</p>
                  <h3 className={`text-3xl font-black ${cfg.text} leading-tight`}>{selectedRoom.room_number}</h3>
                  <p className={`text-xs font-semibold ${cfg.text} opacity-80 mt-1`}>{selectedRoom.room_type} · {selectedRoom.ac_type}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button onClick={() => setSelectedRoom(null)} className="p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white"><X className="w-4 h-4" /></button>
                  <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full bg-black/20 ${cfg.text}`}>{cfg.label}</span>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-3">
                  <span className="text-xs font-bold text-gray-400 uppercase">Base Rate</span>
                  <span className="text-lg font-extrabold text-lodge-brown">₹{parseFloat(selectedRoom.price).toFixed(2)}/Day</span>
                </div>

                {selectedRoom.status === 'Occupied' && booking && (
                  <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 space-y-1">
                    <p className="text-[10px] font-bold text-red-400 uppercase">Current Guest</p>
                    <p className="text-sm font-bold text-red-800">{booking.guest_name}</p>
                    <p className="text-[10px] text-red-500 font-semibold">Check-in: {booking.check_in}</p>
                    <p className="text-[10px] text-red-400 font-semibold">Invoice: {booking.invoice_number}</p>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Change Status</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['Available','Occupied','Reserved','Cleaning','Maintenance'] as Room['status'][]).map((s) => {
                      const sc = STATUS_CONFIG[s];
                      return (
                        <button key={s} onClick={() => handleUpdateStatus(s)} disabled={updating}
                          className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${
                            selectedRoom.status === s ? `${sc.bg} ${sc.text} border-transparent shadow-sm` : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}>{s}</button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={() => setSelectedRoom(null)} className="flex-1 py-2.5 border border-gray-200 text-gray-500 rounded-lg text-xs font-bold hover:bg-gray-50">Close</button>
                  {selectedRoom.status === 'Occupied' && booking && onViewInvoice && (
                    <button onClick={() => { setSelectedRoom(null); onViewInvoice(booking.invoice_number); }}
                      className="flex-1 py-2.5 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 shadow flex items-center justify-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" /> Open Invoice
                    </button>
                  )}
                  {selectedRoom.status !== 'Occupied' && (
                    <button disabled={selectedRoom.status === 'Maintenance'}
                      onClick={() => { setSelectedRoom(null); onCheckInRedirect(selectedRoom); }}
                      className="flex-1 py-2.5 bg-lodge-brown text-white rounded-lg text-xs font-bold hover:bg-lodge-textDark disabled:bg-gray-100 disabled:text-gray-400 shadow flex items-center justify-center gap-1.5">
                      <LogIn className="w-3.5 h-3.5" /> Check-In
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
