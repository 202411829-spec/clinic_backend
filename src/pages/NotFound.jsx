import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-gc-accent">
        Error 404
      </p>
      <h1 className="mt-2 text-4xl font-bold text-gc-green-700">
        Page not found
      </h1>
      <p className="mt-3 max-w-md text-sm text-gray-500">
        The page you're looking for doesn't exist or may have been moved.
      </p>
      <Link
        to="/admin/login"
        className="mt-6 rounded-lg bg-gc-green-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gc-green-800"
      >
        Back to login
      </Link>
    </div>
  )
}
