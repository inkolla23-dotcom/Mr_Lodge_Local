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
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
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

  const handleTodayFilter = () => {
    const todayStr = getTodayDateStr();
    setFromDate(todayStr);
    setToDate(todayStr);
  };

  const handlePrint = () => { window.print(); };

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    await downloadPDF('ledger-print-area', `LedgerBook-${fromDate}-to-${toDate}.pdf`);
    setPdfLoading(false);
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
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 bg-white rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 transition"
          >
            <Printer className="w-4 h-4" /> Print
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

    </div>
  );
}
