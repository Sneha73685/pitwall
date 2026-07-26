# Batch-job image, not a long-running service (ADR-0001: ingestion is
# offline/scheduled, never a network service the backend calls). Meant
# to be invoked via `docker compose run pipeline <command>`, not `up`.
FROM python:3.12-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml ./
RUN uv sync --no-install-project

COPY . .
RUN uv sync

CMD ["uv", "run", "python", "-m", "pitwall_pipeline.smoke"]
