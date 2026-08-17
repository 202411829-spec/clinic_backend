// src/components/admin/NavIcon.jsx
// Lightweight inline icon set so we don't need to add a new
// icon library just for the sidebar. Swap for lucide-react later if you want.

export default function NavIcon({ name, className = "w-5 h-5" }) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    viewBox: "0 0 24 24",
  };

  switch (name) {
    case "grid":
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="none"
        >
          <rect x="3" y="3" width="8" height="8" rx="2.5" />
          <rect x="13" y="3" width="8" height="8" rx="2.5" />
          <rect x="3" y="13" width="8" height="8" rx="2.5" />
          <rect x="13" y="13" width="8" height="8" rx="2.5" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
          <path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M4.5 20c1.4-3.6 4.3-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01M11 11h1v6h1" />
        </svg>
      );
    case "menu":
      return (
        <svg {...common}>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      );
    case "close":
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case "back":
      return (
        <svg {...common}>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      );
    case "dots":
      // vertical three-dot "more actions" trigger, filled rather than
      // stroked so the dots read clearly at small sizes
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="none"
        >
          <circle cx="12" cy="5" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="12" cy="19" r="1.9" />
        </svg>
      );
    case "chevron-left":
      return (
        <svg {...common}>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...common}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "printer":
      return (
        <svg {...common}>
          <path d="M7 8V4h10v4" />
          <rect x="4" y="8" width="16" height="8" rx="1.5" />
          <path d="M7 15h10v5H7z" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 4v11m0 0l-4-4m4 4l4-4" />
          <path d="M5 18h14" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3.5 6.5L12 13l8.5-6.5" />
        </svg>
      );
    case "file":
      return (
        <svg {...common}>
          <path d="M7 3.5h7l5 5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z" />
          <path d="M14 3.5V8h4.5" />
        </svg>
      );
    case "medical-cross":
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
    case "bell":
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="none"
        >
          <path d="M12 2.5a1.5 1.5 0 0 0-1.5 1.5v.62C7.36 5.27 5.25 8 5.25 11.25v3.1c0 .5-.18.98-.51 1.36l-1.06 1.22c-.72.83-.13 2.12.96 2.12h14.72c1.09 0 1.68-1.29.96-2.12l-1.06-1.22a2.08 2.08 0 0 1-.51-1.36v-3.1c0-3.25-2.11-5.98-5.25-6.63V4A1.5 1.5 0 0 0 12 2.5Z" />
          <path d="M9.5 20a2.5 2.5 0 0 0 5 0h-5Z" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M5 13l4 4L19 7" />
        </svg>
      );
    case "camera":
      // filled glyph (not stroked) so it stays crisp/legible even at the
      // small badge size it's used at on the photo-upload circle. The lens
      // is punched out in the badge's green so it reads clearly against
      // the white camera body instead of disappearing at small sizes.
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M9 4.5h6l1.1 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2.9l1.1-2Z" />
          <circle cx="12" cy="13.5" r="3.1" fill="#044B0E" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3.5 5 6v5.2c0 4.3 3 7.6 7 9.3 4-1.7 7-5 7-9.3V6l-7-2.5Z" />
          <path d="M9.2 12l1.9 1.9L15 10" />
        </svg>
      );
    case "phone":
      return (
        <svg {...common}>
          <path d="M6 3.5h2.6l1.4 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.4V16a2 2 0 0 1-2.2 2C10.7 17.5 6.5 13.3 6 7.7A2 2 0 0 1 6 3.5Z" />
        </svg>
      );
    case "sort":
      // small up/down chevron pair used for sortable table headers
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="none"
        >
          <path d="M12 4l4 5H8l4-5Z" opacity="0.9" />
          <path d="M12 20l-4-5h8l-4 5Z" opacity="0.45" />
        </svg>
      );
    default:
      return null;
  }
}
