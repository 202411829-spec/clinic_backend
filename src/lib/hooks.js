// src/lib/hooks.js
// Shared React hooks used across admin/student panels.

import { useEffect, useState } from "react";

/**
 * Debounce a rapidly-changing value (e.g. a search input) so that
 * downstream consumers only re-render after `delayMs` of inactivity.
 */
export function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
