import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (relativePath) => readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')

const motion = read('src/lib/gcMotion.js')
const css = read('src/assets/styles/gc-rfb-ui.css')
const indexCss = read('src/assets/styles/index.css')
const confirmDialog = read('src/components/ui/ConfirmDialog.jsx')
const walkInModal = read('src/components/admin/WalkInVisitModal.jsx')
const dateRangePicker = read('src/components/ui/DateRangePicker.jsx')
const addAnnualExamModal = read('src/components/admin/AddAnnualExamModal.jsx')
const adminsPanel = read('src/components/admin/AdminsPanel.jsx')
const timeBlockPopover = read('src/components/admin/TimeBlockEditPopover.jsx')
const studentRecordPanel = read('src/components/admin/StudentRecordPanel.jsx')
const logoutMenu = read('src/components/auth/LogoutMenu.jsx')
const agentPanel = read('src/components/agent/AgentPanel.jsx')
const mobileSidebar = read('src/components/navigation/MobileSidebarOverlay.jsx')
const studentMobileSidebar = read('src/components/navigation/StudentMobileSidebarOverlay.jsx')
const reportsPanel = read('src/components/admin/ReportsFullPanel.jsx')

test('shared motion utility owns slow-in/slow-out modal timing and reduced-motion unmount', () => {
  assert.match(motion, /GC_MOTION_EASING = 'cubic-bezier\(0\.4, 0, 0\.2, 1\)'/)
  assert.match(motion, /GC_MODAL_OPEN_MS = 320/)
  assert.match(motion, /GC_MODAL_CLOSE_MS = 260/)
  assert.match(motion, /export function prefersReducedMotion\(\)/)
  assert.match(motion, /export function getModalMotionStyle\(visible\)/)
  assert.match(motion, /transitionDuration: `\$\{visible \? GC_MODAL_OPEN_MS : GC_MODAL_CLOSE_MS\}ms`/)
  assert.match(motion, /useModalPresence\(open, duration = GC_MODAL_CLOSE_MS\)/)
  assert.match(motion, /setTimeout\(\(\) => setMounted\(false\), prefersReducedMotion\(\) \? 0 : duration\)/)
  assert.match(motion, /export function useSelfClosingPresence/)
  assert.match(motion, /requestClose/)
})

