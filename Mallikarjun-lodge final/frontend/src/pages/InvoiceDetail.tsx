import React, { useState, useEffect } from 'react';
import { FileText, Share2, Link2, Save, LogOut, Plus, Trash, Printer, X, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { apiFetch, PUBLIC_BASE_URL } from '../utils/api';

interface ExtraCharge { description: string; amount: string; }
interface Payment { id?: number; amount: string; method: string; timestamp: string; created_by?: string; }

interface InvoiceDetailProps {
  invoiceNumber: string;
  onBackToList: () => void;
}

// ── PDF Generation Helpers ───────────────────────────────────────────────────
async function generatePDFBlob(elementId: string): Promise<Blob | null> {
  const element = document.getElementById(elementId);
  if (!element) return null;
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
  return pdf.output('blob');
}

async function downloadPDF(elementId: string, filename: string) {
  try {
    const blob = await generatePDFBlob(elementId);
    if (!blob) { alert('Could not find printable area.'); return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
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

  // WhatsApp states
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsAppPdfLoading, setWhatsAppPdfLoading] = useState(false);
  const [whatsAppPdfBlob, setWhatsAppPdfBlob] = useState<Blob | null>(null);
  const [printLoading, setPrintLoading] = useState(false);

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
  const handlePrint = async () => {
    setPrintLoading(true);
    try {
      const blob = await generatePDFBlob('invoice-physical-print-template');
      if (!blob) {
        throw new Error('Could not generate PDF invoice.');
      }

      // 1. Send print log payload to backend
      const formData = new FormData();
      formData.append('invoice', blob, `Invoice-${invoiceNumber}.pdf`);
      try {
        await apiFetch('/invoices/print', {
          method: 'POST',
          body: formData,
        });
      } catch (logErr) {
        console.error('[PRINT LOG] Backend print logging endpoint failed:', logErr);
      }

      // 2. Open native Windows print dialog via iframe
      // Clean up previous print iframe and revoke its blob URL to prevent memory leaks
      const existingIframe = document.getElementById('mrlodge-print-iframe') as HTMLIFrameElement;
      if (existingIframe) {
        const prevUrl = existingIframe.src;
        if (prevUrl) {
          URL.revokeObjectURL(prevUrl);
        }
        document.body.removeChild(existingIframe);
      }

      const blobURL = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.id = 'mrlodge-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.style.bottom = '-9999px';
      iframe.style.right = '-9999px';
      iframe.src = blobURL;

      document.body.appendChild(iframe);

      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (printErr: any) {
          console.error('[PRINT ERROR] Native browser print dialog failed:', printErr);
          window.open(blobURL, '_blank');
        }
      };

    } catch (err: any) {
      console.error('Print failed:', err);
      alert(`Printing failed: ${err.message || err}`);
    } finally {
      setPrintLoading(false);
    }
  };

  // ── Links ─────────────────────────────────────────────────────────────────
  // Public invoice link — no login required, opens /public/invoice/:number
  const getInvoiceLink = () => `${PUBLIC_BASE_URL}/public/invoice/${invoiceNumber}`;
  // Public feedback link — no login required, opens /public/feedback/:number
  const getFeedbackLink = () => `${PUBLIC_BASE_URL}/public/feedback/${invoiceNumber}`;

  const handleWhatsApp = async () => {
    if (!data) return;
    setWhatsAppPdfLoading(true);
    try {
      let blob = whatsAppPdfBlob;
      if (!blob) {
        blob = await generatePDFBlob('invoice-print-area');
        if (blob) {
          setWhatsAppPdfBlob(blob);
        }
      }
      if (!blob) {
        alert('Could not generate PDF invoice.');
        setWhatsAppPdfLoading(false);
        return;
      }

      const file = new File([blob], `Invoice-${invoiceNumber}.pdf`, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Invoice ${invoiceNumber}`,
            text: `Dear ${data.customer.name}, please find attached your invoice.`,
          });
          setWhatsAppPdfLoading(false);
          return;
        } catch (shareErr) {
          console.log('Web Share cancelled or failed, showing helper modal:', shareErr);
        }
      }
      setShowWhatsAppModal(true);
    } catch (err) {
      console.error('WhatsApp share error:', err);
      setShowWhatsAppModal(true);
    } finally {
      setWhatsAppPdfLoading(false);
    }
  };

  const handleCopyLink = () => { navigator.clipboard.writeText(getInvoiceLink()); alert('Public link copied to clipboard!'); };

  if (loading) return <div className="text-center py-12 text-sm text-gray-400">Loading invoice...</div>;
  if (!data) return <p className="text-center py-12 text-sm text-red-500">Invoice data error.</p>;

  const { invoice, booking, customer } = data;
  const isCheckedOut = booking.status === 'checked_out';

  return (
    <div className="flex flex-col space-y-6 pb-12">

      {/* ── WhatsApp Sharing Helper Modal ───────────────────────────────── */}
      {showWhatsAppModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-emerald-50/50">
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-gray-800">Share Invoice via WhatsApp</h3>
              </div>
              <button 
                onClick={() => setShowWhatsAppModal(false)} 
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs space-y-2 text-amber-800">
                <div className="flex gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <div>
                    <span className="font-bold">WhatsApp Security Restriction:</span>
                    <p className="mt-1 text-amber-700 leading-relaxed font-semibold">
                      WhatsApp Web/Link APIs do not support automated direct file attachments from external sites. Please choose one of the options below:
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                {/* Option 1: Download & Open WhatsApp */}
                <button
                  onClick={async () => {
                    if (whatsAppPdfBlob) {
                      const url = URL.createObjectURL(whatsAppPdfBlob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `Invoice-${invoiceNumber}.pdf`;
                      link.click();
                      URL.revokeObjectURL(url);
                    } else {
                      setPdfLoading(true);
                      await downloadPDF('invoice-print-area', `Invoice-${invoiceNumber}.pdf`);
                      setPdfLoading(false);
                    }
                    const msg = [
                      `Dear ${data.customer.name},`,
                      ``,
                      `Please find attached the invoice PDF for your stay.`,
                      ``,
                      `Feedback link: ${getFeedbackLink()}`,
                      ``,
                      `Thank you for staying with us.`,
                      `Mallikarjun (Ravi) Lodge`,
                    ].join('\n');
                    window.open(`https://api.whatsapp.com/send?phone=91${data.customer.mobile}&text=${encodeURIComponent(msg)}`, '_blank');
                    setShowWhatsAppModal(false);
                  }}
                  className="w-full text-left p-3.5 border border-emerald-100 hover:border-emerald-300 bg-emerald-50/20 hover:bg-emerald-50/40 rounded-xl transition-all duration-200 group flex items-start gap-3"
                >
                  <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700 group-hover:scale-105 transition-transform flex-shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-800">Download PDF & Open WhatsApp</div>
                    <div className="text-[10px] text-gray-500 mt-0.5 leading-relaxed font-semibold">
                      Downloads the high-quality PDF to your device, then opens WhatsApp so you can attach the document.
                    </div>
                  </div>
                </button>

                {/* Option 2: Send Link Only */}
                <button
                  onClick={() => {
                    const invoiceUrl = getInvoiceLink();
                    const feedbackUrl = getFeedbackLink();
                    const msg = [
                      `Dear ${data.customer.name},`,
                      ``,
                      `Your invoice is ready.`,
                      ``,
                      `Invoice Link: ${invoiceUrl}`,
                      ``,
                      `Feedback Link: ${feedbackUrl}`,
                      ``,
                      `Thank you for staying with us.`,
                      `Mallikarjun (Ravi) Lodge`,
                    ].join('\n');
                    window.open(`https://api.whatsapp.com/send?phone=91${data.customer.mobile}&text=${encodeURIComponent(msg)}`, '_blank');
                    setShowWhatsAppModal(false);
                  }}
                  className="w-full text-left p-3.5 border border-gray-100 hover:border-gray-300 bg-gray-50/50 hover:bg-gray-50 rounded-xl transition-all duration-200 group flex items-start gap-3"
                >
                  <div className="p-2 bg-gray-100 rounded-lg text-gray-700 group-hover:scale-105 transition-transform flex-shrink-0">
                    <Link2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-800">Send Invoice Link Only</div>
                    <div className="text-[10px] text-gray-500 mt-0.5 leading-relaxed font-semibold">
                      Sends the clickable link directly to the customer's WhatsApp as text message.
                    </div>
                  </div>
                </button>

                {/* Option 3: Native Share menu if available */}
                {navigator.share && (
                  <button
                    onClick={async () => {
                      if (whatsAppPdfBlob) {
                        const file = new File([whatsAppPdfBlob], `Invoice-${invoiceNumber}.pdf`, { type: 'application/pdf' });
                        try {
                          await navigator.share({
                            files: [file],
                            title: `Invoice ${invoiceNumber}`,
                            text: `Dear ${data.customer.name}, please find attached your invoice.`,
                          });
                          setShowWhatsAppModal(false);
                        } catch (shareErr) {
                          console.log('Native share failed/cancelled:', shareErr);
                        }
                      }
                    }}
                    className="w-full text-left p-3.5 border border-blue-100 hover:border-blue-300 bg-blue-50/20 hover:bg-blue-50/40 rounded-xl transition-all duration-200 group flex items-start gap-3"
                  >
                    <div className="p-2 bg-blue-100 rounded-lg text-blue-700 group-hover:scale-105 transition-transform flex-shrink-0">
                      <Share2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-800">Share PDF via Native Menu</div>
                      <div className="text-[10px] text-gray-500 mt-0.5 leading-relaxed font-semibold">
                        Uses your device's native sharing capabilities to send the PDF file.
                      </div>
                    </div>
                  </button>
                )}
              </div>
            </div>
            
            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50/50">
              <button 
                onClick={() => setShowWhatsAppModal(false)}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
          <button onClick={handlePrint} disabled={printLoading}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 bg-white rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
            <Printer className="w-4 h-4" /> {printLoading ? 'Printing...' : 'Print'}
          </button>
          <button onClick={handleWhatsApp} disabled={whatsAppPdfLoading}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 bg-white rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
            <Share2 className="w-4 h-4 text-emerald-600" /> {whatsAppPdfLoading ? 'Preparing PDF...' : 'WhatsApp'}
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
              {booking.company_name && booking.company_name.trim() !== '' && (
                <p className="text-gray-500 mt-0.5 font-semibold">Company Name: {booking.company_name}</p>
              )}
              {booking.company_gst && booking.company_gst.trim() !== '' && (
                <p className="text-gray-500 mt-0.5 font-semibold">GST Number: {booking.company_gst}</p>
              )}
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

      {/* Hidden Print Template - Used ONLY for physical automatic printing */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '800px', zIndex: -100, pointerEvents: 'none' }}>
        <div id="invoice-physical-print-template" style={{ width: '800px', padding: '30px 40px', background: 'white', color: '#000000', fontFamily: 'system-ui, sans-serif', boxSizing: 'border-box' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #000000', paddingBottom: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', border: '2px solid #000000', padding: '2px', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#000000' }}>Mallikarjun (Ravi) Lodge</h2>
                <p style={{ fontSize: '11px', color: '#000000', fontWeight: 600, margin: '4px 0 0 0', lineHeight: 1.3 }}>4-8-495/1, Gowliguda, Ram Mandir Road, Near MGBS, Hyderabad - 500012</p>
                <p style={{ fontSize: '11px', color: '#000000', fontWeight: 600, margin: '2px 0 0 0' }}>Phone: 6300 100 426 &nbsp;|&nbsp; GST: 36EJUPR1626A1Z2</p>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: '#000000', letterSpacing: '0.05em', margin: 0 }}>Tax Invoice</h3>
              <p style={{ fontSize: '12px', fontWeight: 700, color: '#000000', margin: '3px 0 0 0' }}>{invoiceNumber}</p>
              <p style={{ fontSize: '10px', color: '#000000', fontWeight: 600, margin: '2px 0 0 0' }}>{invoice.created_at}</p>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'end', gap: '3px', marginTop: '6px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', border: '1.5px solid #000000', borderRadius: '4px', background: 'white', color: '#000000' }}>{invoice.status}</span>
              </div>
            </div>
          </div>

          {/* Details (Guest + Stay) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', borderBottom: '2px solid #000000', paddingBottom: '12px', marginBottom: '16px', fontSize: '12px' }}>
            <div>
              <h4 style={{ fontWeight: 700, color: '#000000', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '9px', margin: '0 0 4px 0' }}>Guest Details</h4>
              <p style={{ fontWeight: 700, color: '#000000', fontSize: '13px', margin: 0 }}>{customer.name}</p>
              <p style={{ fontWeight: 600, color: '#000000', margin: '2px 0 0 0' }}>{customer.mobile}</p>
              <p style={{ color: '#000000', margin: '2px 0 0 0', fontWeight: 600 }}>Nationality: {customer.nationality}</p>
              {customer.aadhaar && <p style={{ color: '#000000', margin: '2px 0 0 0', fontWeight: 600 }}>Aadhaar: {customer.aadhaar}</p>}
              {booking.company_name && booking.company_name.trim() !== '' && (
                <p style={{ color: '#000000', margin: '2px 0 0 0', fontWeight: 600 }}>Company Name: {booking.company_name}</p>
              )}
              {booking.company_gst && booking.company_gst.trim() !== '' && (
                <p style={{ color: '#000000', margin: '2px 0 0 0', fontWeight: 600 }}>GST Number: {booking.company_gst}</p>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <h4 style={{ fontWeight: 700, color: '#000000', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '9px', margin: '0 0 4px 0' }}>Stay Details</h4>
              <p style={{ fontWeight: 700, color: '#000000', fontSize: '13px', margin: 0 }}>Room {booking.room_number}</p>
              <p style={{ color: '#000000', fontWeight: 600, margin: '2px 0 0 0' }}>({booking.room_type} · {booking.ac_type})</p>
              <p style={{ color: '#000000', fontWeight: 600, margin: '2px 0 0 0' }}>Check-in: {booking.check_in}</p>
              <p style={{ color: '#000000', fontWeight: 600, margin: '2px 0 0 0' }}>Check-out: {booking.check_out || '--'}</p>
            </div>
          </div>

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '2px solid #000000', marginBottom: '0px' }}>
            <thead>
              <tr style={{ background: '#ffffff', borderBottom: '2px solid #000000' }}>
                <th style={{ padding: '8px 12px', fontWeight: 700, color: '#000000', textTransform: 'uppercase', borderRight: '2px solid #000000', borderBottom: '2px solid #000000' }}>Description</th>
                <th style={{ padding: '8px 12px', fontWeight: 700, color: '#000000', textTransform: 'uppercase', textAlign: 'right', borderBottom: '2px solid #000000' }}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {/* Item Rows */}
              <tr style={{ borderBottom: '1px solid #000000' }}>
                <td style={{ padding: '6px 12px', fontWeight: 600, color: '#000000', borderRight: '2px solid #000000', borderBottom: '1px solid #000000' }}>Room Charges ({booking.stay_duration})</td>
                <td style={{ padding: '6px 12px', fontWeight: 600, color: '#000000', textAlign: 'right', borderBottom: '1px solid #000000' }}>₹{rc.toFixed(2)}</td>
              </tr>
              {extraCharges.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #000000' }}>
                  <td style={{ padding: '6px 12px', fontWeight: 600, color: '#000000', borderRight: '2px solid #000000', borderBottom: '1px solid #000000' }}>{item.description}</td>
                  <td style={{ padding: '6px 12px', fontWeight: 600, color: '#000000', textAlign: 'right', borderBottom: '1px solid #000000' }}>₹{parseFloat(item.amount).toFixed(2)}</td>
                </tr>
              ))}
              {/* Summary Rows */}
              <tr style={{ borderBottom: '1px solid #000000' }}>
                <td style={{ padding: '6px 12px', fontWeight: 700, color: '#000000', borderRight: '2px solid #000000', borderBottom: '1px solid #000000' }}>Subtotal</td>
                <td style={{ padding: '6px 12px', fontWeight: 600, color: '#000000', textAlign: 'right', borderBottom: '1px solid #000000' }}>₹{subtotal.toFixed(2)}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #000000' }}>
                <td style={{ padding: '6px 12px', fontWeight: 700, color: '#000000', borderRight: '2px solid #000000', borderBottom: '1px solid #000000' }}>GST ({gstRate}%)</td>
                <td style={{ padding: '6px 12px', fontWeight: 600, color: '#000000', textAlign: 'right', borderBottom: '1px solid #000000' }}>₹{gstVal.toFixed(2)}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #000000', fontWeight: 700 }}>
                <td style={{ padding: '6px 12px', fontWeight: 700, color: '#000000', borderRight: '2px solid #000000', borderBottom: '1px solid #000000' }}>Grand Total</td>
                <td style={{ padding: '6px 12px', fontWeight: 700, color: '#000000', textAlign: 'right', borderBottom: '1px solid #000000' }}>₹{grandTotal.toFixed(2)}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #000000' }}>
                <td style={{ padding: '6px 12px', fontWeight: 700, color: '#000000', borderRight: '2px solid #000000', borderBottom: '1px solid #000000' }}>Total Paid</td>
                <td style={{ padding: '6px 12px', fontWeight: 600, color: '#000000', textAlign: 'right', borderBottom: '1px solid #000000' }}>₹{alreadyPaid.toFixed(2)}</td>
              </tr>
              <tr style={{ fontWeight: 700 }}>
                <td style={{ padding: '6px 12px', fontWeight: 700, color: '#000000', borderRight: '2px solid #000000' }}>Pending Amount</td>
                <td style={{ padding: '6px 12px', fontWeight: 700, color: '#000000', textAlign: 'right' }}>₹{pendingAmount.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          {/* Remarks Section */}
          {booking.remarks && booking.remarks.trim() !== '' && (
            <div style={{ marginTop: '16px', fontSize: '11px', textAlign: 'left' }}>
              <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '9px', marginBottom: '4px' }}>Remarks</div>
              <div style={{ borderTop: '1px solid #000000', borderBottom: '1px solid #000000', padding: '6px 0', fontWeight: 600 }}>
                {booking.remarks}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
