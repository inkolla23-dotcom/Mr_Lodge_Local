import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface Invoice {
  id: number;
  invoice_number: string;
  room_charges: string;
  gst_rate: string;
  paid_amount: string;      // invoices.paid_amount (synced)
  real_paid_amount: string; // SUM(payments.amount) — computed by API
  extras_total: string;     // SUM(invoice_items.amount) — computed by API
  payment_method: string;
  status: 'paid' | 'partial' | 'unpaid';
  created_at: string;
  room_number: string;
  guest_name: string;
  mobile: string;
}

interface InvoicesListProps {
  onSelectInvoice: (invoiceNumber: string) => void;
}

export default function InvoicesList({ onSelectInvoice }: InvoicesListProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/invoices?status=${statusFilter}&search=${search}`);
      setInvoices(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadInvoices(); }, [statusFilter, search]);

  const getStatusBadge = (status: Invoice['status']) => {
    switch (status) {
      case 'paid':    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'partial': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'unpaid':  return 'bg-red-100 text-red-800 border-red-200';
      default:        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Grand total = room_charges + extras + gst on (room+extras)
  const getGrandTotal = (inv: Invoice) => {
    const rc = parseFloat(inv.room_charges || '0');
    const extras = parseFloat(inv.extras_total || '0');
    const subtotal = rc + extras;
    const gst = subtotal * (parseFloat(inv.gst_rate || '0') / 100);
    return subtotal + gst;
  };

  // Real paid = from payments table (always correct, never double-counted)
  const getRealPaid = (inv: Invoice) => parseFloat(inv.real_paid_amount || inv.paid_amount || '0');

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-lodge-textDark">Invoices</h2>
        <p className="text-gray-500 text-sm font-medium">Search and review guest checkout statements</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="relative w-full md:w-80">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400"><Search className="w-4 h-4" /></span>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice, guest, mobile..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-lodge-accent bg-gray-50/50" />
        </div>
        <div className="flex gap-2">
          {['all', 'unpaid', 'partial', 'paid'].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition uppercase tracking-wider ${
                statusFilter === s ? 'bg-lodge-brown text-white shadow-sm' : 'bg-gray-50 hover:bg-gray-100 text-gray-600'
              }`}>{s}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Invoice #', 'Date', 'Guest', 'Room', 'Grand Total', 'Paid', 'Pending', 'Status', ''].map((h) => (
                <th key={h} className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={9} className="p-8 text-center text-xs text-gray-400">Loading invoices...</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={9} className="p-8 text-center text-xs text-gray-400">No invoices found.</td></tr>
            ) : invoices.map((inv) => {
              const grandTotal = getGrandTotal(inv);
              const paid = getRealPaid(inv);
              // Cap paid at grandTotal to prevent display of paid > total
              const displayPaid = Math.min(paid, grandTotal);
              const pending = Math.max(0, grandTotal - displayPaid);
              return (
                <tr key={inv.id} className="hover:bg-gray-50/50 transition">
                  <td className="p-4 text-sm font-bold text-gray-800">{inv.invoice_number}</td>
                  <td className="p-4 text-xs text-gray-500 font-semibold">{inv.created_at}</td>
                  <td className="p-4 text-sm font-semibold text-gray-800">
                    <div>{inv.guest_name}</div>
                    <div className="text-[10px] text-gray-400">{inv.mobile}</div>
                  </td>
                  <td className="p-4 text-sm font-bold text-gray-700">{inv.room_number}</td>
                  <td className="p-4 text-sm font-semibold text-gray-800">₹{grandTotal.toFixed(2)}</td>
                  <td className="p-4 text-sm font-semibold text-emerald-600">₹{displayPaid.toFixed(2)}</td>
                  <td className="p-4 text-sm font-semibold text-red-600">₹{pending.toFixed(2)}</td>
                  <td className="p-4 text-xs">
                    <span className={`px-2.5 py-1 rounded-full font-bold uppercase tracking-wider text-[9px] border ${getStatusBadge(inv.status)}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button onClick={() => onSelectInvoice(inv.invoice_number)}
                      className="px-3 py-1.5 border border-gray-200 text-xs font-bold rounded-lg hover:bg-gray-50 text-gray-600 transition">
                      Open
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
