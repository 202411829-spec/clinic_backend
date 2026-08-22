from flask import Flask
from flask_cors import CORS

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

app = Flask(__name__)

# Allow frontend applications to access the API
CORS(app)

# =========================
# REGISTER ROUTERS
# =========================
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
        host="0.0.0.0",
        port=5000,
        debug=True
    )