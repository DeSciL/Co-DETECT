FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN apt-get update && \
    apt-get install -y --no-install-recommends g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python packages using uv
COPY annotation_fastapi/requirements_prod.txt ./requirements.txt
RUN uv pip install --system --no-cache -r requirements.txt

# Copy application code
COPY annotation_fastapi/ ./

# Create directories and set permissions
RUN mkdir -p annotation_results models openai_cache

EXPOSE 8000

ENV PATH="/root/.local/bin:$PATH"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
