# Stage 1: Frontend build
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund
COPY frontend/ ./
RUN npm run build && npm cache clean --force

# Stage 2: Final runtime image
FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends g++ && \
    rm -rf /var/lib/apt/lists/*

# Install Python packages
COPY annotation_fastapi/requirements_prod.txt ./requirements.txt
RUN pip install --no-cache-dir --user -r requirements.txt

WORKDIR /app

# Copy built frontend
COPY --from=frontend-build /app/dist ./static

# Copy application code
COPY annotation_fastapi/ ./

# Create directories and set permissions
RUN mkdir -p annotation_results models openai_cache

EXPOSE 8000

ENV PATH="/root/.local/bin:$PATH"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
