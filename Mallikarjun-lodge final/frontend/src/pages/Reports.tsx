import React, { useState, useEffect } from 'react';
import { Calendar, Printer, FileSpreadsheet, BarChart3, IndianRupee, Landmark, FileText } from 'lucide-react';
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

interface MethodBreakdown {
  method: string;
  amount: number;
}

interface ReportData {
  totalRevenue: number;
  totalBookings: number;
  occupancyPercentage: number;
  revenueByMethod: MethodBreakdown[];
}

export default function Reports() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  // Default date ranges (last 30 days)
  const getTodayDateStr = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getPastDateStr = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const [fromDate, setFromDate] = useState(getPastDateStr(30));
  const [toDate, setToDate] = useState(getTodayDateStr());

  const loadReport = async () => {
    setLoading(true);
    try {
      const report = await apiFetch(`/reports?fromDate=${fromDate}&toDate=${toDate}`);
      setData(report);
    } catch (err) {
      console.error('Failed to load report data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [fromDate, toDate]);

  const [pdfLoading, setPdfLoading] = useState(false);

  const handlePrint = () => { window.print(); };

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    await downloadPDF('reports-print-area', `Reports-${fromDate}-to-${toDate}.pdf`);
    setPdfLoading(false);
  };

  return (
    <div className="flex flex-col space-y-6 pb-12">
      {/* Title */}
      <div className="no-print">
        <h2 className="text-2xl font-bold text-lodge-textDark">Reports & Analytics</h2>
        <p className="text-gray-500 text-sm font-medium">Business performance, occupancy levels, and revenue breakdowns</p>
      </div>

      {/* Date Filter Bar */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between no-print">
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs font-semibold text-gray-700 outline-none focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs font-semibold text-gray-700 outline-none focus:bg-white"
            />
          </div>

          <button
            onClick={() => {
              setFromDate(getPastDateStr(0));
              setToDate(getTodayDateStr());
            }}
            className="px-4 py-2 border border-gray-200 bg-white text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 transition"
          >
            Today
          </button>
          
          <button
            onClick={() => {
              setFromDate(getPastDateStr(7));
              setToDate(getTodayDateStr());
            }}
            className="px-4 py-2 border border-gray-200 bg-white text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 transition"
          >
            Last 7 Days
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-50 transition justify-center flex-1 md:flex-none"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={pdfLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-700 text-white rounded-lg text-xs font-bold hover:bg-orange-800 shadow transition justify-center flex-1 md:flex-none disabled:opacity-60"
          >
            <FileText className="w-4 h-4" /> {pdfLoading ? 'Generating...' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Main Report Page Layout */}
      <div id="reports-print-area" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 print-card">
        
        {/* Printable Letterhead */}
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
            Performance Summary: {fromDate} to {toDate}
          </h2>
        </div>

        {loading ? (
          <p className="text-center py-16 text-xs text-gray-400 font-medium">Compiling analytics report...</p>
        ) : !data ? (
          <p className="text-center py-16 text-xs text-red-500 font-medium">Failed to compile reports data.</p>
        ) : (
          <div className="space-y-8">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Revenue */}
              <div className="bg-gray-50 border border-gray-150 p-5 rounded-2xl flex items-center gap-4">
                <div className="p-3 bg-yellow-100 text-yellow-700 rounded-xl">
                  <IndianRupee className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Total Revenue</p>
                  <p className="text-2xl font-black text-gray-800">
                    ₹{data.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Bookings */}
              <div className="bg-gray-50 border border-gray-155 p-5 rounded-2xl flex items-center gap-4">
                <div className="p-3 bg-orange-100 text-orange-700 rounded-xl">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Total Bookings</p>
                  <p className="text-2xl font-black text-gray-800">{data.totalBookings}</p>
                </div>
              </div>

              {/* Occupancy */}
              <div className="bg-gray-50 border border-gray-155 p-5 rounded-2xl flex items-center gap-4">
                <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Landmark className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Avg Occupancy</p>
                  <p className="text-2xl font-black text-emerald-600">{data.occupancyPercentage}%</p>
                </div>
              </div>
            </div>

            {/* Detailed Breakdown Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
              
              {/* Payment Method Breakdown Table */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-widest">Revenue by Payment Method</h3>
                <div className="border border-gray-150 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-155">
                        <th className="p-3 font-extrabold text-gray-500 uppercase tracking-wider">Method</th>
                        <th className="p-3 font-extrabold text-gray-500 uppercase tracking-wider text-right">Amount Received</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.revenueByMethod.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="p-4 text-center text-gray-400 font-semibold italic">No revenue recorded</td>
                        </tr>
                      ) : (
                        data.revenueByMethod.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/30">
                            <td className="p-3 font-bold text-gray-700">{item.method}</td>
                            <td className="p-3 font-extrabold text-gray-800 text-right">
                              ₹{parseFloat(String(item.amount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))
                      )}
                      {data.revenueByMethod.length > 0 && (
                        <tr className="bg-gray-50 font-bold border-t border-gray-200">
                          <td className="p-3 text-gray-600">Total</td>
                          <td className="p-3 text-right text-gray-900 font-extrabold">
                            ₹{data.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Graphic Chart */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-widest">Revenue Distribution</h3>
                <div className="border border-gray-150 rounded-xl p-5 flex flex-col justify-center min-h-[160px] space-y-4">
                  {data.revenueByMethod.length === 0 ? (
                    <p className="text-xs text-gray-400 font-semibold text-center italic">No data to distribute</p>
                  ) : (
                    data.revenueByMethod.map((item, idx) => {
                      const percentage = data.totalRevenue > 0 ? (item.amount / data.totalRevenue) * 100 : 0;
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-gray-600">{item.method}</span>
                            <span className="text-gray-800">{percentage.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                            <div 
                              style={{ width: `${percentage}%` }}
                              className={`h-full ${
                                item.method.toLowerCase() === 'cash' ? 'bg-orange-700' :
                                item.method.toLowerCase() === 'upi' ? 'bg-yellow-500' : 'bg-blue-500'
                              }`}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>

            {/* Print Footer */}
            <div className="h-px bg-gray-200 w-full pt-8 print-only" />
            <div className="flex justify-between items-center text-[9px] text-gray-400 font-bold uppercase mt-12">
              <span>Mallikarjun (Ravi) Lodge Reports</span>
              <span>Compiled on {new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
