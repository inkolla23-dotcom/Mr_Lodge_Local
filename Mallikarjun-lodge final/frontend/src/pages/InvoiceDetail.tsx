import React, { useState, useEffect } from 'react';
import { FileText, Share2, Link2, Save, LogOut, Plus, Trash, Printer, X, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { apiFetch, PUBLIC_BASE_URL } from '../utils/api';

interface ExtraCharge { description: string; amount: string; }
interface Payment { id?: number; amount: string; method: string; timestamp: string; created_by?: string; }

interface InvoiceDetailProps {
  invoiceNumber: string;
  onBackToList: () => void;
}

// ── PDF Download ─────────────────────────────────────────────────────────────
async function downloadPDF(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) { alert('Could not find printable area.'); return; }
  try {
    const { default: jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
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
  } catch (err) {
    console.error('PDF error:', err);
    alert('PDF download failed. Use Print instead.');
  }
}

export default function InvoiceDetail({ invoiceNumber, onBackToList }: InvoiceDetailProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);

  // Invoice editable fields
  const [roomCharges, setRoomCharges] = useState('');
  const [gstRate, setGstRate] = useState('5');
  const [extraCharges, setExtraCharges] = useState<ExtraCharge[]>([]);
  const [newExtraDesc, setNewExtraDesc] = useState('');
  const [newExtraAmount, setNewExtraAmount] = useState('');

  // Payment entry — "Paid Amount" field (total collected so far for this session)
  const [paidAmountInput, setPaidAmountInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [showPayConfirm, setShowPayConfirm] = useState(false);
  const [pendingPaymentToAdd, setPendingPaymentToAdd] = useState(0);

  // Existing payments from DB (read-only history)
  const [payments, setPayments] = useState<Payment[]>([]);

  // Checkout modal
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutPayAmt, setCheckoutPayAmt] = useState('');
  const [checkoutPayMethod, setCheckoutPayMethod] = useState('UPI');
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const loadInvoice = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/invoices/${invoiceNumber}`);
      setData(res);
      setRoomCharges(parseFloat(res.invoice.room_charges).toString());
      setGstRate(parseFloat(res.invoice.gst_rate).toString());
      setExtraCharges(res.items.map((i: any) => ({ description: i.description, amount: parseFloat(i.amount).toString() })));
      setPayments(res.payments);
      setPaidAmountInput('');
      setPaymentMethod(res.invoice.payment_method || 'UPI');
    } catch (err) { console.error(err); alert('Failed to load invoice'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadInvoice(); }, [invoiceNumber]);

  // ── Calculations ──────────────────────────────────────────────────────────
  const rc = parseFloat(roomCharges || '0');
  const extraSum = extraCharges.reduce((s, c) => s + parseFloat(c.amount || '0'), 0);
  const subtotal = rc + extraSum;
  const gstVal = subtotal * (parseFloat(gstRate || '0') / 100);
  const grandTotal = subtotal + gstVal;

  // Total already paid (from payments DB records)
  const alreadyPaid = payments.reduce((s, p) => s + parseFloat(p.amount || '0'), 0);
  const pendingAmount = Math.max(0, grandTotal - alreadyPaid);

  // "Paid Amount" field logic:
  // The field represents what the owner is entering as the NEW total collected today.
  // We compute the delta = input - alreadyPaid, that becomes the new payment transaction.
  const paidInputNum = parseFloat(paidAmountInput || '0');
  const newPaymentDelta = Math.max(0, paidInputNum - alreadyPaid);

  // Validation
  const paidInputError = paidAmountInput !== '' && (
    paidInputNum < 0 ? 'Amount cannot be negative.' :
    paidInputNum > grandTotal + 0.01 ? `Cannot exceed Grand Total ₹${grandTotal.toFixed(2)}.` :
    paidInputNum < alreadyPaid - 0.01 ? `Already collected ₹${alreadyPaid.toFixed(2)}. Enter ≥ that.` :
    ''
  );
  const saveDisabled = saving || !!paidInputError;

  // ── Add / remove extra charge ─────────────────────────────────────────────
  const addExtra = () => {
    if (!newExtraDesc || !newExtraAmount) return;
    setExtraCharges([...extraCharges, { description: newExtraDesc, amount: newExtraAmount }]);
    setNewExtraDesc(''); setNewExtraAmount('');
  };
  const removeExtra = (i: number) => setExtraCharges(extraCharges.filter((_, idx) => idx !== i));

  // ── Save Invoice ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (paidInputError) { alert(paidInputError); return; }

    // If there's a new delta to add, confirm with user
    if (paidInputNum > 0 && newPaymentDelta > 0) {
      setPendingPaymentToAdd(newPaymentDelta);
      setShowPayConfirm(true);
      return;
    }
    await executeSave(null);
  };

  const executeSave = async (newPayment: { amount: number; method: string } | null) => {
    setSaving(true);
    try {
      const body: any = {
        room_charges: parseFloat(roomCharges),
        gst_rate: parseFloat(gstRate),
        extra_charges: extraCharges.map(c => ({ description: c.description, amount: parseFloat(c.amount) })),
        payment_method: paymentMethod
      };
      if (newPayment && newPayment.amount > 0) {
        body.new_payment = { amount: newPayment.amount, method: newPayment.method };
      }
      await apiFetch(`/invoices/${invoiceNumber}`, { method: 'PUT', body: JSON.stringify(body) });
      setPaidAmountInput('');
      setShowPayConfirm(false);
      await loadInvoice();
      alert('Invoice saved successfully.');
    } catch (err: any) { console.error(err); alert(err.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  // ── Checkout ──────────────────────────────────────────────────────────────
  const handleCheckoutClick = () => {
    if (pendingAmount > 0.01) {
      setCheckoutPayAmt(pendingAmount.toFixed(2));
      setCheckoutPayMethod('UPI');
      setShowCheckoutModal(true);
    } else {
      if (!confirm('Confirm checkout for this guest?')) return;
      executeCheckout(null);
    }
  };

  const executeCheckout = async (payment: { amount: string; method: string } | null) => {
    setCheckoutLoading(true);
    try {
      // If collecting final payment, save it first
      if (payment && parseFloat(payment.amount) > 0.01) {
        await apiFetch(`/invoices/${invoiceNumber}`, {
          method: 'PUT',
          body: JSON.stringify({
            room_charges: parseFloat(roomCharges),
            gst_rate: parseFloat(gstRate),
            extra_charges: extraCharges.map(c => ({ description: c.description, amount: parseFloat(c.amount) })),
            new_payment: { amount: parseFloat(payment.amount), method: payment.method },
            payment_method: payment.method
          })
        });
      } else {
        await apiFetch(`/invoices/${invoiceNumber}`, {
          method: 'PUT',
          body: JSON.stringify({
            room_charges: parseFloat(roomCharges),
            gst_rate: parseFloat(gstRate),
            extra_charges: extraCharges.map(c => ({ description: c.description, amount: parseFloat(c.amount) })),
            payment_method: paymentMethod
          })
        });
      }
      await apiFetch(`/bookings/${data.booking.id}/checkout`, { method: 'POST' });
      setShowCheckoutModal(false);
      alert('Checkout completed. Room set to Cleaning.');
      loadInvoice();
    } catch (err: any) { alert(err.message || 'Checkout failed'); }
    finally { setCheckoutLoading(false); }
  };

  const handleModalCheckout = () => {
    const amt = parseFloat(checkoutPayAmt || '0');
    if (amt > pendingAmount + 0.01) { alert(`Payment cannot exceed pending ₹${pendingAmount.toFixed(2)}.`); return; }
    executeCheckout(amt > 0 ? { amount: checkoutPayAmt, method: checkoutPayMethod } : null);
  };

  // ── PDF & Print ───────────────────────────────────────────────────────────
  const handleDownloadPDF = async () => { setPdfLoading(true); await downloadPDF('invoice-print-area', `Invoice-${invoiceNumber}.pdf`); setPdfLoading(false); };
  const handlePrint = () => window.print();

  // ── Links ─────────────────────────────────────────────────────────────────
  // Public invoice link — no login required, opens /public/invoice/:number
  const getInvoiceLink = () => `${PUBLIC_BASE_URL}/public/invoice/${invoiceNumber}`;
  // Public feedback link — no login required, opens /public/feedback/:number
  const getFeedbackLink = () => `${PUBLIC_BASE_URL}/public/feedback/${invoiceNumber}`;

  const handleWhatsApp = () => {
    if (!data) return;
    const invoiceUrl = getInvoiceLink();
    const feedbackUrl = getFeedbackLink();
    // WhatsApp detects URLs as clickable only when they appear on a dedicated line
    // with no surrounding punctuation. Format accordingly:
    // WhatsApp makes URLs clickable when they appear as plain text with no
    // surrounding quotes, brackets, or punctuation. URL must be on its own
    // line with only whitespace before/after it.
    const msg = [
      `Dear ${data.customer.name},`,
      ``,
      `Your invoice is ready.`,
      ``,
      `Invoice: ${invoiceUrl}`,
      ``,
      `Feedback: ${feedbackUrl}`,
      ``,
      `Thank you for staying with us.`,
      `Mallikarjun (Ravi) Lodge`,
    ].join('\n');
    window.open(`https://api.whatsapp.com/send?phone=91${data.customer.mobile}&text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleCopyLink = () => { navigator.clipboard.writeText(getInvoiceLink()); alert('Public link copied to clipboard!'); };

  if (loading) return <div className="text-center py-12 text-sm text-gray-400">Loading invoice...</div>;
  if (!data) return <p className="text-center py-12 text-sm text-red-500">Invoice data error.</p>;

  const { invoice, booking, customer } = data;
  const isCheckedOut = booking.status === 'checked_out';

  return (
    <div className="flex flex-col space-y-6 pb-12">

      {/* ── Payment Confirmation Modal ───────────────────────────────────── */}
      {showPayConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <h3 className="text-sm font-bold text-gray-800">Confirm Payment Addition</h3>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs space-y-2">
                <div className="flex justify-between font-semibold text-gray-600">
                  <span>Previously Collected</span>
                  <span className="font-bold text-gray-800">₹{alreadyPaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold text-amber-700">
                  <span>Adding Now</span>
                  <span className="font-bold">₹{pendingPaymentToAdd.toFixed(2)}</span>
                </div>
                <div className="h-px bg-amber-200" />
                <div className="flex justify-between text-sm font-extrabold text-gray-800">
                  <span>New Total Paid</span>
                  <span>₹{(alreadyPaid + pendingPaymentToAdd).toFixed(2)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Add <strong>₹{pendingPaymentToAdd.toFixed(2)}</strong> to previously collected amount of <strong>₹{alreadyPaid.toFixed(2)}</strong>?
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={() => setShowPayConfirm(false)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={() => executeSave({ amount: pendingPaymentToAdd, method: paymentMethod })}
                disabled={saving}
                className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 shadow disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Yes, Add Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Checkout Modal ───────────────────────────────────────────────── */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-gray-800">Pending Amount Found</h3>
              </div>
              <button onClick={() => setShowCheckoutModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600 font-medium"><span>Grand Total</span><span className="font-bold text-gray-800">₹{grandTotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-emerald-700 font-medium"><span>Paid</span><span className="font-bold">₹{alreadyPaid.toFixed(2)}</span></div>
                <div className="h-px bg-gray-200" />
                <div className="flex justify-between font-extrabold text-red-600 text-base"><span>Pending</span><span>₹{pendingAmount.toFixed(2)}</span></div>
              </div>
              <p className="text-xs text-gray-500 font-medium">Would you like to collect the remaining amount?</p>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Collect Amount (₹)</label>
                <input type="number" value={checkoutPayAmt}
                  onChange={(e) => setCheckoutPayAmt(Math.min(parseFloat(e.target.value||'0'), pendingAmount).toFixed(2))}
                  max={pendingAmount}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-lodge-accent" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Payment Method</label>
                <select value={checkoutPayMethod} onChange={(e) => setCheckoutPayMethod(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm font-semibold outline-none">
                  <option>UPI</option><option>Cash</option><option>Card</option><option>Bank Transfer</option><option>Other</option>
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={() => setShowCheckoutModal(false)} disabled={checkoutLoading}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50">Cancel</button>
              <button onClick={() => executeCheckout(null)} disabled={checkoutLoading}
                className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50">
                Checkout Without Payment
              </button>
              <button onClick={handleModalCheckout} disabled={checkoutLoading || parseFloat(checkoutPayAmt||'0') <= 0}
                className="px-5 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 shadow">
                {checkoutLoading ? 'Processing...' : 'Collect & Checkout'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Action Ribbon ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-gray-100 p-4 rounded-2xl shadow-sm no-print">
        <button onClick={onBackToList} className="text-xs font-bold text-gray-500 hover:text-gray-700 bg-gray-50 px-4 py-2 rounded-lg">← Back</button>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleDownloadPDF} disabled={pdfLoading}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 bg-white rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
            <FileText className="w-4 h-4" /> {pdfLoading ? 'Generating...' : 'Download PDF'}
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 bg-white rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50">
            <Printer className="w-4 h-4" /> Print
          </button>
          <button onClick={handleWhatsApp}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 bg-white rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50">
            <Share2 className="w-4 h-4 text-emerald-600" /> WhatsApp
          </button>
          <button onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 bg-white rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50">
            <Link2 className="w-4 h-4" /> Public Link
          </button>
          <button onClick={handleSave} disabled={saveDisabled}
            className="flex items-center gap-1.5 px-4 py-2 bg-lodge-accent text-lodge-brown rounded-lg text-xs font-bold hover:bg-lodge-hover disabled:opacity-50 shadow">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Invoice'}
          </button>
          <button onClick={handleCheckoutClick} disabled={isCheckedOut}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:bg-gray-100 disabled:text-gray-400 shadow">
            <LogOut className="w-4 h-4" /> {isCheckedOut ? 'Checked Out' : 'Checkout'}
          </button>
        </div>
      </div>

      {/* ── Main Grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* LEFT: Edit Panel */}
        <div className="lg:col-span-5 space-y-4 no-print">

          {/* Charges card */}
          <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-50 pb-2">Charges</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">Room Charges (₹)</label>
                <input type="number" value={roomCharges} onChange={(e) => setRoomCharges(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm font-medium outline-none focus:bg-white" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">GST Rate (%)</label>
                <input type="number" value={gstRate} onChange={(e) => setGstRate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm font-medium outline-none focus:bg-white" />
              </div>
            </div>

            {/* Extra charges */}
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-gray-500 uppercase">Extra Charges</label>
              <div className="flex gap-2">
                <input type="text" value={newExtraDesc} onChange={(e) => setNewExtraDesc(e.target.value)} placeholder="Description" className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs outline-none" />
                <input type="number" value={newExtraAmount} onChange={(e) => setNewExtraAmount(e.target.value)} placeholder="Amount" className="w-20 bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs outline-none" />
                <button type="button" onClick={addExtra} className="p-2 bg-lodge-accent text-lodge-brown rounded-lg hover:bg-lodge-hover"><Plus className="w-4 h-4" /></button>
              </div>
              {extraCharges.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center p-2.5 text-xs bg-gray-50 rounded-lg border border-gray-100">
                  <span className="font-semibold text-gray-600">{item.description}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800">₹{parseFloat(item.amount).toFixed(2)}</span>
                    <button type="button" onClick={() => removeExtra(idx)} className="text-red-500 hover:text-red-700"><Trash className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment card */}
          <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-50 pb-2">Collect Payment</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">
                  Paid Amount (₹)
                  <span className="ml-1 text-gray-300 font-normal normal-case">total including today</span>
                </label>
                <input
                  type="number"
                  value={paidAmountInput}
                  placeholder={`Currently ₹${alreadyPaid.toFixed(2)}`}
                  onChange={(e) => setPaidAmountInput(e.target.value)}
                  className={`w-full bg-gray-50 border rounded-lg p-2.5 text-sm font-medium outline-none focus:bg-white ${paidInputError ? 'border-red-400' : 'border-gray-200'}`}
                />
                {paidInputError && <p className="text-[10px] text-red-600 font-semibold mt-1">⚠ {paidInputError}</p>}
                {paidAmountInput && !paidInputError && newPaymentDelta > 0 && (
                  <p className="text-[10px] text-emerald-600 font-semibold mt-1">Will add ₹{newPaymentDelta.toFixed(2)} new transaction</p>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">Payment Method</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm font-semibold outline-none">
                  <option>UPI</option><option>Cash</option><option>Card</option><option>Bank Transfer</option><option>Other</option>
                </select>
              </div>
            </div>

            {/* Live summary */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-xs border border-gray-100">
              <div className="flex justify-between text-gray-600 font-medium"><span>Room + Extras</span><span className="font-bold text-gray-800">₹{subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-gray-600 font-medium"><span>GST ({gstRate}%)</span><span className="font-bold text-gray-800">₹{gstVal.toFixed(2)}</span></div>
              <div className="h-px bg-gray-200" />
              <div className="flex justify-between font-bold text-gray-800 text-sm"><span>Grand Total</span><span>₹{grandTotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-emerald-700 font-semibold"><span>Total Paid</span><span>₹{alreadyPaid.toFixed(2)}</span></div>
              <div className={`flex justify-between font-bold text-sm p-1.5 rounded ${pendingAmount > 0.01 ? 'text-red-600 bg-red-50/60' : 'text-emerald-700 bg-emerald-50/60'}`}>
                <span>{pendingAmount > 0.01 ? 'Pending' : '✓ Fully Paid'}</span>
                <span>₹{pendingAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Payment History */}
          {payments.length > 0 && (
            <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Payment History
              </h3>
              <div className="space-y-2">
                {payments.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs">
                    <div>
                      <p className="font-bold text-gray-700">{p.method}</p>
                      <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{p.timestamp}</p>
                      {p.created_by && <p className="text-[9px] text-gray-300 font-medium">by {p.created_by}</p>}
                    </div>
                    <span className="font-extrabold text-emerald-700 text-sm">₹{parseFloat(p.amount).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-1 px-1 text-xs font-bold text-gray-700 border-t border-gray-100">
                  <span>Total Paid</span>
                  <span className="text-emerald-700">₹{alreadyPaid.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Invoice Print Preview */}
        <div id="invoice-print-area" className="lg:col-span-7 bg-white border border-gray-100 rounded-2xl shadow-sm p-8 print-card max-w-[800px] mx-auto w-full">
          {/* Header */}
          <div className="flex justify-between items-start gap-4 border-b border-gray-200 pb-6 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full overflow-hidden border p-1 bg-white flex items-center justify-center">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-lodge-textDark">Mallikarjun (Ravi) Lodge</h2>
                <p className="text-[10px] text-gray-500 font-bold leading-normal mt-1">4-8-495/1, Gowliguda, Ram Mandir Road, Near MGBS, Hyderabad - 500012</p>
                <p className="text-[10px] text-gray-400 font-bold mt-0.5">Phone: 6300 100 426 &nbsp;|&nbsp; GST: 36EJUPR1626A1Z2</p>
              </div>
            </div>
            <div className="text-right">
              <h3 className="text-sm font-black uppercase text-gray-700 tracking-wider">Tax Invoice</h3>
              <p className="text-xs font-extrabold text-gray-800 mt-1">{invoiceNumber}</p>
              <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{invoice.created_at}</p>
              <div className="flex flex-col items-end gap-1 mt-1.5">
                <span className={`inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                  invoice.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                  invoice.status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                }`}>{invoice.status}</span>
                <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full uppercase">
                  {invoice.payment_method}
                </span>
              </div>
            </div>
          </div>

          {/* Guest + Stay */}
          <div className="grid grid-cols-2 gap-8 border-b border-gray-100 pb-6 mb-6 text-xs">
            <div>
              <h4 className="font-extrabold text-gray-400 uppercase tracking-wider text-[9px] mb-2">Guest Details</h4>
              <p className="font-extrabold text-gray-800 text-sm">{customer.name}</p>
              <p className="font-bold text-gray-500 mt-1">{customer.mobile}</p>
              <p className="text-gray-500 mt-0.5 font-semibold">Nationality: {customer.nationality}</p>
              <p className="text-gray-500 mt-0.5 font-semibold">Aadhaar: {customer.aadhaar}</p>
            </div>
            <div className="text-right">
              <h4 className="font-extrabold text-gray-400 uppercase tracking-wider text-[9px] mb-2">Stay Details</h4>
              <p className="font-extrabold text-gray-800 text-sm">Room {booking.room_number}</p>
              <p className="text-gray-500 font-semibold mt-1">({booking.room_type} · {booking.ac_type})</p>
              <p className="text-gray-500 font-semibold mt-1">Check-in: {booking.check_in}</p>
              {booking.check_out && <p className="text-gray-500 font-semibold mt-0.5">Check-out: {booking.check_out}</p>}
            </div>
          </div>

          {/* Items table */}
          <table className="w-full text-left border-collapse text-xs mb-6">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-3 font-extrabold text-gray-500 uppercase tracking-wider">Description</th>
                <th className="p-3 font-extrabold text-gray-500 uppercase tracking-wider text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="p-3 font-semibold text-gray-700">Room Charges ({booking.stay_duration})</td>
                <td className="p-3 font-bold text-gray-800 text-right">₹{rc.toFixed(2)}</td>
              </tr>
              {extraCharges.map((item, idx) => (
                <tr key={idx}>
                  <td className="p-3 font-semibold text-gray-600">{item.description}</td>
                  <td className="p-3 font-bold text-gray-800 text-right">₹{parseFloat(item.amount).toFixed(2)}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-200">
                <td className="p-3 font-bold text-gray-500 text-right">Subtotal</td>
                <td className="p-3 font-bold text-gray-800 text-right">₹{subtotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="p-3 font-bold text-gray-500 text-right">GST @ {gstRate}%</td>
                <td className="p-3 font-bold text-gray-800 text-right">₹{gstVal.toFixed(2)}</td>
              </tr>
              <tr className="bg-lodge-light/30 text-sm font-extrabold text-gray-800">
                <td className="p-3 text-right">Grand Total</td>
                <td className="p-3 text-right">₹{grandTotal.toFixed(2)}</td>
              </tr>
              <tr className="text-emerald-700">
                <td className="p-3 font-bold text-right">Total Paid</td>
                <td className="p-3 font-bold text-right">₹{alreadyPaid.toFixed(2)}</td>
              </tr>
              <tr className={`text-sm font-extrabold ${pendingAmount > 0.01 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                <td className="p-3 text-right">{pendingAmount > 0.01 ? 'Pending' : '✓ Fully Paid'}</td>
                <td className="p-3 text-right">₹{pendingAmount.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          {/* Footer */}
          <div className="flex justify-between items-end border-t border-gray-200 pt-6">
            <div className="text-gray-400 font-bold leading-loose text-[9px] uppercase">
              <p>Thank you for staying with us.</p>
              <p className="mt-1">Intercom: 777</p>
            </div>
            <div className="flex flex-col items-center gap-1 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=85x85&data=${encodeURIComponent(getFeedbackLink())}`}
                alt="QR Feedback"
                className="w-16 h-16"
              />
              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-1">Scan to review</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
