export default function ComingSoon({ title }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 text-center">
      <p className="text-lg font-bold text-gray-400">{title}</p>
      <p className="mt-1 text-sm text-gray-400">This page hasn't been built yet.</p>
    </div>
  )
}
