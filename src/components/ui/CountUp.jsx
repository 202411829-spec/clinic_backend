import { useEffect, useRef, useState } from 'react'

/** Animates a number from 0 → `value` with an ease-out curve. */
export default function CountUp({ value = 0, duration = 900, className = '' }) {
  const [n, setN] = useState(0)
  const raf = useRef(0)

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setN(value); return undefined }
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      setN(Math.round(value * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [value, duration])

  return <span className={`tnum ${className}`}>{n.toLocaleString()}</span>
}
