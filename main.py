import os

from flask import Flask
from flask_cors import CORS

from routers.auth import auth_bp
from routers.student import student_bp
from routers.appointment import appointment_bp
from routers.dashboard import dashboard_bp
from routers.clinic_schedule import clinic_schedule_bp
from routers.logbook import logbook_bp
from routers.notifications import notifications_bp
from routers.feedback import feedback_bp
from routers.masterlist import blueprint as masterlist_bp
from routers.student_record import student_record_bp
from routers.reports import blueprint as reports_bp
from routers.admin_mgmt import admin_mgmt_bp

app = Flask(__name__)

# =========================
# CORS
#
# Restrict to the frontend origins listed in FRONTEND_ORIGINS
# (comma-separated). Default matches the Vite dev server. The
# Authorization header must be allowed because the frontend sends
# 'Authorization: Bearer <supabase_access_token>' on every API call.
# supports_credentials is enabled for cookie/credential flows; note
# this requires explicit (non-wildcard) origins, which we enforce.
# =========================
_origins = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174").split(",")
    if origin.strip()
]

CORS(
    app,
    origins=_origins,
    allow_headers=["Content-Type", "Authorization"],
    supports_credentials=True,
)

# =========================
# REGISTER ROUTERS
# =========================
app.register_blueprint(auth_bp)
app.register_blueprint(student_bp)
app.register_blueprint(appointment_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(clinic_schedule_bp)
app.register_blueprint(logbook_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(feedback_bp)
app.register_blueprint(masterlist_bp)
app.register_blueprint(student_record_bp)
app.register_blueprint(reports_bp)
app.register_blueprint(admin_mgmt_bp)

# =========================
# ROOT + HEALTH CHECK
# =========================
@app.route("/")
def home():
    return {"success": True, "message": "Clinic Appointment Backend is Running!"}


@app.route("/health")
def health():
    return {"success": True, "message": "Clinic Appointment Backend is running"}

# =========================
# START SERVER
# =========================
if __name__ == "__main__":
    print("Clinic Appointment Backend starting...")
    app.run(
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("DEBUG", "false").strip().lower() in ("1", "true", "yes", "on")
    )