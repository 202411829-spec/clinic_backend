// src/components/admin/StatusBadge.jsx
const styles = {
  Completed: "bg-green-100 text-green-700",
  Pending: "bg-amber-100 text-amber-700",
  "No Show": "bg-red-100 text-red-700",
  Cancelled: "bg-gray-200 text-gray-700",
};

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
        styles[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}
