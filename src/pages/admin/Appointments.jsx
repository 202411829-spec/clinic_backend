import { useMemo, useState } from 'react'
import { IconArrowLeft } from '../../components/admin/icons.jsx'
import AppointmentCalendar from '../../components/admin/AppointmentCalendar.jsx'
import AppointmentsFilters from '../../components/admin/AppointmentsFilters.jsx'
import TimeBlockCard from '../../components/admin/TimeBlockCard.jsx'

// TODO: replace with the signed-in admin from your Supabase session
const CURRENT_ADMIN = {
  name: 'Joseph Daniel B. Ramos',
  role: 'Nurse',
  initials: 'JR'
}

// TODO: replace with appointments fetched from Supabase for the selected date
const MOCK_BLOCKS = [
  {
    id: 'block-1',
    startLabel: '8:00 AM',
    endLabel: '9:00 AM',
    capacity: 10,
    patients: [
      { name: 'Ramos, Joseph Daniel B.', age: 22, dept: 'CCS', sex: 'M', reason: 'Medical Certificate', status: 'Completed' },
      { name: 'Alfonso, Mark Joshua', age: 22, dept: 'CAHS', sex: 'M', reason: 'Medical Certificate', status: 'Pending' },
      { name: 'Ladiero, Christopher', age: 22, dept: 'CHTM', sex: 'M', reason: 'Medical Certificate', status: 'No-show' }
    ]
  },
  {
    id: 'block-2',
    startLabel: '9:00 AM',
    endLabel: '10:00 AM',
    capacity: 10,
    patients: [
      { name: 'Reyes, Angela M.', age: 21, dept: 'CBA', sex: 'F', reason: 'Follow-up Check', status: 'Pending' },
      { name: 'Santos, Miguel D.', age: 23, dept: 'CCS', sex: 'M', reason: 'Medical Certificate', status: 'Completed' },
      { name: 'Cruz, Bea Anne', age: 20, dept: 'CTED', sex: 'F', reason: 'Vaccination', status: 'Completed' }
    ]
  },
  {
    id: 'block-3',
    startLabel: '10:00 AM',
    endLabel: '11:00 AM',
    capacity: 10,
    // 10 patients booked → full
    patients: Array.from({ length: 10 }, (_, i) => ({
      name: `Student, Sample ${i + 1}`,
      age: 20 + (i % 4),
      dept: ['CCS', 'CAHS', 'CHTM', 'CBA'][i % 4],
      sex: i % 2 === 0 ? 'M' : 'F',
      reason: 'Medical Certificate',
      status: ['Completed', 'Pending', 'No-show'][i % 3]
    }))
  }
]

export default function Appointments({ onBack }) {
  const today = new Date(2026, 7, 6) // Aug 6, 2026 — matches the mockup's selected date
  const [selectedDate, setSelectedDate] = useState(today)
  const [viewMonth, setViewMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))

  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('All Department')
  const [course, setCourse] = useState('All Courses')
  const [reason, setReason] = useState('All Reason')

  const dateLabel = useMemo(
    () =>
      selectedDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      }),
    [selectedDate]
  )

  const filteredBlocks = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q && department === 'All Department' && course === 'All Courses' && reason === 'All Reason') {
      return MOCK_BLOCKS
    }
    return MOCK_BLOCKS.map((block) => ({
      ...block,
      patients: block.patients.filter((p) => {
        const matchesSearch = !q || p.name.toLowerCase().includes(q)
        const matchesDept = department === 'All Department' || p.dept === department
        const matchesReason = reason === 'All Reason' || p.reason === reason
        return matchesSearch && matchesDept && matchesReason
      })
    }))
  }, [search, department, course, reason])

  function handleSelectDate(date) {
    setSelectedDate(date)
  }

  function handleChangeMonth(date) {
    setViewMonth(date)
  }

  return (
    <div className="min-h-screen w-full bg-gc-green-50/40">
      {/* ---------- Top bar ---------- */}
      <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3 sm:px-6 lg:px-10">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[14px] font-semibold text-gray-700 hover:text-gc-green-700"
        >
          <IconArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="flex items-center gap-3 rounded-full border border-gray-200 py-1 pl-4 pr-1.5">
          <div className="text-right leading-tight">
            <p className="text-[13px] font-semibold text-gray-900">{CURRENT_ADMIN.name}</p>
            <p className="text-[11px] font-semibold text-gc-accent">{CURRENT_ADMIN.role}</p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gc-green-700 text-[13px] font-bold text-white">
            {CURRENT_ADMIN.initials}
          </span>
        </div>
      </header>

      {/* ---------- Body ---------- */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Appointments list — first on mobile is the calendar (below), first on desktop is the list (left) */}
          <section className="order-2 min-w-0 flex-1 lg:order-1">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <IconArrowLeft className="hidden" aria-hidden />
                  <h1 className="text-[15px] font-bold text-gray-900">Appointments</h1>
                </div>
                <span className="text-[13px] font-medium text-gray-400">{dateLabel}</span>
              </div>

              <div className="mt-4">
                <AppointmentsFilters
                  searchValue={search}
                  onSearchChange={setSearch}
                  department={department}
                  onDepartmentChange={setDepartment}
                  course={course}
                  onCourseChange={setCourse}
                  reason={reason}
                  onReasonChange={setReason}
                  departments={['All Department', 'CCS', 'CAHS', 'CHTM', 'CBA', 'CEAS']}
                  courses={['All Courses']}
                  reasons={['All Reason', 'Medical Certificate', 'Follow-up Check', 'Vaccination']}
                />
              </div>

              <div className="mt-4 space-y-3">
                {filteredBlocks.map((block, idx) => (
                  <TimeBlockCard key={block.id} block={block} defaultOpen={idx === 0} />
                ))}
              </div>
            </div>
          </section>

          {/* Calendar */}
          <aside className="order-1 w-full shrink-0 lg:order-2 lg:w-[320px]">
            <AppointmentCalendar
              selectedDate={selectedDate}
              viewMonth={viewMonth}
              onSelectDate={handleSelectDate}
              onChangeMonth={handleChangeMonth}
              className="lg:sticky lg:top-6"
            />
          </aside>
        </div>
      </main>
    </div>
  )
}
