import React, { useState, useEffect } from 'react';
import { Printer, FileText } from 'lucide-react';
import { API_BASE, PUBLIC_BASE_URL } from '../utils/api';

interface PublicInvoiceProps {
  invoiceNumber: string;
}

async function downloadPDF(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) { alert('Could not find printable area.'); return; }
  try {
    const { default: jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const ih = (canvas.height * pw) / canvas.width;
    let left = ih; let pos = 0;
    pdf.addImage(imgData, 'PNG', 0, pos, pw, ih);
    left -= ph;
    while (left > 0) { pos = left - ih; pdf.addPage(); pdf.addImage(imgData, 'PNG', 0, pos, pw, ih); left -= ph; }
    pdf.save(filename);
  } catch { alert('PDF download failed. Please use Print instead.'); }
}

export default function PublicInvoice({ invoiceNumber }: PublicInvoiceProps) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Public endpoint — no auth header needed
        const res = await fetch(`${API_BASE}/invoices/${invoiceNumber}`);
        if (!res.ok) { setError('Invoice not found.'); return; }
        setData(await res.json());
      } catch { setError('Failed to load invoice. Please try again.'); }
      finally { setLoading(false); }
    }
    if (invoiceNumber) load();
  }, [invoiceNumber]);

  if (loading) return (
    <div className="min-h-screen bg-lodge-light flex items-center justify-center">
      <p className="text-sm text-gray-400 font-medium">Loading invoice…</p>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen bg-lodge-light flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 shadow text-center max-w-sm w-full">
        <p className="text-red-500 font-bold text-sm">{error || 'Invoice not found.'}</p>
        <p className="text-xs text-gray-400 mt-2">Please check the link and try again.</p>
      </div>
    </div>
  );

  const { invoice, booking, customer, items, payments } = data;
  const rc       = parseFloat(invoice.room_charges || 0);
  const extras   = items.reduce((s: number, i: any) => s + parseFloat(i.amount || 0), 0);
  const subtotal = rc + extras;
  const gstVal   = subtotal * (parseFloat(invoice.gst_rate || 5) / 100);
  const grandTotal = subtotal + gstVal;
  const alreadyPaid = payments.reduce((s: number, p: any) => s + parseFloat(p.amount || 0), 0);
  const pending   = Math.max(0, grandTotal - alreadyPaid);
  const feedbackUrl = `${PUBLIC_BASE_URL}/public/feedback/${invoiceNumber}`;

  return (
    <div className="min-h-screen bg-lodge-light py-8 px-4">
      {/* Action Bar */}
      <div className="max-w-2xl mx-auto mb-4 flex gap-2 no-print">
        <button onClick={() => window.print()}
          className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 bg-white rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-sm">
          <Printer className="w-4 h-4" /> Print
        </button>
        <button onClick={async () => { setPdfLoading(true); await downloadPDF('pub-invoice-area', `Invoice-${invoiceNumber}.pdf`); setPdfLoading(false); }}
          disabled={pdfLoading}
          className="flex items-center gap-1.5 px-4 py-2 bg-lodge-brown text-white rounded-lg text-xs font-bold hover:bg-lodge-textDark shadow-sm disabled:opacity-60">
          <FileText className="w-4 h-4" /> {pdfLoading ? 'Generating…' : 'Download PDF'}
        </button>
      </div>

      {/* Invoice */}
      <div id="pub-invoice-area" className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg border border-gray-100 p-8 print-card">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-gray-200 pb-6 mb-6 gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full border p-1 bg-white flex items-center justify-center">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-lodge-textDark">Mallikarjun (Ravi) Lodge</h1>
              <p className="text-[10px] text-gray-500 font-bold mt-0.5">4-8-495/1, Gowliguda, Ram Mandir Road, Near MGBS, Hyderabad - 500012</p>
              <p className="text-[10px] text-gray-400 font-bold mt-0.5">Phone: 6300 100 426 &nbsp;|&nbsp; GST: 36EJUPR1626A1Z2</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-black uppercase text-gray-600 tracking-wider">Tax Invoice</p>
            <p className="text-xs font-extrabold text-gray-800 mt-1">{invoiceNumber}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{invoice.created_at}</p>
            <span className={`inline-block mt-1.5 text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
              invoice.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
              invoice.status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
            }`}>{invoice.status}</span>
          </div>
        </div>

        {/* Guest & Stay */}
        <div className="grid grid-cols-2 gap-6 border-b border-gray-100 pb-6 mb-6 text-xs">
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">Guest</p>
            <p className="font-extrabold text-gray-800 text-sm">{customer.name}</p>
            <p className="text-gray-500 font-semibold mt-0.5">{customer.mobile}</p>
            <p className="text-gray-400 font-semibold mt-0.5">{customer.nationality}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">Stay</p>
            <p className="font-extrabold text-gray-800 text-sm">Room {booking.room_number}</p>
            <p className="text-gray-500 font-semibold mt-0.5">{booking.room_type} · {booking.ac_type}</p>
            <p className="text-gray-400 font-semibold mt-0.5">In: {booking.check_in}</p>
            {booking.check_out && <p className="text-gray-400 font-semibold">Out: {booking.check_out}</p>}
          </div>
        </div>

        {/* Charges Table */}
        <table className="w-full text-xs border-collapse mb-6">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="p-3 text-left font-extrabold text-gray-500 uppercase tracking-wider">Description</th>
              <th className="p-3 text-right font-extrabold text-gray-500 uppercase tracking-wider">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <tr>
              <td className="p-3 font-semibold text-gray-700">Room Charges ({booking.stay_duration})</td>
              <td className="p-3 text-right font-bold text-gray-800">₹{rc.toFixed(2)}</td>
            </tr>
            {items.map((item: any, idx: number) => (
              <tr key={idx}>
                <td className="p-3 font-semibold text-gray-600">{item.description}</td>
                <td className="p-3 text-right font-bold text-gray-800">₹{parseFloat(item.amount).toFixed(2)}</td>
              </tr>
            ))}
            <tr className="border-t border-gray-200">
              <td className="p-3 text-right font-bold text-gray-500">Subtotal</td>
              <td className="p-3 text-right font-bold text-gray-800">₹{subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td className="p-3 text-right font-bold text-gray-500">GST @ {invoice.gst_rate}%</td>
              <td className="p-3 text-right font-bold text-gray-800">₹{gstVal.toFixed(2)}</td>
            </tr>
            <tr className="bg-lodge-light/30 text-sm font-extrabold text-gray-800">
              <td className="p-3 text-right">Grand Total</td>
              <td className="p-3 text-right">₹{grandTotal.toFixed(2)}</td>
            </tr>
            <tr className="text-emerald-700 font-bold">
              <td className="p-3 text-right">Paid</td>
              <td className="p-3 text-right">₹{alreadyPaid.toFixed(2)}</td>
            </tr>
            <tr className={`text-sm font-extrabold ${pending > 0.01 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              <td className="p-3 text-right">{pending > 0.01 ? 'Pending' : '✓ Fully Paid'}</td>
              <td className="p-3 text-right">₹{pending.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        {/* Footer */}
        <div className="flex justify-between items-end border-t border-gray-200 pt-5">
          <div className="text-[9px] text-gray-400 font-bold uppercase leading-loose">
            <p>Thank you for staying with us.</p>
            <p>Intercom: 777</p>
          </div>
          <div className="flex flex-col items-center gap-1 bg-gray-50 p-2 rounded-xl border border-gray-100">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(feedbackUrl)}`}
              alt="QR Feedback"
              className="w-14 h-14"
            />
            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Scan to review</span>
          </div>
        </div>
      </div>
    </div>
  );
}
