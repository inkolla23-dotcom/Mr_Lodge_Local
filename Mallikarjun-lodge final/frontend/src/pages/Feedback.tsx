import React, { useState } from 'react';
import { Star, CheckCircle2, MessageSquare } from 'lucide-react';
import { apiFetch } from '../utils/api';

export default function Feedback() {
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Get invoice number from URL params if present
  const queryParams = new URLSearchParams(window.location.search);
  const invoiceNum = queryParams.get('inv');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewText.trim()) return alert('Please enter a review message');
    
    setLoading(true);
    try {
      const reviewMsg = invoiceNum 
        ? `${reviewText.trim()} (Submitted for Invoice ${invoiceNum})`
        : reviewText.trim();

      await apiFetch('/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, review_text: reviewMsg })
      });
      setSuccess(true);
    } catch (err: any) {
      alert(err.message || 'Failed to submit review');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-lodge-light flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8 flex flex-col items-center">
        {/* Logo */}
        <div className="w-20 h-20 rounded-full bg-lodge-light p-2 border border-gray-200 flex items-center justify-center mb-4">
          <img src="/logo.png" alt="Mallikarjun Lodge Logo" className="w-full h-full object-contain" />
        </div>

        {success ? (
          <div className="w-full flex flex-col items-center text-center space-y-4 py-6">
            <CheckCircle2 className="w-16 h-16 text-emerald-500" />
            <h2 className="text-xl font-bold text-gray-800">Thank You!</h2>
            <p className="text-sm text-gray-500 font-semibold max-w-xs">
              Your valuable review and rating have been recorded successfully. We hope you had a comfortable stay at Mallikarjun Lodge!
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-extrabold text-lodge-textDark text-center mb-1">Mallikarjun (Ravi) Lodge</h2>
            <p className="text-gray-500 text-xs text-center mb-6 font-bold uppercase tracking-wider">
              Guest Feedback & Review Form
            </p>

            {invoiceNum && (
              <div className="mb-4 bg-gray-50 border border-gray-150 p-2.5 rounded-lg text-xs font-bold text-gray-600 text-center">
                Invoice Reference: <span className="text-lodge-brown">{invoiceNum}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="w-full space-y-5">
              {/* Rating Star selector */}
              <div className="flex flex-col items-center space-y-2">
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest text-center">
                  Rate Your Stay
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="p-1 hover:scale-110 transition duration-100"
                    >
                      <Star 
                        className={`w-8 h-8 ${
                          star <= rating 
                            ? 'text-amber-400 fill-amber-400' 
                            : 'text-gray-200 hover:text-amber-200'
                        }`} 
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Review Text */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Your Review Message
                </label>
                <div className="relative">
                  <span className="absolute top-3.5 left-3.5 text-gray-400">
                    <MessageSquare className="w-4 h-4" />
                  </span>
                  <textarea
                    required
                    rows={4}
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Tell us about your experience..."
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent focus:border-lodge-accent outline-none transition font-medium"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-lodge-brown text-white py-3 rounded-lg font-bold text-sm shadow hover:bg-lodge-textDark transition disabled:opacity-50 mt-2"
              >
                {loading ? 'Submitting Review...' : 'Submit Feedback'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
