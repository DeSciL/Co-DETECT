# Multi-stage build for optimal size and speed
# Stage 1: Frontend build
FROM node:22-alpine AS frontend-build
WORKDIR /app

# Copy package files first for better layer caching
COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund

# Copy source and build
COPY frontend/ ./
RUN npm run build && npm cache clean --force

# Stage 2: Python dependencies build stage
FROM python:3.12-slim AS python-builder

# Install build dependencies in single layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        g++ \
        libc6-dev \
        libgomp1 && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean

# Optimize pip for faster installs
RUN pip install --no-cache-dir --upgrade pip==24.0 setuptools wheel

# Install Python packages with optimizations
COPY annotation_fastapi/requirements_prod.txt ./requirements.txt
RUN pip install --no-cache-dir --user \
    --find-links https://download.pytorch.org/whl/cpu \
    --prefer-binary \
    --no-compile \
    -r requirements.txt && \
    # Aggressive cleanup to reduce size
    find /root/.local -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true && \
    find /root/.local -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true && \
    find /root/.local -name "*.pyc" -delete && \
    find /root/.local -name "*.pyx" -delete && \
    find /root/.local -name "*.c" -delete && \
    find /root/.local -name "*.cpp" -delete

# Stage 3: Final runtime image
FROM python:3.12-slim AS runtime

# Install only essential runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        libgomp1 && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean && \
    rm -rf /tmp/* /var/tmp/*

# Copy Python packages from build stage
COPY --from=python-builder /root/.local /root/.local

# Create non-root user
RUN useradd --create-home --shell /bin/bash --uid 1000 app

WORKDIR /app

# Copy built frontend
COPY --from=frontend-build /app/dist ./static

# Copy application code
COPY annotation_fastapi/ ./

# Create directories and set permissions
RUN mkdir -p annotation_results models openai_cache && \
    chown -R app:app /app && \
    chmod -R 755 /app

USER app

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
