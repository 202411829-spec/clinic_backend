// src/pages/student/Feedback.jsx
import { useEffect, useState } from "react";
import NavIcon from "../../components/admin/NavIcon";
import StarRating from "../../components/student/StarRating";
import { feedbackApi } from "../../lib/api.js";


const ratingLabels = {
  0: "Tap a star to rate your visit",
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very Good",
  5: "Excellent",
};

// TODO: swap for the logged-in student's id once auth/session is wired.
const CURRENT_STUDENT_ID = localStorage.getItem("studentId") || "202411829";

export default function Feedback() {
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const maxLength = 400;

  // Load this student's past submissions.
  useEffect(() => {
    let cancelled = false;
    feedbackApi
      .list(CURRENT_STUDENT_ID)
      .then((res) => {
        if (!cancelled) setHistory(res?.feedback || []);
      })
      .catch((err) => console.error("Failed to load feedback:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();

    if (rating === 0) {
      setError("Please select a star rating before submitting.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // Persist via POST /feedback, then refresh from the backend so the
      // history shows the saved row (with its server-generated id/date).
      await feedbackApi.submit({
        student_id: CURRENT_STUDENT_ID,
        rating,
        message: message.trim(),
      });
      const res = await feedbackApi.list(CURRENT_STUDENT_ID).catch(() => null);
      if (res?.feedback) setHistory(res.feedback);

      setRating(0);
      setMessage("");
      setJustSubmitted(true);
      window.setTimeout(() => setJustSubmitted(false), 4000);
    } catch (err) {
      setError(err.message || "Couldn't submit your feedback. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pt-2 md:pt-4 pb-6 md:pb-10 space-y-4 md:space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 md:p-7">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-gc-green/10 text-gc-green flex items-center justify-center shrink-0">
            <NavIcon name="feedback" className="w-5 h-5" />
          </span>
          <div>
            <h2 className="font-bold text-gray-800 text-sm md:text-lg tracking-wide">
              FEEDBACK
            </h2>
            <p className="text-xs md:text-sm text-gray-500 mt-0.5">
              Tell us about your clinic visit — it helps us serve you better.
            </p>
          </div>
        </div>
      </section>

      {/* Submit form */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 md:p-7">
        {justSubmitted && (
          <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-gc-green/10 border border-gc-green/20 px-4 py-3">
            <span className="w-5 h-5 rounded-full bg-gc-green text-white flex items-center justify-center shrink-0 mt-0.5">
              <NavIcon name="check" className="w-3 h-3" />
            </span>
            <p className="text-sm font-medium text-gc-green">
              Salamat! Your feedback has been submitted.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex flex-col items-center text-center gap-2 py-2">
            <p className="text-sm font-semibold text-gray-700">
              Please Rate Your Experience
            </p>
            <StarRating value={rating} onChange={(v) => { setRating(v); setError(""); }} />
            <p
              className={[
                "text-xs font-medium",
                rating ? "text-gc-accent" : "text-gray-400",
              ].join(" ")}
            >
              {ratingLabels[rating]}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Your message (optional)
              </label>
              <span className="text-[11px] text-gray-400">
                {message.length}/{maxLength}
              </span>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, maxLength))}
              rows={4}
              placeholder="Share any details that could help the clinic improve..."
              className="w-full resize-none border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gc-accent/40 focus:border-gc-accent"
            />
          </div>

          {error && (
            <p className="text-xs font-medium text-red-600 -mt-2">{error}</p>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-gc-green py-3.5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-gc-green-800 focus:outline-none focus:ring-2 focus:ring-gc-green-700/30"
          >
            Submit Feedback
          </button>
        </form>
      </section>

      {/* History */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 md:p-7">
        <h3 className="font-bold text-gray-800 text-sm tracking-wide mb-4">
          YOUR PREVIOUS FEEDBACK
        </h3>

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <span className="w-11 h-11 rounded-full bg-gray-50 text-gray-300 flex items-center justify-center">
              <NavIcon name="feedback" className="w-5 h-5" />
            </span>
            <p className="text-sm text-gray-400">
              You haven't submitted any feedback yet.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {history.map((f) => (
              <li
                key={f.id}
                className="rounded-xl border border-gray-100 bg-gray-50/60 p-4"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <StarRating value={f.rating} readOnly size="w-4 h-4" />
                  <span className="text-[11px] text-gray-400 shrink-0">
                    {new Date(f.date).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                {f.message && (
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {f.message}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
