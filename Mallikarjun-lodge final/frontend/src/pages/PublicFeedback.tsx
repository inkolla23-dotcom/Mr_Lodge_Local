import React, { useState } from 'react';
import { Star, CheckCircle2, MessageSquare } from 'lucide-react';
import { API_BASE } from '../utils/api';

interface PublicFeedbackProps {
  invoiceNumber: string;
}

export default function PublicFeedback({ invoiceNumber }: PublicFeedbackProps) {
  const [rating, setRating] = useState(5);
  const [hovered, setHovered] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewText.trim()) { setError('Please write your review before submitting.'); return; }
    setError('');
    setLoading(true);
    try {
      const reviewMsg = invoiceNumber
        ? `${reviewText.trim()} (Invoice: ${invoiceNumber})`
        : reviewText.trim();

      const res = await fetch(`${API_BASE}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, review_text: reviewMsg }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Submit failed'); }
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-lodge-light flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8 flex flex-col items-center">

        {/* Logo */}
        <div className="w-20 h-20 rounded-full bg-lodge-light p-2 border border-gray-200 flex items-center justify-center mb-4">
          <img src="/logo.png" alt="Mallikarjun Lodge" className="w-full h-full object-contain" />
        </div>

        {success ? (
          <div className="w-full flex flex-col items-center text-center space-y-4 py-6">
            <CheckCircle2 className="w-16 h-16 text-emerald-500" />
            <h2 className="text-xl font-bold text-gray-800">Thank You!</h2>
            <p className="text-sm text-gray-500 font-semibold max-w-xs leading-relaxed">
              Your review has been submitted successfully. We hope you had a wonderful stay at Mallikarjun (Ravi) Lodge!
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-extrabold text-lodge-textDark text-center mb-1">Mallikarjun (Ravi) Lodge</h2>
            <p className="text-gray-400 text-xs text-center mb-6 font-bold uppercase tracking-wider">
              Guest Feedback & Review
            </p>

            {invoiceNumber && (
              <div className="mb-4 bg-gray-50 border border-gray-100 p-2.5 rounded-lg text-xs font-bold text-gray-600 text-center w-full">
                Invoice: <span className="text-lodge-brown">{invoiceNumber}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="w-full space-y-5">
              {/* Stars */}
              <div className="flex flex-col items-center space-y-2">
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Rate Your Stay</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHovered(star)}
                      onMouseLeave={() => setHovered(0)}
                      className="p-1 hover:scale-110 transition-transform"
                    >
                      <Star className={`w-9 h-9 transition-colors ${
                        star <= (hovered || rating)
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-gray-200 hover:text-amber-200'
                      }`} />
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 font-semibold">
                  {rating === 5 ? 'Excellent!' : rating === 4 ? 'Very Good' : rating === 3 ? 'Good' : rating === 2 ? 'Fair' : 'Poor'}
                </p>
              </div>

              {/* Review text */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Your Review</label>
                <div className="relative">
                  <MessageSquare className="absolute top-3.5 left-3.5 w-4 h-4 text-gray-400" />
                  <textarea
                    required
                    rows={4}
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Tell us about your experience..."
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent outline-none font-medium resize-none"
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-600 font-semibold bg-red-50 border border-red-100 rounded-lg p-2.5">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-lodge-brown text-white py-3 rounded-xl font-bold text-sm shadow hover:bg-lodge-textDark transition disabled:opacity-50"
              >
                {loading ? 'Submitting…' : 'Submit Feedback'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
