export default function AgentBubble({ isPending, open, onClick }) {
  if (isPending) return null
  return (
    <button
      type="button"
      aria-label={open ? "Close Clinic Assistant" : "Open Clinic Assistant"}
      title={isPending ? "Pending approval — assistant unavailable" : "Clinic Assistant"}
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gc-green-700 text-white shadow-lg transition hover:bg-gc-green-800 focus:outline-none focus:ring-2 focus:ring-gc-green-700 focus:ring-offset-2"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
        <path d="M12 3a7 7 0 0 0-7 7c0 2.5 1.3 4.7 3.3 6L8 21l5-2.3A7 7 0 0 0 19 10a7 7 0 0 0-7-7z" strokeLinejoin="round" />
        <path d="M8.5 11.5h7M9.5 8h5" strokeLinecap="round" opacity="0.9" />
      </svg>
    </button>
  )
}
