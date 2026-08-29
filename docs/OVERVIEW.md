# Gordon College Clinic System — An Overview in Plain Words

This page explains the whole clinic appointment system at a glance. No technical
knowledge is needed. If you are a student, a clinic staff member, or just curious
about how it all fits together, you're in the right place.

---

## 1. What the System Does

The system is the clinic's one-stop place for appointments and record-keeping.
Students use it to book a time to see the clinic, and the clinic staff use it to
manage those appointments, keep track of who visits each day, store health
records, and prepare reports.

Everything a visit needs — from booking a slot to noting it in the daily
logbook to summarizing it in a report — happens in one connected place. This
keeps the clinic's information tidy and easy to find.

It has two doors: one for students and one for the clinic staff. Each group
sees only the parts they need.

---

## 2. Who Uses It

- **Students** — use it to book appointments, view their own health record, and
  send feedback.
- **Clinic staff (Admins)** — manage appointments, the daily logbook, student
  records, medical records, and reports.
- **Walk-in patients** — people who come to the clinic without a booking. They
  don't log in; the clinic staff records their visit for them.

---

## 3. The Student Experience

A student signs in with their school account. The first time they log in, they
must first complete their personal and health information before they can use
the rest of the portal.

Once that's done, a student can:

- See a **dashboard** with their **upcoming appointment** at a glance.
- **Book an appointment** — pick a day and an available time slot, and choose a
  reason (such as needing a medical certificate or a consultation).
- **Reschedule** an appointment to a different time.
- **View their own record** — their personal details and health information.
- **Send feedback** about the clinic.

One simple rule: a student may only have **one pending (waiting) appointment**
at a time. They can book a new one once the current one is completed, cancelled,
or marked as a no-show.

---

## 4. The Admin Experience

The clinic staff sign in on the admin side and can:

- See a **dashboard** with today's appointments and visits.
- **Manage the daily schedule** — set the clinic's hours and the time slots
  available for booking each day.
- **View and manage appointments** — see all bookings, and mark each one as
  completed, cancelled, or no-show.
- Use the **Logbook** — the running list of every visit to the clinic, including
  recording walk-in visitors.
- Browse the **student masterlist** — the full list of enrolled students.
- Manage **medical records** — a student's health history, exams, and more.
- Create and print **reports** that summarize the clinic's activity, with the
  option to print or download them as a file.

---

## 5. The Core Ideas

These are the building blocks the whole system is made of:

- **Students** — the people the clinic serves. Each has a single record of
  personal and health information.
- **Appointments** — a student's booking of a specific day and time. An
  appointment always has a status: waiting (pending), done (completed),
  missed (no-show), or cancelled.
- **Time slots** — the available blocks of time in a day that students can book.
- **The Logbook** — the record of every visit to the clinic, including walk-ins.
- **Medical Records** — a student's health history, contact details, yearly
  exams, lab work, and any certificates issued.
- **Reasons** — the purpose of a visit, such as needing a **Medical
  Certificate** or a **Consultation**.
- **Medicines** — the medications that are kept on hand and dispensed to
  patients during a visit.

Here is how the pieces relate in a simple way:

```
Student ──books──▶ Appointment (a day + time slot, with a reason)
                        │
                        ▼
                  The Clinic Visit
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
   The Logbook                     Medical Records
   (every visit)                   (health history, exams, certificates)
        │                               │
        └───────────────┬───────────────┘
                        ▼
                    Reports
              (summaries of all visits)
```

---

## 6. The Flow of a Visit

The typical journey through the system goes like this:

1. A student books an appointment for a chosen day and time.
2. The student shows up at the clinic.
3. The clinic staff see that appointment on today's list.
4. When the visit happens, the staff record it in the **logbook**.
5. That recorded visit becomes part of the student's records.
6. Over time, **reports** pull all these visits together into summaries.

---

## 7. How It's Built

The system is made of three main parts working together:

- **The screen (frontend)** — what a person sees and clicks in their web
  browser. It has a student side and an admin side.
- **The brain (backend)** — the logic that processes requests and enforces the
  rules, like "you can't book a time in the past" or "you can only have one
  pending appointment."
- **The memory (database)** — a cloud database that safely stores all the
  data: students, appointments, visits, records, and reports.

These three parts talk to each other. When a student clicks "book", the screen
asks the brain to check the rules and save it, and the brain stores it in the
memory. The screen you open in the browser is built with a modern web toolkit,
the brain is written in Python, and the memory lives in a cloud database.

---

## 8. A Note on Security

Logging in is handled by a separate, trusted identity service. Only enrolled
students with a school account can log in as students. Admin-only actions are
protected so that only clinic staff can manage appointments, records, and
reports — keeping sensitive health information safe and private.
