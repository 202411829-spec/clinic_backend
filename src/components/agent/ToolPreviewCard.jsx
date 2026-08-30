export default function ToolPreviewCard({ preview, onYes, onNo, busy }) {
  if (!preview) return null
  const found = preview.found
  const rows = Array.isArray(preview.previewData)
    ? preview.previewData
    : Array.isArray(preview.preview)
      ? preview.preview
      : []
  const cardData = preview.previewData || preview.preview
  const isSettings =
    preview.tool === "update_clinic_settings" ||
    (cardData && typeof cardData === "object" && !Array.isArray(cardData) && cardData.current)

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-900">
        {preview.tool === "cancel_appointments" && `Found ${found ?? rows.length} appointment(s)`}
        {preview.tool === "deactivate_admin" && `Deactivate ${cardData?.email || preview.args?.admin_id}?`}
        {isSettings && "Proposed changes"}
        {!preview.tool && "Preview"}
      </p>
      {preview.tool === "cancel_appointments" && rows.length > 0 && (
        <ul className="mt-2 space-y-1">
          {rows.slice(0, 5).map((r) => (
            <li
              key={r.appointment_id || r.id || Math.random()}
              className="rounded-lg bg-white px-2 py-1 text-xs text-gray-700"
            >
              {r.appointment_date || ""} {r.appointment_time || ""} — {r.student_id || ""} (
              {r.current_status || "pending"})
            </li>
          ))}
          {found > 5 && <li className="text-xs text-amber-700">+ {found - 5} more…</li>}
        </ul>
      )}
      {isSettings && cardData && (
        <div className="mt-2 rounded-lg bg-white p-2 text-xs">
          <div className="text-gray-500">Current: {JSON.stringify(cardData.current)}</div>
          <div className="font-semibold text-gray-900">
            Proposed: {JSON.stringify(cardData.proposed || cardData)}
          </div>
        </div>
      )}
      {preview.tool === "deactivate_admin" && (
        <div className="mt-2 rounded-lg bg-white p-2 text-xs text-gray-700">
          <div>Email: {cardData?.email}</div>
          <div>Role: {cardData?.role}</div>
          <div>Status: {cardData?.status}</div>
        </div>
      )}
      {preview.requiresConfirm ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onYes}
            disabled={busy}
            className="flex-1 rounded-xl bg-gc-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-gc-green-800 disabled:opacity-60"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={onNo}
            disabled={busy}
            className="flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-60"
          >
            No
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-amber-700">{preview.message || "No changes needed."}</p>
      )}
    </div>
  )
}
