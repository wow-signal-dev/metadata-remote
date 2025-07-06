# Alpine-based ultra-lightweight version
FROM python:3.11-alpine as builder

# Install build dependencies
RUN apk add --no-cache gcc musl-dev linux-headers

WORKDIR /app
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# Final stage
FROM python:3.11-alpine

# Install only runtime dependencies
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy Python dependencies from builder
COPY --from=builder /root/.local /root/.local

# Force complete rebuild to fix ARM64/ARMv7 images
RUN echo "Rebuild at $(date)" > /tmp/rebuild-marker.txt

# Explicitly set both PATH and PYTHONPATH
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONPATH=/root/.local/lib/python3.11/site-packages:$PYTHONPATH

# Copy application files
COPY app.py .
COPY config.py .
COPY core/ core/
COPY templates/ templates/
COPY static/ static/

EXPOSE 8338

CMD ["python", "app.py"]