test('modal CSS uses one easing for opacity and transform on open and close', () => {
  assert.match(css, /\.gc-modal-backdrop\.is-open \{[\s\S]*?opacity 320ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  assert.match(css, /\.gc-modal-backdrop\.is-close \{[\s\S]*?opacity 260ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  assert.match(css, /\.gc-modal-panel\.is-open \{[\s\S]*?opacity 320ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  assert.match(css, /\.gc-modal-panel\.is-open \{[\s\S]*?transform 320ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  assert.match(css, /\.gc-modal-panel\.is-close \{[\s\S]*?opacity 260ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  assert.match(css, /\.gc-modal-panel\.is-close \{[\s\S]*?transform 260ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  assert.match(css, /\.gc-modal-panel\.gc-origin-panel\.is-open \{[\s\S]*?transform 320ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  assert.match(css, /\.gc-modal-panel\.gc-origin-panel\.is-close \{[\s\S]*?transform 260ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  assert.match(css, /\.gc-cal-pop\.gc-origin-panel \{[\s\S]*?gc-origin-in 320ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  assert.match(css, /\.gc-cal-pop\.gc-origin-panel\.is-close \{[\s\S]*?gc-origin-out 260ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/)

  const reducedMotion = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.match(reducedMotion, /\.gc-modal-panel\.is-close/)
  assert.match(reducedMotion, /\.gc-cal-pop\.is-close/)
  assert.doesNotMatch(indexCss, /\.modal-pop\b/)
})

test('controlled dialogs use shared presence with slow-in/slow-out classes', () => {
  for (const [name, source] of [
    ['ConfirmDialog', confirmDialog],
    ['WalkInVisitModal', walkInModal],
  ]) {
    assert.match(source, /useModalPresence\(open, GC_MODAL_CLOSE_MS\)/, name)
    assert.match(source, /gc-modal-backdrop/, name)
    assert.match(source, /gc-modal-panel/, name)
    assert.match(source, /visible \? "is-open" : "is-close"/, name)
  }

  assert.match(dateRangePicker, /CLOSE_DURATION = GC_MODAL_CLOSE_MS/)
  assert.match(dateRangePicker, /useModalPresence\(open, CLOSE_DURATION\)/)
  assert.match(dateRangePicker, /gc-cal-pop-portal/)
  assert.match(dateRangePicker, /visible \? "is-open" : "is-close"/)
})

test('unmount-controlled modals delay parent close until the exit animation ends', () => {
  assert.match(addAnnualExamModal, /useSelfClosingPresence\(onClose\)/)
  assert.match(addAnnualExamModal, /await onSubmit\(nextYearLabel, String\(schoolYear\)\.trim\(\)\);\s*requestClose\(\);/)
  assert.match(addAnnualExamModal, /visible \? "is-open" : "is-close"/)
  assert.doesNotMatch(addAnnualExamModal, /gc-modal-backdrop is-open/)
  assert.doesNotMatch(addAnnualExamModal, /@keyframes fadeIn/)

  assert.match(adminsPanel, /useSelfClosingPresence\(onClose\)/)
  assert.match(adminsPanel, /typeof children === 'function' \? children\(requestClose\) : children/)
  assert.match(adminsPanel, /onClick=\{requestClose\}/)
  assert.match(adminsPanel, /handleConfirmedRemoval\(requestClose\)/)
  assert.match(adminsPanel, /visible \? 'is-open' : 'is-close'/)

  assert.match(timeBlockPopover, /useSelfClosingPresence\(onClose\)/)
  assert.match(timeBlockPopover, /onSave\?\.\(\{ time: timeRange, slots: parsedSlots \}\);\s*requestClose\(\);/)
  assert.match(timeBlockPopover, /visible \? "is-open" : "is-close"/)
  assert.doesNotMatch(timeBlockPopover, /gc-modal-backdrop is-open/)

  assert.doesNotMatch(studentRecordPanel, /setActiveYear\(yearLabel\);\s*setAddModalOpen\(false\)/)
})

test('remaining dialogs and popovers use the same motion contract', () => {
  assert.match(logoutMenu, /useModalPresence\(open, GC_MODAL_CLOSE_MS\)/)
  assert.match(logoutMenu, /gc-modal-backdrop/)
  assert.match(logoutMenu, /gc-modal-panel/)
  assert.match(logoutMenu, /visible \? "is-open" : "is-close"/)
  assert.match(logoutMenu, /navigateTimerRef\.current = setTimeout/)
  assert.doesNotMatch(logoutMenu, /animate-\[fadeIn_0\.15s_ease-out\]/)
  assert.doesNotMatch(logoutMenu, /@keyframes fadeIn/)

  assert.match(agentPanel, /useModalPresence\(open, GC_MODAL_CLOSE_MS\)/)
  assert.match(agentPanel, /getModalMotionStyle\(visible\)/)
  assert.match(agentPanel, /if \(!mounted\) return null/)
  assert.match(agentPanel, /gc-modal-panel/)
  assert.match(agentPanel, /visible \? 'is-open' : 'is-close'/)
  assert.doesNotMatch(agentPanel, /animate-fade-in-up \[animation-duration:0\.22s\]/)

  for (const [name, source] of [
    ['MobileSidebarOverlay', mobileSidebar],
    ['StudentMobileSidebarOverlay', studentMobileSidebar],
  ]) {
    assert.match(source, /useModalPresence\(open, GC_MODAL_CLOSE_MS\)/, name)
    assert.match(source, /getModalMotionStyle\(visible\)/, name)
    assert.match(source, /motion-reduce:transition-none/, name)
    assert.match(source, /translate-y-full/, name)
    assert.doesNotMatch(source, /duration-300 ease-out/, name)
  }

  assert.match(reportsPanel, /useModalPresence\(pickerOpen, GC_MODAL_CLOSE_MS\)/)
  assert.match(reportsPanel, /<PortalOverlay/)
  assert.match(reportsPanel, /gc-modal-panel \$\{isContinuousDay \? "gc-reports-day-pop" : ""\}/)
  assert.match(reportsPanel, /periodOrigin\.className/)
  assert.match(reportsPanel, /pickerVisible \? "is-open" : "is-close"/)
  assert.doesNotMatch(reportsPanel, /animate-pop-in/)
})
