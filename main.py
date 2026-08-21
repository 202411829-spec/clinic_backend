from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from supabase_client import supabase
from routers import masterlist, student_record, reports, student, appointment, clinic_schedule, dashboard, helpers

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include ALL routers (3 original + 6 from dev branch)
app.include_router(masterlist.router)
app.include_router(student_record.router)
app.include_router(reports.router)
app.include_router(student.router, prefix="/api/students", tags=["students"])
app.include_router(appointment.router, prefix="/api/appointments", tags=["appointments"])
app.include_router(clinic_schedule.router, prefix="/api/clinic-schedule", tags=["clinic-schedule"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])