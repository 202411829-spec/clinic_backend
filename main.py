from flask import Flask, render_template
from flask_cors import CORS

from routers.student import student_bp
from routers.appointment import appointment_bp
from routers.dashboard import dashboard_bp
from routers.clinic_schedule import clinic_schedule_bp
from routers.logbook import logbook_bp

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

# =========================
# FRONTEND
# =========================
@app.route("/")
def home():
    return render_template("index.html")

# =========================
# HEALTH CHECK
# =========================
@app.route("/health")
def health():
    return {
        "success": True,
        "message": "Clinic Appointment Backend is running"
    }

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