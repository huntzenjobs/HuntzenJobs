# ============================================
# HuntZen JobSearch - Backend FastAPI
# Multi-stage build for optimized production image
# ============================================

# Stage 1: Builder
FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy pyproject.toml for dependencies
COPY pyproject.toml .

# Install PyTorch CPU and torchvision from the same index (ensures operator compatibility)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -e .

# Stage 2: Production
FROM python:3.11-slim

# Create non-root user for security
RUN groupadd -r huntzen && useradd -r -g huntzen huntzen

WORKDIR /app

# Install runtime dependencies for marker-pdf (OCR, PDF processing)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-fra \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Install PyTorch CPU + torchvision from the same index (ensures operator compatibility)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Copy pyproject.toml and install dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

# Create Marker static directory with proper permissions
# Marker tries to write to /usr/local/lib/python3.11/site-packages/static by default
RUN mkdir -p /usr/local/lib/python3.11/site-packages/static && \
    chmod -R 777 /usr/local/lib/python3.11/site-packages/static

# Copy NEW application structure
COPY --chown=huntzen:huntzen src/ ./src/
COPY --chown=huntzen:huntzen app/ ./app/
COPY --chown=huntzen:huntzen prompts/ ./prompts/
# Note: pyproject.toml already copied above

# Create cache directory for Marker models with proper permissions
RUN mkdir -p /home/huntzen/.cache && \
    chown -R huntzen:huntzen /home/huntzen/.cache

# Switch to non-root user
USER huntzen

EXPOSE 8000

# Health check - matches Railway healthcheckPath
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Production command with Gunicorn multi-worker (16x capacity increase)
# Signal Handling: --graceful-timeout 30 allows workers to finish requests before shutdown
CMD ["gunicorn", "src.main:app", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--workers", "4", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "120", \
     "--graceful-timeout", "30", \
     "--keep-alive", "5", \
     "--max-requests", "1000", \
     "--max-requests-jitter", "50", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
