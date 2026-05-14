FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Source + fixture mount path.
COPY src/ ./src/
RUN mkdir -p /app/data /app/mock-data

# Non-root user — Fortune-500 baseline.
RUN useradd --create-home --shell /bin/bash nftones && chown -R nftones:nftones /app
USER nftones

ENV NFTONES_API_DATABASE_URL=sqlite:////app/data/nftones.db \
    NFTONES_API_FIXTURE=/app/mock-data/data.json

EXPOSE 8600

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8600/api/v1/health').status==200 else 1)"

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8600"]
