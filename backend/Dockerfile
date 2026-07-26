# Development image: hot-reload via uvicorn, source mounted as a volume
# by docker-compose.yml. Not a production image (see docs/architecture.md
# open item on deployment storage; production packaging is M7 work).
FROM python:3.12-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml ./
RUN uv sync --no-install-project

COPY . .
RUN uv sync

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
