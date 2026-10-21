// src/pages/student/Feedback.jsx
import { useEffect, useState } from "react";
import NavIcon from "../../components/ui/NavIcon";
import StarRating from "../../components/student/StarRating";
import { feedbackApi } from "../../lib/api.js";
import { useAuth } from "../../context/AuthContext";


const ratingLabels = {
  0: "Tap a star to rate your visit",
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very Good",
  5: "Excellent",
};

export default function Feedback() {
  const { studentId } = useAuth();
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const maxLength = 400;

  // Load this student's past submissions.
  useEffect(() => {
    if (!studentId) return undefined;
    let cancelled = false;
    feedbackApi
      .list(studentId)
      .then((res) => {
        if (!cancelled) setHistory(res?.feedback || []);
      })
      .catch((err) => console.error("Failed to load feedback:", err));
    return () => {
      cancelled = true;
    };
  }, [studentId]);

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
        student_id: studentId,
        rating,
        message: message.trim(),
      });
      const res = await feedbackApi.list(studentId).catch(() => null);
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
    <div className="stagger mx-auto max-w-3xl space-y-4 pb-6 pt-2 md:space-y-6 md:pb-10 md:pt-4">
      {/* Header */}
      <section className="relative overflow-hidden rounded-panel bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 p-5 text-white shadow-e2 md:p-7">
        <span aria-hidden className="pointer-events-none absolute -right-8 -top-12 h-44 w-44 rounded-full border border-white/10" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card bg-white/15">
            <NavIcon name="feedback" className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-serif text-xl font-semibold leading-tight md:text-2xl">Feedback</h1>
            <p className="mt-0.5 text-sm text-brand-100">
              Tell us about your clinic visit — it helps us serve you better.
            </p>
          </div>
        </div>
      </section>

      {/* Submit form */}
      <section className="card-hover rounded-panel bg-white p-5 shadow-e2 md:p-7">
        {justSubmitted && (
          <div className="mb-5 flex animate-fade-in-up items-start gap-2.5 rounded-card border border-brand-200 bg-brand-50 px-4 py-3 motion-reduce:animate-none">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 animate-scale-in items-center justify-center rounded-full bg-brand-700 text-white">
              <NavIcon name="check" className="w-3 h-3" />
            </span>
            <p className="text-sm font-medium text-brand-800">
              Salamat! Your feedback has been submitted.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex flex-col items-center text-center gap-2 py-2">
            <p className="text-sm font-semibold text-ink-700">
              Please Rate Your Experience
            </p>
            <StarRating value={rating} onChange={(v) => { setRating(v); setError(""); }} />
            <p
              className={[
                "text-xs font-medium",
                rating ? "text-brand-700" : "text-ink-400",
              ].join(" ")}
            >
              {ratingLabels[rating]}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-900">
                Your message (optional)
              </label>
              <span className="tnum text-[11px] text-ink-400">
                {message.length}/{maxLength}
              </span>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, maxLength))}
              rows={4}
              placeholder="Share any details that could help the clinic improve..."
              className="w-full resize-none rounded-control border border-ink-200 px-3 py-2.5 text-sm text-ink-800 transition placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/25"
            />
          </div>

          {error && (
            <p className="-mt-2 animate-fade-in-up text-xs font-medium text-signal-rose">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary btn-press btn-shine w-full py-3 text-[15px]"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Submitting…
              </span>
            ) : (
              'Submit Feedback'
            )}
          </button>
        </form>
      </section>

      {/* History */}
      <section className="card-hover rounded-panel bg-white p-5 shadow-e2 md:p-7">
        <h2 className="panel-title mb-4 font-serif">Your previous feedback</h2>

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <NavIcon name="feedback" className="w-5 h-5" />
            </span>
            <p className="text-sm text-ink-400">
              You haven't submitted any feedback yet.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {/* Bounded per-student list, so a one-time staggered entrance
                stays cheap — transform/opacity only. */}
            {history.map((f, i) => (
              <li
                key={f.id}
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                className="row-hover animate-fade-in-up rounded-card bg-ink-50/70 p-4 ring-1 ring-inset ring-ink-100 motion-reduce:animate-none"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <StarRating value={f.rating} readOnly size="w-4 h-4" />
                  <span className="shrink-0 text-[11px] text-ink-400">
                    {new Date(f.date).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                {f.message && (
                  <p className="cell-wrap text-sm leading-relaxed text-ink-600">
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
