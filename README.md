# Gordon College Clinic Appointment System — Admin Portal (Frontend)

React + Tailwind CSS PWA for the admin side of the clinic appointment system.

## Stack
- **Frontend:** React 18 + Vite + Tailwind CSS, packaged as a PWA (`vite-plugin-pwa`)
- **Backend:** Python (separate repo/folder — not yet scaffolded)
- **Database/Auth:** Supabase

## Getting started

```bash
npm install
cp .env.example .env    # fill in your Supabase project URL + anon key
npm run dev
```

Then open http://localhost:5173/admin/login

## Structure

```
src/
  components/
    LoginForm.jsx        # shared form used by the admin login page
  pages/
    auth/
      AdminLogin.jsx      # login page (mobile bottom-sheet + desktop split layout)
  lib/
    supabaseClient.js     # Supabase client + adminSignIn() helper
public/
  gordon-college-logo.png # seal cropped from the mockup — replace with official hi-res artwork
```

## Notes
- The Gordon College seal in `public/gordon-college-logo.png` was cropped from your
  mockup screenshot for now. Swap in the official high-resolution logo file when you
  have it, keeping the same filename (or update the `src` in `AdminLogin.jsx`).
- Brand colors are defined as Tailwind tokens in `tailwind.config.js` (`gc.green`,
  `gc.accent`), sampled directly from your mockups (`#044B0E`, `#43AF52`).
- `adminSignIn()` currently calls Supabase Auth directly from the client. If you'd
  rather route admin login through the Python backend (for role checks, audit
  logging, etc.), swap that one function to call your API instead.
- Next screens to build: admin dashboard, appointments, student records.
