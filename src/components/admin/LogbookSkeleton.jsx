// src/components/admin/LogbookSkeleton.jsx
// Logbook-only loading placeholder. Mirrors the real full Logbook panel
// (header, filters, 9-column table) so switching from loading to loaded does
// not jump the page. Uses the shared GCAS `.skeleton` shimmer, not a spinner.

function Bar({ width, height = "h-4", className = "" }) {
  return (
    <span
      className={`skeleton block ${height} ${className}`.trim()}
      style={{ width }}
      aria-hidden="true"
    />
  );
}

const HEADER_WIDTHS = ["28%", "26%", "30%", "16%", "34%", "18%", "26%", "38%", "28%"];
const ROW_WIDTHS = [
  ["78%", "68%", "82%", "64%", "76%", "72%", "88%", "70%", "66%"],
  ["86%", "74%", "64%", "82%", "88%", "62%", "72%", "84%", "78%"],
  ["72%", "62%", "88%", "70%", "66%", "80%", "90%", "64%", "72%"],
  ["84%", "80%", "70%", "76%", "82%", "68%", "66%", "78%", "86%"],
  ["66%", "72%", "84%", "64%", "74%", "84%", "76%", "70%", "62%"],
];

export default function LogbookSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading logbook"
      className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5 print:hidden"
    >
      <span className="sr-only">Loading logbook…</span>

      <div aria-hidden="true">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <span className="skeleton h-8 w-8 rounded-md shrink-0" />
          <div className="space-y-1.5">
            <Bar width="7rem" height="h-5" />
            <Bar width="15rem" height="h-3" />
          </div>
        </div>

        {/* Search, filters, date range, export actions */}
        <div className="flex flex-col gap-2 mb-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-9 rounded-lg border border-ink-100 bg-white px-3 py-2 flex items-center"
              >
                <Bar width={i === 0 ? "82%" : "64%"} height="h-3.5" />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="skeleton h-9 w-full sm:w-64" />
            <div className="ml-auto flex items-center gap-2">
              <span className="skeleton h-9 w-20" />
              <span className="skeleton h-9 w-28" />
            </div>
          </div>
        </div>

        {/* Table skeleton — same header/row/padding rhythm as the real table */}
        <div className="overflow-x-auto -mx-4 md:mx-0">
          <table className="w-full text-sm min-w-[900px] md:min-w-0 border-collapse">
            <thead>
              <tr className="text-left text-xs text-ink-500 bg-ink-50/70">
                {HEADER_WIDTHS.map((width, i) => (
                  <th
                    key={i}
                    className={`py-2 ${i === 0 ? "px-4 md:px-2" : "px-2"} border-b border-ink-100`}
                  >
                    <Bar width={width} height="h-3" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROW_WIDTHS.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((width, colIndex) => (
                    <td
                      key={colIndex}
                      className={`py-2.5 ${colIndex === 0 ? "px-4 md:px-2" : "px-2"} border-b border-ink-100`}
                    >
                      {colIndex === 4 ? (
                        <div className="space-y-1.5">
                          <Bar width={width} height="h-3.5" />
                          <Bar width="58%" height="h-2.5" />
                        </div>
                      ) : (
                        <Bar width={width} height="h-4" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination strip placeholder */}
        <div className="mt-3 flex items-center justify-between">
          <Bar width="11rem" height="h-3" />
          <div className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton h-7 w-7 rounded-control" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
