// src/components/ui/SkeletonRows.jsx
// Shimmer-free pulse placeholder rows for tables that are still loading.
// Renders `rows` rows of `cells` grey bars; each column bar is a fraction of
// the column width so the shape reads as a table, not a wall of bars.

export default function SkeletonRows({ rows = 5, cells = 1, className = "" }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="border-t border-gray-100">
          <td colSpan={cells} className="px-4 py-3">
            <div className={`flex items-center gap-4 ${className}`}>
              {Array.from({ length: Math.min(cells, 6) }, (_, j) => (
                <div
                  key={j}
                  className="h-4 animate-pulse rounded bg-ink-100"
                  style={{ width: `${[22, 34, 26, 14, 10, 18][j % 6]}%` }}
                />
              ))}
            </div>
          </td>
        </tr>
      ))}
    </>
  )
}