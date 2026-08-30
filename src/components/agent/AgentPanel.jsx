import { useEffect, useRef, useState } from 'react'
import ToolPreviewCard from './ToolPreviewCard.jsx'

export default function AgentPanel({
  open,
  onClose,
  onClear,
  history,
  preview,
  onSend,
  onConfirm,
  onDismissPreview,
  error,
  loading,
}) {
  const [input, setInput] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [history, preview, open])

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    await onSend(text)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center p-0 md:bottom-20 md:right-6 md:top-auto md:items-end md:justify-end md:p-0">
      {/* backdrop on mobile */}
      <button
        type="button"
        aria-label="Close assistant"
        onClick={onClose}
        className="absolute inset-0 bg-black/20 md:hidden"
      />
      <div className="relative flex h-[85vh] max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-gc-green-100 bg-white shadow-2xl md:h-[520px] md:w-[380px] md:rounded-2xl">
        <div className="flex items-center justify-between bg-gc-green-700 px-4 py-3 text-white">
          <div>
            <p className="text-sm font-bold">Clinic Assistant</p>
            <p className="text-xs opacity-80">Phase 1</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-white/90 hover:bg-white/15"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1 hover:bg-white/15"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-5 w-5"
              >
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-gc-green-50/30 p-4">
          {history.length === 0 && (
            <p className="rounded-2xl bg-white px-3 py-2 text-sm text-gray-600 shadow-sm">
              Ask about appointments, reports, or admins. Try: &quot;who are the admins?&quot;
            </p>
          )}
          {history.map((m, idx) => (
            <div
              key={idx}
              className={
                m.role === 'user'
                  ? 'ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-gc-green-700 px-3 py-2 text-sm text-white'
                  : 'mr-auto max-w-[80%] rounded-2xl rounded-bl-sm border border-gc-green-100 bg-white px-3 py-2 text-sm text-gray-900'
              }
            >
              {m.content}
            </div>
          ))}
          {preview && (
            <ToolPreviewCard
              preview={preview}
              busy={loading}
              onYes={() => onConfirm(preview.tool, preview.args)}
              onNo={onDismissPreview}
            />
          )}
          {loading && (
            <div className="mr-auto flex items-center gap-1 rounded-2xl rounded-bl-sm border border-gc-green-100 bg-white px-3 py-2">
              <span className="h-2 w-2 animate-bounce rounded-full bg-gc-green-700 [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gc-green-700 [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gc-green-700" />
            </div>
          )}
        </div>

        {error && (
          <div className="mx-3 mb-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2 border-t p-3">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
            placeholder="Ask about appointments, reports, settings..."
            className="max-h-20 min-h-[44px] flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-gc-green-700 focus:ring-2 focus:ring-gc-green-700/20"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-11 rounded-xl bg-gc-green-700 px-5 text-sm font-semibold text-white hover:bg-gc-green-800 disabled:opacity-60"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
