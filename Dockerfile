# Build frontend
FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Main application
FROM python:3.12-slim
WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y gcc g++ curl && rm -rf /var/lib/apt/lists/*
COPY annotation_fastapi/requirements.txt ./
RUN pip install -r requirements.txt

# Copy application
COPY annotation_fastapi/ ./
COPY --from=frontend /app/dist ./static

# Create directories
RUN mkdir -p annotation_results models

# Run application
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
