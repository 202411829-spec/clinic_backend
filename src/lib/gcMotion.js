// GC-RFB motion utilities ported into the clinic backend.
// These are UI-only helpers: trigger-origin geometry and modal mount/visible
// state. No business data or auth behavior lives here.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const TRIGGER_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  '[role="option"]',
  '[role="menuitem"]',
  'input',
  'select',
  'textarea',
  'tr',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const MAX_TRIGGER_AGE_MS = 2500
const MIN_SCALE = 0.12
const MAX_SCALE = 0.55

export const GC_MOTION_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'
export const GC_MODAL_OPEN_MS = 320
export const GC_MODAL_CLOSE_MS = 260

let lastTrigger = null
let listenersInstalled = false

export function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function getModalMotionStyle(visible) {
  return {
    transitionDuration: `${visible ? GC_MODAL_OPEN_MS : GC_MODAL_CLOSE_MS}ms`,
    transitionTimingFunction: GC_MOTION_EASING,
  }
}

export const GC_OVERLAY_Z = {
  dropdown: 1550,
  popover: 1550,
  modalBackdrop: 1500,
  modalPanel: 1501,
  confirmBackdrop: 1580,
  confirmPanel: 1581,
  toast: 1600,
}

export function rectFromElement(element) {
  if (!element || typeof element.getBoundingClientRect !== 'function') return null
  const rect = element.getBoundingClientRect()
  if (!rect || (!rect.width && !rect.height)) return null
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom,
  }
}

export function getTriggerOrigin(triggerRect, panelRect, viewport = { width: 0, height: 0 }) {
  if (!triggerRect || !panelRect) return null
  if (!panelRect.width || !panelRect.height) return null
  if (viewport.width && (triggerRect.right < 0 || triggerRect.left > viewport.width)) return null
  if (viewport.height && (triggerRect.bottom < 0 || triggerRect.top > viewport.height)) return null

  const centerX = triggerRect.left + triggerRect.width / 2
  const centerY = triggerRect.top + triggerRect.height / 2
  const rawX = centerX - panelRect.left
  const rawY = centerY - panelRect.top
  const originX = Math.max(-panelRect.width * 0.5, Math.min(rawX, panelRect.width * 1.5))
  const originY = Math.max(-panelRect.height * 0.5, Math.min(rawY, panelRect.height * 1.5))
  const rawScale = Math.min(
    triggerRect.width / Math.max(1, panelRect.width),
    triggerRect.height / Math.max(1, panelRect.height)
  )
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number.isFinite(rawScale) ? rawScale : MIN_SCALE))

  return {
    originX,
    originY,
    scale,
    style: {
      '--gc-origin-x': `${originX}px`,
      '--gc-origin-y': `${originY}px`,
      '--gc-origin-scale': String(scale),
    },
  }
}

function rememberTrigger(event) {
  const target = event?.target
  if (!target || typeof target.closest !== 'function') return
  const element = target.closest(TRIGGER_SELECTOR)
  const rect = rectFromElement(element)
  if (!rect) return
  lastTrigger = { rect, at: Date.now() }
}

function installCapture() {
  if (listenersInstalled || typeof document === 'undefined') return
  document.addEventListener('pointerdown', rememberTrigger, true)
  document.addEventListener('keydown', (event) => {
    if (['Enter', ' ', 'Spacebar'].includes(event.key)) rememberTrigger(event)
  }, true)
  listenersInstalled = true
}

installCapture()

export function readRecentTrigger(maxAge = MAX_TRIGGER_AGE_MS) {
  if (!lastTrigger) return null
  if (Date.now() - lastTrigger.at > maxAge) return null
  return lastTrigger.rect
}

export function clearRecentTrigger() {
  lastTrigger = null
}

export function useTriggerOrigin({
  enabled = true,
  panelRef,
  triggerRef = null,
  maxAge = MAX_TRIGGER_AGE_MS,
} = {}) {
  const [origin, setOrigin] = useState(null)

  useLayoutEffect(() => {
    // Keep the last computed origin while closing so exit motion scales back
    // toward the same trigger that opened the panel.
    if (!enabled || typeof window === 'undefined' || !panelRef?.current) return
    const rect = rectFromElement(triggerRef?.current) || readRecentTrigger(maxAge)
    const next = getTriggerOrigin(rect, panelRef.current.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    setOrigin(next)
  }, [enabled, panelRef, triggerRef, maxAge])

  if (!origin) return { className: '', style: undefined, origin: null }
  return { className: 'gc-origin-panel', style: origin.style, origin }
}

export function useModalPresence(open, duration = GC_MODAL_CLOSE_MS) {
  const [mounted, setMounted] = useState(Boolean(open))
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let raf1 = 0
    let raf2 = 0
    let timer = 0

    if (open) {
      setMounted(true)
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true))
      })
    } else {
      setVisible(false)
      timer = setTimeout(() => setMounted(false), prefersReducedMotion() ? 0 : duration)
    }

    return () => {
      if (raf1) cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
      if (timer) clearTimeout(timer)
    }
  }, [open, duration])

  return { mounted, visible }
}

export function useSelfClosingPresence(onClose, duration = GC_MODAL_CLOSE_MS) {
  const [open, setOpen] = useState(true)
  const closingRef = useRef(false)
  const timerRef = useRef(0)
  const { mounted, visible } = useModalPresence(open, duration)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setOpen(false)

    const closeDelay = prefersReducedMotion() ? 0 : duration
    if (closeDelay === 0) {
      onClose?.()
      return
    }
    timerRef.current = setTimeout(() => onClose?.(), closeDelay)
  }, [duration, onClose])

  return { mounted, visible, requestClose }
}
