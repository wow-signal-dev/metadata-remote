FROM python:3.11-slim

# Install FFmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy application files
COPY app.py .
COPY templates/ templates/

# Install Python dependencies
RUN pip install --no-cache-dir flask

# Expose port
EXPOSE 8338

# Run the application
CMD ["python", "app.py"]
