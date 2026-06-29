import React, { useState, useEffect } from 'react';
import {
  Building, CheckCircle, XCircle, ArrowLeftRight,
  IndianRupee, Calendar, AlertCircle, MessageSquare, Activity
} from 'lucide-react';
import { apiFetch } from '../utils/api';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalRooms: 0, availableRooms: 0, occupiedRooms: 0,
    reservedRooms: 0, cleaningRooms: 0,
    checkinsToday: 0, checkoutsToday: 0,
    revenueToday: 0, weeklyRevenue: 0, pendingPayments: 0
  });

  const [reviews, setReviews] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  // floorStats: floor → { occupied, total }
  const [floorStats, setFloorStats] = useState<Record<number, { occupied: number; total: number }>>({});
  const [weeklyRevenueData, setWeeklyRevenueData] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [loading, setLoading] = useState(true);

  // Parse "22 Jun 2026 12:39 pm" → Date
  const parseIndianDate = (dStr: string): Date | null => {
    if (!dStr) return null;
    try {
      const parts = dStr.split(' ');
      const months: Record<string, number> = {
        Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,
        Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11
      };
      const day = parseInt(parts[0]);
      const mon = months[parts[1]];
      const year = parseInt(parts[2]);
      if (isNaN(day) || mon === undefined || isNaN(year)) return null;
      const d = new Date(year, mon, day);
      d.setHours(0, 0, 0, 0);
      return d;
    } catch { return null; }
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Parallel fetch of all needed data
        const [rooms, bookings, invoices, reviewsRes, logs] = await Promise.all([
          apiFetch('/rooms'),
          apiFetch('/bookings'),
          apiFetch('/invoices'),
          apiFetch('/reviews'),
          apiFetch('/activity-logs'),
        ]);

        // ── Room statistics ───────────────────────────────────────────────
        const avail   = rooms.filter((r: any) => r.status === 'Available').length;
        const occ     = rooms.filter((r: any) => r.status === 'Occupied').length;
        const resv    = rooms.filter((r: any) => r.status === 'Reserved').length;
        const cln     = rooms.filter((r: any) => r.status === 'Cleaning').length;

        // Floor occupancy — count total and occupied rooms per floor
        const floorMap: Record<number, { occupied: number; total: number }> = {};
        rooms.forEach((r: any) => {
          const f = r.floor as number;
          if (!floorMap[f]) floorMap[f] = { occupied: 0, total: 0 };
          floorMap[f].total += 1;
          if (r.status === 'Occupied') floorMap[f].occupied += 1;
        });
        setFloorStats(floorMap);

        // ── Today / this week ────────────────────────────────────────────
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);

        // Format today as "22 Jun 2026" for substring match
        const todayStr = todayDate.toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric'
        }).replace(/\//g, ' ');

        const checkinsToday  = bookings.filter((b: any) => b.check_in  && b.check_in.includes(todayStr)).length;
        const checkoutsToday = bookings.filter((b: any) => b.check_out && b.check_out.includes(todayStr)).length;

        // ── Revenue from real_paid_amount (comes from payments table SUM) ─
        // The GET /invoices API returns real_paid_amount as a subquery field.
        // We also need extras_total to compute true grand total for pending.
        let revToday    = 0;
        let revWeek     = 0;
        let pending     = 0;
        const weekArr   = [0, 0, 0, 0, 0, 0, 0]; // index 6 = today

        invoices.forEach((inv: any) => {
          const invDate = parseIndianDate(inv.created_at);
          if (!invDate) return;

          // Use real_paid_amount (sum of payments rows) — never stale
          const realPaid  = parseFloat(inv.real_paid_amount ?? inv.paid_amount ?? 0);

          // Grand total: room + extras + gst
          const rc        = parseFloat(inv.room_charges || 0);
          const extras    = parseFloat(inv.extras_total || 0);
          const sub       = rc + extras;
          const grandTotal = sub + sub * (parseFloat(inv.gst_rate || 5) / 100);

          // Pending (only for non-paid invoices)
          if (inv.status !== 'paid') {
            pending += Math.max(0, grandTotal - realPaid);
          }

          // Today revenue = actual payments received today
          if (invDate.getTime() === todayDate.getTime()) {
            revToday += realPaid;
          }

          // Weekly revenue = last 7 days
          const diffMs   = todayDate.getTime() - invDate.getTime();
          const diffDays = Math.floor(diffMs / 86400000); // exact days
          if (diffDays >= 0 && diffDays < 7) {
            revWeek += realPaid;
            weekArr[6 - diffDays] += realPaid;
          }
        });

        setWeeklyRevenueData(weekArr);
        setReviews(reviewsRes.reviews?.slice(0, 5) || []);
        setActivities(logs.slice(0, 8));

        setStats({
          totalRooms: rooms.length,
          availableRooms: avail,
          occupiedRooms: occ,
          reservedRooms: resv,
          cleaningRooms: cln,
          checkinsToday,
          checkoutsToday,
          revenueToday: revToday,
          weeklyRevenue: revWeek,
          pendingPayments: pending,
        });

      } catch (err) {
        console.error('Dashboard load failed:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const getDayLabel = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toLocaleDateString('en-IN', { weekday: 'short' });
  };
  const dayLabels = [6, 5, 4, 3, 2, 1, 0].map(getDayLabel);
  const maxRev = Math.max(...weeklyRevenueData, 1);
  const floors = Object.keys(floorStats).map(Number).sort();

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-lodge-textDark">Dashboard</h2>
        <p className="text-gray-500 text-sm font-medium">
          Overview of today's activity {loading && <span className="text-xs text-gray-300">— loading…</span>}
        </p>
      </div>

      {/* ── Stats Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: 'Total Rooms',      val: stats.totalRooms,    icon: <Building className="w-6 h-6"/>,       color: 'bg-orange-100 text-orange-600',  text: 'text-gray-800' },
          { label: 'Available',        val: stats.availableRooms,icon: <CheckCircle className="w-6 h-6"/>,    color: 'bg-emerald-100 text-emerald-600',text: 'text-emerald-600' },
          { label: 'Occupied',         val: stats.occupiedRooms, icon: <XCircle className="w-6 h-6"/>,        color: 'bg-rose-100 text-rose-600',      text: 'text-rose-600' },
          { label: 'Check-Ins Today',  val: stats.checkinsToday, icon: <ArrowLeftRight className="w-6 h-6"/>, color: 'bg-amber-100 text-amber-600',    text: 'text-gray-800' },
          { label: 'Check-Outs Today', val: stats.checkoutsToday,icon: <ArrowLeftRight className="w-6 h-6"/>, color: 'bg-blue-100 text-blue-600',      text: 'text-gray-800' },
          { label: 'Revenue Today',    val: `₹${stats.revenueToday.toLocaleString('en-IN',{minimumFractionDigits:2})}`,    icon: <IndianRupee className="w-6 h-6"/>,    color: 'bg-yellow-100 text-yellow-600',  text: 'text-gray-800', wide: true },
          { label: 'Weekly Revenue',   val: `₹${stats.weeklyRevenue.toLocaleString('en-IN',{minimumFractionDigits:2})}`,   icon: <Calendar className="w-6 h-6"/>,      color: 'bg-lodge-brown/10 text-lodge-brown', text: 'text-gray-800', wide: true },
          { label: 'Pending Payments', val: `₹${stats.pendingPayments.toLocaleString('en-IN',{minimumFractionDigits:2})}`, icon: <AlertCircle className="w-6 h-6"/>,    color: 'bg-red-100 text-red-600',        text: 'text-red-600',  wide: true },
        ].map((card, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex items-center gap-4">
            <div className={`p-3 rounded-xl flex-shrink-0 ${card.color}`}>{card.icon}</div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{card.label}</p>
              <p className={`text-xl font-bold ${card.text}`}>{card.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Weekly Revenue Bar Chart */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-1">Weekly Revenue</h3>
          <p className="text-xs text-gray-400 font-medium mb-4">Last 7 days — actual payments received</p>
          {weeklyRevenueData.every(v => v === 0) ? (
            <div className="h-56 flex items-center justify-center text-xs text-gray-300 font-semibold border border-dashed rounded-xl">
              No revenue recorded in the last 7 days
            </div>
          ) : (
            <div className="relative" style={{ height: '224px' }}>
              {/* chart area — bars drawn from bottom up using absolute positioning */}
              <div className="absolute inset-0 border-b border-l border-gray-100" />
              <div className="absolute inset-0 flex items-end justify-between gap-1 px-2 pb-6">
                {weeklyRevenueData.map((val, idx) => {
                  const BAR_MAX_PX = 168; // 75% of 224px for bars, rest for labels
                  const barPx = val > 0 ? Math.max(8, Math.round((val / maxRev) * BAR_MAX_PX)) : 2;
                  return (
                    <div key={idx} className="flex flex-col items-center justify-end flex-1 h-full group relative">
                      {val > 0 && (
                        <div className="absolute bg-gray-800 text-white text-[9px] py-0.5 px-1.5 rounded opacity-0 group-hover:opacity-100 transition shadow whitespace-nowrap z-10"
                          style={{ bottom: `${barPx + 4}px` }}>
                          ₹{val.toLocaleString('en-IN')}
                        </div>
                      )}
                      <div
                        style={{ height: `${barPx}px` }}
                        className={`w-full rounded-t-md transition-all duration-500 ${
                          idx === 6 ? 'bg-lodge-brown' : 'bg-lodge-accent hover:bg-lodge-hover'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
              {/* Day labels row pinned to bottom */}
              <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2" style={{ height: '24px' }}>
                {dayLabels.map((lbl, idx) => (
                  <div key={idx} className="flex-1 flex items-center justify-center">
                    <span className="text-[9px] text-gray-400 font-bold">{lbl}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Occupancy by Floor */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-1">Occupancy by Floor</h3>
          <p className="text-xs text-gray-400 font-medium mb-4">Current occupied rooms per floor</p>
          {floors.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-gray-300 font-semibold border border-dashed rounded-xl">
              No room data available
            </div>
          ) : (
            <div className="relative" style={{ height: '224px' }}>
              <div className="absolute inset-0 border-b border-l border-gray-100" />
              <div className="absolute inset-0 flex items-end justify-around gap-2 px-4 pb-10">
                {floors.map((floor) => {
                  const { occupied, total } = floorStats[floor];
                  const occupancyPct = total > 0 ? Math.round((occupied / total) * 100) : 0;
                  const BAR_MAX_PX = 152;
                  // Always render at least 4px so 0% floors are visible
                  const barPx = Math.max(4, Math.round((occupancyPct / 100) * BAR_MAX_PX));
                  const barColor = occupancyPct >= 80 ? 'bg-red-500' :
                                   occupancyPct >= 50 ? 'bg-amber-400' : 'bg-emerald-500';
                  return (
                    <div key={floor} className="flex flex-col items-center justify-end flex-1 h-full group relative">
                      <div className="absolute bg-gray-800 text-white text-[9px] py-0.5 px-1.5 rounded opacity-0 group-hover:opacity-100 transition shadow whitespace-nowrap z-10"
                        style={{ bottom: `${barPx + 4}px` }}>
                        {occupied}/{total} · {occupancyPct}%
                      </div>
                      <div
                        style={{ height: `${barPx}px` }}
                        className={`w-full rounded-t-md transition-all duration-500 ${barColor}`}
                      />
                    </div>
                  );
                })}
              </div>
              {/* Floor labels */}
              <div className="absolute bottom-0 left-0 right-0 flex justify-around px-4" style={{ height: '40px' }}>
                {floors.map((floor) => {
                  const { occupied, total } = floorStats[floor];
                  const occupancyPct = total > 0 ? Math.round((occupied / total) * 100) : 0;
                  return (
                    <div key={floor} className="flex-1 flex flex-col items-center justify-center gap-0.5">
                      <span className="text-[9px] text-gray-400 font-bold">Fl {floor}</span>
                      <span className="text-[8px] text-gray-300 font-semibold">{occupancyPct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Reviews & Activity ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 border-b border-gray-50 pb-3 mb-4">
            <MessageSquare className="w-4 h-4 text-lodge-accent" />
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Recent Reviews</h3>
          </div>
          <div className="space-y-4 flex-1 overflow-y-auto max-h-[300px]">
            {reviews.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8 font-medium">No reviews received yet.</p>
            ) : reviews.map((rev) => (
              <div key={rev.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100/50">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex gap-0.5">
                    {Array.from({length:5}).map((_,i)=>(
                      <span key={i} className={`text-sm ${i<rev.rating?'text-amber-400':'text-gray-200'}`}>★</span>
                    ))}
                  </div>
                  <span className="text-[10px] text-gray-400 font-semibold">{rev.created_at}</span>
                </div>
                <p className="text-xs text-gray-600 font-medium italic">"{rev.review_text}"</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 border-b border-gray-50 pb-3 mb-4">
            <Activity className="w-4 h-4 text-lodge-brown" />
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Recent Activity</h3>
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto max-h-[300px]">
            {activities.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8 font-medium">No activity logged yet.</p>
            ) : activities.map((act) => (
              <div key={act.id} className="flex items-start gap-3 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-lodge-accent mt-1.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-gray-700">{act.action}</p>
                  <p className="text-gray-500 text-[11px] font-medium leading-relaxed">{act.details}</p>
                  <span className="text-[9px] text-gray-400 font-bold block mt-0.5">{act.timestamp} · {act.email}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
