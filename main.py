from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from supabase_client import supabase
from routers import masterlist

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(masterlist.router)


@app.get("/")
def home():
    return {"message": "Clinic Appointment Backend is Running!"}


@app.get("/students")
def get_students():
    """Legacy stub — superseded by /api/masterlist/students, kept so nothing breaks
    if another module still calls this."""
    response = supabase.table("student").select("*").execute()
    return response.data
