# ── 백엔드 프로덕션 이미지 (T-081) ─────────────────────────────────────────
# 멀티스테이지: builder에서 Poetry로 의존성만 설치 → runtime는 slim + venv.
# build context: ./apps/backend
# 목표 이미지 크기: 500MB 이하.
# ---------------------------------------------------------------------------

# ── Stage 1: builder ────────────────────────────────────────────────────────
FROM python:3.13-slim AS builder

ENV POETRY_VERSION=2.1.1 \
    POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_IN_PROJECT=1 \
    PIP_NO_CACHE_DIR=1

# 빌드 의존성 (asyncpg/Pillow 등 네이티브 휠 대비)
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip install "poetry==${POETRY_VERSION}"

WORKDIR /app
COPY pyproject.toml poetry.lock ./
# 운영 의존성만(.venv 생성), 개발/테스트 패키지 제외
RUN poetry install --only main --no-root

# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM python:3.13-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

# 런타임 공유 라이브러리만 (libpq)
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r app && useradd -r -g app app

WORKDIR /app

# 빌더에서 만든 가상환경만 복사 (빌드 툴체인 제외 → 이미지 경량화)
COPY --from=builder /app/.venv /app/.venv
# 애플리케이션 소스
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

USER app
EXPOSE 8000

# 헬스체크 (FastAPI /health 또는 루트)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
