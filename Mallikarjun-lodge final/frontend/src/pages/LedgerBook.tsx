import React, { useState, useEffect } from 'react';
import { Calendar, Printer, FileText } from 'lucide-react';
import { apiFetch } from '../utils/api';

async function downloadPDF(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) { alert('Could not find printable area.'); return; }
  try {
    const jspdfModule = await import('jspdf');
    const html2canvasModule = await import('html2canvas');
    const jsPDF = jspdfModule.default;
    const html2canvas = html2canvasModule.default;
    const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
    const imgData = canvas.toDataURL('image/png');
     const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgHeight = (canvas.height * pageWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    pdf.save(filename);
  } catch (err) {
    console.error('PDF generation failed:', err);
    alert('PDF download failed. Please use the Print button instead.');
  }
}

interface LedgerEntry {
  id: number;
  room_number: string;
  name: string;
  address: string;
  age: number;
  occupation: string;
  nationality: string;
  num_persons: number;
  num_gents: number;
  num_ladies: number;
  num_children: number;
  arriving_from: string;
  purpose: string;
  mode_of_travel: string;
  check_in: string;
  id_type?: string;
  aadhaar?: string;
}

export default function LedgerBook() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Default date ranges (Today)
  const getTodayDateStr = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const [fromDate, setFromDate] = useState(getTodayDateStr());
  const [toDate, setToDate] = useState(getTodayDateStr());

  const loadLedger = async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/ledger?fromDate=${fromDate}&toDate=${toDate}`);
      setEntries(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, [fromDate, toDate]);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);

  const handleTodayFilter = () => {
    const todayStr = getTodayDateStr();
    setFromDate(todayStr);
    setToDate(todayStr);
  };

  // Helper to chunk entries
  const chunkEntries = (arr: LedgerEntry[], size: number) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  };
  const pages = chunkEntries(entries, 10);

  const handlePrint = async () => {
    if (entries.length === 0) {
      alert('No ledger entries available to print.');
      return;
    }
    setPrintLoading(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: html2canvas } = await import('html2canvas');

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();

      const chunkCount = pages.length;
      for (let i = 0; i < chunkCount; i++) {
        const pageEl = document.getElementById(`ledger-print-page-${i}`);
        if (!pageEl) throw new Error(`Could not find print template for page ${i + 1}`);

        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false
        });
        const imgData = canvas.toDataURL('image/png');

        if (i > 0) {
          pdf.addPage();
        }
        pdf.addImage(imgData, 'PNG', 0, 0, pw, ph);
      }

      const blob = pdf.output('blob');

      // 1. Send print log payload to backend
      const formData = new FormData();
      formData.append('invoice', blob, `LedgerBook-${fromDate}-to-${toDate}.pdf`);
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

  const handleDownloadPDF = async () => {
    if (entries.length === 0) {
      alert('No ledger entries available to download.');
      return;
    }
    setPdfLoading(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: html2canvas } = await import('html2canvas');

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();

      const chunkCount = pages.length;
      for (let i = 0; i < chunkCount; i++) {
        const pageEl = document.getElementById(`ledger-print-page-${i}`);
        if (!pageEl) throw new Error(`Could not find print template for page ${i + 1}`);

        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false
        });
        const imgData = canvas.toDataURL('image/png');

        if (i > 0) {
          pdf.addPage();
        }
        pdf.addImage(imgData, 'PNG', 0, 0, pw, ph);
      }

      pdf.save(`LedgerBook-${fromDate}-to-${toDate}.pdf`);
    } catch (err: any) {
      console.error('PDF download failed:', err);
      alert(`PDF download failed: ${err.message || err}`);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="flex flex-col space-y-6 pb-12">
      
      {/* Page Title */}
      <div className="no-print">
        <h2 className="text-2xl font-bold text-lodge-textDark">Ledger Book</h2>
        <p className="text-gray-500 text-sm font-medium">Daily register sheets for police verification and records</p>
      </div>

      {/* Filter Card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between no-print">
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          {/* From */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs font-semibold text-gray-700 outline-none focus:bg-white"
            />
          </div>

          {/* To */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs font-semibold text-gray-700 outline-none focus:bg-white"
            />
          </div>

          {/* Today Button */}
          <button
            onClick={handleTodayFilter}
            className="px-4 py-2 border border-gray-200 bg-white text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 transition"
          >
            Today
          </button>
        </div>

        {/* Export Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            disabled={printLoading}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 bg-white rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 transition disabled:opacity-60"
          >
            <Printer className="w-4 h-4" /> {printLoading ? 'Printing...' : 'Print'}
          </button>

          <button
            onClick={handleDownloadPDF}
            disabled={pdfLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-700 text-white rounded-lg text-xs font-bold hover:bg-orange-800 shadow transition disabled:opacity-60"
          >
            <FileText className="w-4 h-4" /> {pdfLoading ? 'Generating...' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Ledger Sheet Card (Print optimized) */}
      <div id="ledger-print-area" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 print-card w-full">
        
        {/* Ledger Header details */}
        <div className="flex flex-col items-center text-center border-b border-gray-200 pb-4 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full overflow-hidden border p-0.5 bg-white flex items-center justify-center">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-xl font-extrabold text-lodge-textDark">Mallikarjun (Ravi) Lodge</h1>
          </div>
          <p className="text-[10px] text-gray-500 font-bold max-w-[500px] leading-relaxed">
            4-8-495/1, Gowliguda, Ram Mandir Road, Near MGBS, Hyderabad - 500012 &nbsp;·&nbsp; Ph: 6300 100 426 &nbsp;·&nbsp; GST: 36EJUPR1626A1Z2
          </p>
          <div className="h-px bg-gray-200 w-full my-3" />
          <h2 className="text-xs font-black uppercase text-gray-700 tracking-wider">
            Daily Register: {fromDate} to {toDate}
          </h2>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[11px] min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                <th className="p-3 font-extrabold uppercase">#</th>
                <th className="p-3 font-extrabold uppercase">Name & Address</th>
                <th className="p-3 font-extrabold uppercase">Age</th>
                <th className="p-3 font-extrabold uppercase">Occupation</th>
                <th className="p-3 font-extrabold uppercase">Nationality</th>
                <th className="p-3 font-extrabold uppercase">Room</th>
                <th className="p-3 text-center text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">G</th>
                    <th className="p-3 text-center text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">L</th>
                    <th className="p-3 text-center text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">C</th>
                    <th className="p-3 text-center text-[10px] font-extrabold text-gray-400 uppercase tracking-wider whitespace-nowrap">TOTAL</th>
                <th className="p-3 font-extrabold uppercase">Arriving From</th>
                <th className="p-3 font-extrabold uppercase">Purpose</th>
                <th className="p-3 font-extrabold uppercase">Mode</th>
                <th className="p-3 font-extrabold uppercase">Date & Time Of Arrival</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-150">
              {loading ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-xs text-gray-400 font-medium">
                    Loading ledger data sheet...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-xs text-gray-400 font-medium">
                    No registry entries found in the selected range.
                  </td>
                </tr>
              ) : (
                entries.map((entry, idx) => (
                  <tr key={entry.id} className="hover:bg-gray-50/50 transition">
                    <td className="p-3 font-bold text-gray-400">{idx + 1}</td>
                    <td className="p-3 text-gray-800 font-semibold max-w-[200px]">
                      <div>{entry.name}</div>
                      <div className="text-[10px] text-gray-400 font-medium leading-relaxed mt-0.5">{entry.address || '—'}</div>
                      {entry.aadhaar && entry.aadhaar.trim() !== '' && (
                        <div className="text-[10px] text-gray-700 font-bold leading-relaxed mt-1">
                          {entry.id_type || 'Aadhaar'}: {entry.aadhaar}
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-semibold text-gray-700">{entry.age}</td>
                    <td className="p-3 font-semibold text-gray-600">{entry.occupation}</td>
                    <td className="p-3 font-semibold text-gray-600">{entry.nationality}</td>
                    <td className="p-3 font-bold text-gray-800">{entry.room_number}</td>
                    <td className="p-3 text-center font-bold text-blue-700">{entry.num_gents ?? 0}</td>
                    <td className="p-3 text-center font-bold text-pink-600">{entry.num_ladies ?? 0}</td>
                    <td className="p-3 text-center font-bold text-amber-600">{entry.num_children ?? 0}</td>
                    <td className="p-3 text-center font-extrabold text-gray-800 border-l border-gray-100">
                      {(entry.num_gents ?? 0) + (entry.num_ladies ?? 0) + (entry.num_children ?? 0) || entry.num_persons}
                    </td>
                    <td className="p-3 font-semibold text-gray-600">{entry.arriving_from}</td>
                    <td className="p-3 font-semibold text-gray-600">{entry.purpose}</td>
                    <td className="p-3 font-semibold text-gray-600">{entry.mode_of_travel}</td>
                    <td className="p-3 font-bold text-gray-700">{entry.check_in}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info for print */}
        <div className="h-px bg-gray-200 w-full my-6 print-only" />
        <div className="flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase mt-8">
          <span>Mallikarjun (Ravi) Lodge</span>
          <span>Contact Ph: 6300 100 426</span>
        </div>

      </div>

      {/* Hidden Multi-Page Ledger Print Template */}
      <div id="ledger-silent-print-template" style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '1024px' }}>
        {pages.map((chunk, pageIdx) => (
          <div
            key={pageIdx}
            id={`ledger-print-page-${pageIdx}`}
            style={{
              width: '1024px',
              height: '1448px',
              padding: '40px',
              boxSizing: 'border-box',
              backgroundColor: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              border: '1px solid #e5e7eb',
              marginBottom: '20px'
            }}
          >
            <div>
              {/* Header */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', borderBottom: '2px solid #000000', paddingBottom: '16px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', overflow: 'hidden', border: '1px solid #000000', padding: '2px', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </div>
                  <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#000000', margin: 0 }}>Mallikarjun (Ravi) Lodge</h1>
                </div>
                <p style={{ fontSize: '11px', color: '#000000', fontWeight: 600, margin: '4px 0 0 0', maxWidth: '600px', lineHeight: 1.4 }}>
                  4-8-495/1, Gowliguda, Ram Mandir Road, Near MGBS, Hyderabad - 500012 &nbsp;·&nbsp; Ph: 6300 100 426 &nbsp;·&nbsp; GST: 36EJUPR1626A1Z2
                </p>
                <div style={{ height: '1px', backgroundColor: '#000000', width: '100%', margin: '12px 0' }} />
                <h2 style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', color: '#000000', letterSpacing: '0.05em', margin: 0 }}>
                  Daily Register: {fromDate} to {toDate} &nbsp;(Page {pageIdx + 1} of {pages.length})
                </h2>
              </div>

              {/* Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#ffffff', borderBottom: '2px solid #000000', borderTop: '2px solid #000000' }}>
                    <th style={{ padding: '10px 4px', fontWeight: 700, color: '#000000', textTransform: 'uppercase', fontSize: '11pt' }}>#</th>
                    <th style={{ padding: '10px 4px', fontWeight: 700, color: '#000000', textTransform: 'uppercase', fontSize: '11pt' }}>Name & Address</th>
                    <th style={{ padding: '10px 4px', fontWeight: 700, color: '#000000', textTransform: 'uppercase', fontSize: '11pt' }}>Age</th>
                    <th style={{ padding: '10px 4px', fontWeight: 700, color: '#000000', textTransform: 'uppercase', fontSize: '11pt' }}>Occupation</th>
                    <th style={{ padding: '10px 4px', fontWeight: 700, color: '#000000', textTransform: 'uppercase', fontSize: '11pt' }}>Nationality</th>
                    <th style={{ padding: '10px 4px', fontWeight: 700, color: '#000000', textTransform: 'uppercase', fontSize: '11pt' }}>Room</th>
                    <th style={{ padding: '10px 4px', fontWeight: 700, color: '#000000', textTransform: 'uppercase', fontSize: '11pt', textAlign: 'center' }}>G</th>
                    <th style={{ padding: '10px 4px', fontWeight: 700, color: '#000000', textTransform: 'uppercase', fontSize: '11pt', textAlign: 'center' }}>L</th>
                    <th style={{ padding: '10px 4px', fontWeight: 700, color: '#000000', textTransform: 'uppercase', fontSize: '11pt', textAlign: 'center' }}>C</th>
                    <th style={{ padding: '10px 4px', fontWeight: 700, color: '#000000', textTransform: 'uppercase', fontSize: '11pt', textAlign: 'center' }}>Total</th>
                    <th style={{ padding: '10px 4px', fontWeight: 700, color: '#000000', textTransform: 'uppercase', fontSize: '11pt' }}>Arriving From</th>
                    <th style={{ padding: '10px 4px', fontWeight: 700, color: '#000000', textTransform: 'uppercase', fontSize: '11pt' }}>Purpose</th>
                    <th style={{ padding: '10px 4px', fontWeight: 700, color: '#000000', textTransform: 'uppercase', fontSize: '11pt' }}>Mode</th>
                    <th style={{ padding: '10px 4px', fontWeight: 700, color: '#000000', textTransform: 'uppercase', fontSize: '11pt' }}>Arrival Date & Time</th>
                  </tr>
                </thead>
                <tbody>
                  {chunk.map((entry, idx) => (
                    <tr key={entry.id} style={{ borderBottom: '1px solid #000000' }}>
                      <td style={{ padding: '10px 4px', fontWeight: 600, color: '#000000', fontSize: '10pt' }}>{pageIdx * 10 + idx + 1}</td>
                      <td style={{ padding: '10px 4px', color: '#000000', fontWeight: 600, fontSize: '10pt', maxWidth: '160px', wordBreak: 'break-word' }}>
                        <div style={{ fontWeight: 700 }}>{entry.name}</div>
                        <div style={{ fontSize: '10pt', color: '#000000', marginTop: '2px', fontWeight: 600 }}>{entry.address || '—'}</div>
                        {entry.aadhaar && entry.aadhaar.trim() !== '' && (
                          <div style={{ fontSize: '9.5pt', color: '#000000', fontWeight: 600, marginTop: '2px' }}>
                            {entry.id_type || 'Aadhaar'}: {entry.aadhaar}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 4px', color: '#000000', fontWeight: 600, fontSize: '10pt' }}>{entry.age}</td>
                      <td style={{ padding: '10px 4px', color: '#000000', fontWeight: 600, fontSize: '10pt' }}>{entry.occupation}</td>
                      <td style={{ padding: '10px 4px', color: '#000000', fontWeight: 600, fontSize: '10pt' }}>{entry.nationality}</td>
                      <td style={{ padding: '10px 4px', color: '#000000', fontWeight: 600, fontSize: '10pt' }}>{entry.room_number}</td>
                      <td style={{ padding: '10px 4px', color: '#000000', fontWeight: 600, fontSize: '10pt', textAlign: 'center' }}>{entry.num_gents ?? 0}</td>
                      <td style={{ padding: '10px 4px', color: '#000000', fontWeight: 600, fontSize: '10pt', textAlign: 'center' }}>{entry.num_ladies ?? 0}</td>
                      <td style={{ padding: '10px 4px', color: '#000000', fontWeight: 600, fontSize: '10pt', textAlign: 'center' }}>{entry.num_children ?? 0}</td>
                      <td style={{ padding: '10px 4px', color: '#000000', fontWeight: 600, fontSize: '10pt', textAlign: 'center' }}>
                        {(entry.num_gents ?? 0) + (entry.num_ladies ?? 0) + (entry.num_children ?? 0) || entry.num_persons}
                      </td>
                      <td style={{ padding: '10px 4px', color: '#000000', fontWeight: 600, fontSize: '10pt' }}>{entry.arriving_from}</td>
                      <td style={{ padding: '10px 4px', color: '#000000', fontWeight: 600, fontSize: '10pt' }}>{entry.purpose}</td>
                      <td style={{ padding: '10px 4px', color: '#000000', fontWeight: 600, fontSize: '10pt' }}>{entry.mode_of_travel}</td>
                      <td style={{ padding: '10px 4px', color: '#000000', fontWeight: 600, fontSize: '10pt' }}>{entry.check_in}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #000000', paddingTop: '12px', fontSize: '10px', fontWeight: 700, color: '#000000', textTransform: 'uppercase' }}>
              <span>Mallikarjun (Ravi) Lodge</span>
              <span>Contact Ph: 6300 100 426</span>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          body, html, #root, .min-h-screen, main {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
            overflow: visible !important;
          }
          .no-print {
            display: none !important;
          }
          #ledger-print-area {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 145% !important;
            transform: scale(0.69) !important;
            transform-origin: top left !important;
            overflow: visible !important;
            display: block !important;
          }
          #ledger-print-area .overflow-x-auto {
            overflow: visible !important;
          }
          #ledger-print-area table {
            width: 100% !important;
            table-layout: auto !important;
          }
          #ledger-print-area tr {
            page-break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  );
}
