FROM python:3.11-slim

# libsndfile is needed by `soundfile` for WAV I/O.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
RUN mkdir -p /app/data

ENV NFTONES_WATERMARK_DB=/app/data/watermarks.db \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8500

# NFTONES_WATERMARK_SECRET MUST be provided at runtime via secrets manager.
# Default fallback in src/api.py is dev-only and will not be used here because
# the env will be unset → uvicorn will surface the missing-secret state in /api/v1/version.

CMD ["uvicorn", "src.api:app", "--host", "0.0.0.0", "--port", "8500"]
