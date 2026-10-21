// src/components/student/StudentHero.jsx
// Greeting banner for the student dashboard: brand gradient, soft rings in the
// corner, serif greeting (serif is reserved for institutional moments).
import { useNavigate } from "react-router-dom";
import NavIcon from "../ui/NavIcon.jsx";

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function StudentHero({ firstName, nextLabel }) {
  const navigate = useNavigate();
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
  return (
    <section className="relative overflow-hidden rounded-panel bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 p-6 text-white shadow-e2 md:p-8">
      {/* decorative rings — pointer-events-none so they never block the CTA */}
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-52 w-52 rounded-full border border-white/10" />
      <span aria-hidden className="pointer-events-none absolute -right-2 -top-6 h-36 w-36 rounded-full border border-white/10" />
      <span aria-hidden className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-white/5" />

      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-brand-100">{today}</p>
          <h1 className="cell-wrap mt-1.5 font-serif text-2xl font-semibold leading-tight md:text-3xl">
            {greeting()}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1.5 max-w-md text-sm text-brand-100">
            {nextLabel ?? "Book a visit with the clinic, check your record, or tell us how it went."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate("/student/book")}
            className="btn btn-press btn-shine bg-white text-brand-900 shadow-e2 hover:bg-brand-50"
          >
            <NavIcon name="plus" className="h-4 w-4" />
            Book appointment
          </button>
          <button
            onClick={() => navigate("/student/record")}
            className="btn btn-press border border-white/25 text-white hover:bg-white/10"
          >
            <NavIcon name="user" className="h-4 w-4" />
            My record
          </button>
        </div>
      </div>
    </section>
  );
}
