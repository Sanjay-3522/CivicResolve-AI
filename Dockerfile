# CivicResolve — single-container image for Cloud Run.
#   Next.js standalone server on 0.0.0.0:$PORT (public)
#   FastAPI/uvicorn on 127.0.0.1:8000 (private; reached via Next rewrites)

# ── Stage 1: build the frontend ────────────────────────────────────────────────
FROM node:20-slim AS frontend
WORKDIR /build
ENV NEXT_TELEMETRY_DISABLED=1
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Node runtime binary (copied into the Python image) ───────────────
FROM node:20-slim AS noderuntime

# ── Stage 3: runtime ───────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    ENV=production \
    TRUST_PROXY=1 \
    PORT=8080 \
    UPLOAD_DIR=/app/backend/uploads \
    DATABASE_URL=sqlite:////app/backend/civicresolve.db

# Node runtime only (no npm) — the standalone server needs just the binary.
COPY --from=noderuntime /usr/local/bin/node /usr/local/bin/node

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/ ./

WORKDIR /app/frontend
COPY --from=frontend /build/.next/standalone ./
COPY --from=frontend /build/.next/static ./.next/static

COPY start.sh /app/start.sh
RUN chmod 0755 /app/start.sh \
 && useradd --create-home --uid 10001 --shell /usr/sbin/nologin appuser \
 && mkdir -p /app/backend/uploads \
 && chown -R appuser:appuser /app/backend

USER appuser
WORKDIR /app
EXPOSE 8080
CMD ["/app/start.sh"]
