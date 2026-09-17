FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (layer caching — only re-runs when
# requirements.txt changes).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

# Gunicorn: 4 workers × 2 threads = 8 concurrent requests.
# Timeout 30s covers the slowest Supabase RPCs.
CMD ["gunicorn", "--workers", "4", "--threads", "2", "--timeout", "30", "--bind", "0.0.0.0:5000", "main:app"]
