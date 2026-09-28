FROM python:3.12-slim-bookworm AS base
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app

FROM base AS deps
COPY apps/ai-gateway/requirements.txt ./requirements.txt
RUN pip install \
  --no-cache-dir \
  --index-url https://mirrors.aliyun.com/pypi/simple/ \
  --trusted-host mirrors.aliyun.com \
  --prefix=/install \
  -r requirements.txt

FROM base AS runner
ARG APP_VERSION=0.0.0
ARG APP_RELEASE_SHA=unknown
LABEL org.opencontainers.image.version="${APP_VERSION}"
LABEL org.opencontainers.image.revision="${APP_RELEASE_SHA}"

ENV APP_VERSION="${APP_VERSION}"
ENV APP_RELEASE_SHA="${APP_RELEASE_SHA}"

COPY --from=deps /install /usr/local
COPY apps/ai-gateway/app ./app

RUN useradd --create-home --uid 1001 appuser
USER appuser

EXPOSE 3603
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3603"]
