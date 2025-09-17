# Frontend build stage
FROM node:22-alpine AS frontend-build
WORKDIR /app

# Copy package files first for better caching
COPY frontend/package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy source and build
COPY frontend/ ./
RUN npm run build

# Python build stage for dependencies
FROM python:3.12-slim AS python-deps
WORKDIR /app

# Install build dependencies (only what's needed for scikit-learn compilation)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc g++ libc6-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy production requirements first for better caching
COPY annotation_fastapi/requirements-prod.txt ./requirements.txt
RUN pip install --no-cache-dir --user -r requirements.txt && \
    find /root/.local -name "*.pyc" -delete && \
    find /root/.local -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

# Final runtime stage
FROM python:3.12-slim AS runtime
WORKDIR /app

# Install minimal runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl && \
    rm -rf /var/lib/apt/lists/*

# Copy Python packages from build stage
COPY --from=python-deps /root/.local /root/.local

# Make sure scripts in .local are usable:
ENV PATH=/root/.local/bin:$PATH

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash app

# Copy built frontend (as app user)
COPY --from=frontend-build /app/dist ./static

# Copy application code
COPY annotation_fastapi/ ./

# Create necessary directories and set permissions
RUN mkdir -p annotation_results models openai_cache && \
    chown -R app:app /app

USER app

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/docs || exit 1

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
