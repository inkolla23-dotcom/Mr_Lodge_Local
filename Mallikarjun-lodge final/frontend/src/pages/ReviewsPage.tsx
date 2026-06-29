import React, { useState, useEffect } from 'react';
import { Star, Trash2, Calendar, QrCode } from 'lucide-react';
import { apiFetch } from '../utils/api';

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [avgRating, setAvgRating] = useState('0.0');
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Date range fields
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadReviews = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/reviews');
      setReviews(data.reviews || []);
      setAvgRating(data.avgRating || '0.0');
      setCount(data.count || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, []);

  const handleDeleteSingle = async (id: number) => {
    if (!confirm('Are you sure you want to delete this review?')) return;
    try {
      await apiFetch(`/reviews/${id}`, {
        method: 'DELETE'
      });
      loadReviews();
    } catch (err: any) {
      alert(err.message || 'Failed to delete review');
    }
  };

  const getFeedbackLink = () => {
    return `${window.location.origin}/feedback`;
  };

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-lodge-textDark">Reviews & Feedback</h2>
        <p className="text-gray-500 text-sm font-medium">Monitor ratings and manage customer feedback logs</p>
      </div>

      {/* Overview Cards & QR Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Avg Rating Card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col justify-center items-center text-center">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Average Rating</p>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-4xl font-black text-gray-800">{avgRating}</span>
            <span className="text-2xl text-amber-400">★</span>
          </div>
          <p className="text-xs text-gray-500 font-semibold">Based on {count} reviews</p>
        </div>

        {/* Total Reviews Card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col justify-center items-center text-center">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Total Reviews</p>
          <div className="text-4xl font-black text-lodge-brown mb-1.5">{count}</div>
          <p className="text-xs text-gray-500 font-semibold">Submitted via Feedback Page</p>
        </div>

        {/* QR Code Card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Review QR Code</p>
            <p className="text-xs text-gray-500 font-semibold leading-relaxed max-w-[140px]">
              Print or show this QR to guests to gather instant reviews.
            </p>
          </div>
          <div className="flex flex-col items-center gap-1.5 bg-gray-50 p-2 rounded-xl border border-gray-100">
            <img 
              src={`https://api.qrserver.com/v1/create-qr-code/?size=95x95&data=${encodeURIComponent(getFeedbackLink())}`}
              alt="QR Code"
              className="w-16 h-16"
            />
            <a 
              href={getFeedbackLink()} 
              target="_blank" 
              rel="noreferrer"
              className="text-[9px] font-black text-lodge-brown hover:underline uppercase"
            >
              Public Form
            </a>
          </div>
        </div>
      </div>

      {/* Reviews List */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4 border-b border-gray-50 pb-3">Guest Reviews</h3>

        {loading ? (
          <p className="text-center py-12 text-xs text-gray-400 font-medium">Loading feedback log...</p>
        ) : reviews.length === 0 ? (
          <p className="text-center py-12 text-xs text-gray-400 font-medium">No reviews submitted yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reviews.map((rev) => (
              <div key={rev.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100/50 flex flex-col justify-between group">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star 
                          key={i} 
                          className={`w-3.5 h-3.5 ${i < rev.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`} 
                        />
                      ))}
                    </div>
                    <span className="text-[10px] text-gray-400 font-bold">{rev.created_at}</span>
                  </div>
                  <p className="text-xs text-gray-600 font-medium italic mt-2">"{rev.review_text}"</p>
                </div>
                
                <div className="flex justify-end mt-4 opacity-0 group-hover:opacity-100 transition duration-150">
                  <button
                    onClick={() => handleDeleteSingle(rev.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
