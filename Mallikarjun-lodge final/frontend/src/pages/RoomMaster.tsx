import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, AlertTriangle } from 'lucide-react';
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

export default function RoomMaster() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  // Force-delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null);
  const [deleteInfo, setDeleteInfo] = useState<{ bookingCount: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // Form fields
  const [roomNumber, setRoomNumber] = useState('');
  const [floor, setFloor] = useState(1);
  const [roomType, setRoomType] = useState<'Single' | 'Double'>('Single');
  const [acType, setAcType] = useState<'AC' | 'Non AC'>('Non AC');
  const [price, setPrice] = useState('');
  const [status, setStatus] = useState<Room['status']>('Available');

  const loadRooms = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/rooms');
      setRooms(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRooms();
  }, []);

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/rooms', {
        method: 'POST',
        body: JSON.stringify({
          room_number: roomNumber,
          floor,
          room_type: roomType,
          ac_type: acType,
          price: parseFloat(price),
          status
        })
      });
      setShowAddModal(false);
      resetForm();
      loadRooms();
    } catch (err: any) {
      alert(err.message || 'Failed to add room');
    }
  };

  const handleEditRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom) return;
    try {
      await apiFetch(`/rooms/${editingRoom.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          room_number: roomNumber,
          floor,
          room_type: roomType,
          ac_type: acType,
          price: parseFloat(price),
          status
        })
      });
      setEditingRoom(null);
      resetForm();
      loadRooms();
    } catch (err: any) {
      alert(err.message || 'Failed to update room');
    }
  };

  const handleDeleteRoom = async (room: Room) => {
    // First attempt — no force flag
    try {
      setDeleting(true);
      await apiFetch(`/rooms/${room.id}`, { method: 'DELETE' });
      loadRooms();
    } catch (err: any) {
      if (err.status === 409 || (err.message && err.message.includes('bookings'))) {
        // Room has related data — show force-delete confirmation modal
        const info = err.data || {};
        setDeleteTarget(room);
        setDeleteInfo({ bookingCount: info.bookingCount || 1 });
      } else {
        alert(err.message || 'Failed to delete room');
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleForceDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/rooms/${deleteTarget.id}?force=true`, { method: 'DELETE' });
      setDeleteTarget(null);
      setDeleteInfo(null);
      loadRooms();
    } catch (err: any) {
      alert(err.message || 'Force delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const resetForm = () => {
    setRoomNumber('');
    setFloor(1);
    setRoomType('Single');
    setAcType('Non AC');
    setPrice('');
    setStatus('Available');
  };

  const openEditModal = (room: Room) => {
    setEditingRoom(room);
    setRoomNumber(room.room_number);
    setFloor(room.floor);
    setRoomType(room.room_type);
    setAcType(room.ac_type);
    setPrice(parseFloat(room.price).toString());
    setStatus(room.status);
  };

  return (
    <div className="flex flex-col space-y-6">

      {/* ── Force-Delete Confirmation Modal ─────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-red-100 bg-red-50">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <h3 className="text-sm font-bold text-red-800">Delete Room with All Records?</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm font-semibold text-gray-700">
                Room <span className="font-extrabold text-red-700">{deleteTarget.room_number}</span> has existing records that will also be permanently deleted.
              </p>
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-xs space-y-1.5 text-red-700 font-semibold">
                <p>🗑 {deleteInfo?.bookingCount || '?'} Booking record(s)</p>
                <p>🗑 Related Invoice(s) and payment history</p>
                <p>🗑 Guest documents and additional guest records</p>
                <p className="text-[10px] font-bold text-red-400 pt-1 uppercase tracking-wider">This action cannot be undone.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteInfo(null); }}
                disabled={deleting}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleForceDelete}
                disabled={deleting}
                className="px-5 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-60 shadow transition"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Everything'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-lodge-textDark">Room Master</h2>
          <p className="text-gray-500 text-sm font-medium">Add, edit, delete rooms & prices</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}
          className="flex items-center gap-1.5 bg-orange-700 text-white px-4 py-2.5 rounded-lg text-xs font-bold hover:bg-orange-800 shadow transition"
        >
          <Plus className="w-4 h-4" /> Add Room
        </button>
      </div>

      {/* Rooms Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Room</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Floor</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">AC</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Price</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-xs text-gray-400 font-medium">
                  Loading room master registry...
                </td>
              </tr>
            ) : rooms.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-xs text-gray-400 font-medium">
                  No rooms created. Click "Add Room" to create one.
                </td>
              </tr>
            ) : (
              rooms.map((room) => (
                <tr key={room.id} className="hover:bg-gray-50/50 transition">
                  <td className="p-4 text-sm font-bold text-gray-800">{room.room_number}</td>
                  <td className="p-4 text-sm text-gray-600 font-medium">{room.floor}</td>
                  <td className="p-4 text-sm text-gray-600 font-medium">{room.room_type}</td>
                  <td className="p-4 text-sm text-gray-600 font-medium">{room.ac_type}</td>
                  <td className="p-4 text-sm text-lodge-brown font-semibold">
                    ₹{parseFloat(room.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-xs">
                    <span className={`px-2.5 py-1 rounded-full font-bold uppercase tracking-wider text-[10px] ${
                      room.status === 'Available' ? 'bg-emerald-100 text-emerald-700' :
                      room.status === 'Occupied' ? 'bg-red-100 text-red-700' :
                      room.status === 'Reserved' ? 'bg-amber-100 text-amber-700' :
                      room.status === 'Cleaning' ? 'bg-purple-100 text-purple-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {room.status}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => openEditModal(room)}
                      className="p-1.5 text-gray-400 hover:text-lodge-brown hover:bg-gray-100 rounded-md transition inline-block"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteRoom(room)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition inline-block"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Room Modal */}
      {(showAddModal || editingRoom) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form
            onSubmit={showAddModal ? handleAddRoom : handleEditRoomSubmit}
            className="bg-white rounded-2xl max-w-md w-full border border-gray-100 shadow-2xl p-6 relative flex flex-col space-y-4 animate-in zoom-in-95 duration-200"
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-bold text-gray-800">
                {showAddModal ? 'Add New Room' : `Edit Room ${editingRoom?.room_number}`}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingRoom(null);
                }}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-400 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Fields */}
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Room Number</label>
              <input
                type="text"
                required
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                placeholder="e.g. 101"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent focus:border-lodge-accent outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Floor</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={10}
                  value={floor}
                  onChange={(e) => setFloor(parseInt(e.target.value))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent focus:border-lodge-accent outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Base Rate (₹)</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent focus:border-lodge-accent outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Capacity</label>
                <select
                  value={roomType}
                  onChange={(e) => setRoomType(e.target.value as 'Single' | 'Double')}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent focus:border-lodge-accent outline-none"
                >
                  <option value="Single">Single</option>
                  <option value="Double">Double</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">AC / Non AC</label>
                <select
                  value={acType}
                  onChange={(e) => setAcType(e.target.value as 'AC' | 'Non AC')}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent focus:border-lodge-accent outline-none"
                >
                  <option value="AC">AC</option>
                  <option value="Non AC">Non AC</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Initial Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Room['status'])}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent focus:border-lodge-accent outline-none"
              >
                <option value="Available">Available</option>
                <option value="Occupied">Occupied</option>
                <option value="Reserved">Reserved</option>
                <option value="Cleaning">Cleaning</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingRoom(null);
                }}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-orange-700 text-white rounded-lg text-xs font-bold hover:bg-orange-800 transition shadow"
              >
                {showAddModal ? 'Create Room' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
