# Backend image for Fly.io (see fly.toml). Serves the FastAPI app with
# uvicorn on port 8080; database migrations run separately as Fly's release
# command (`alembic upgrade head`).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app

RUN useradd --create-home --uid 1000 appuser
USER appuser

EXPOSE 8080
# Fly terminates HTTPS and forwards to the app, so trust its forwarded headers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*"]
