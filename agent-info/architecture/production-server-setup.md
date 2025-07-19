# Production Server Setup and Reverse Proxy Security - Metadata Remote

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Production Server Architecture](#production-server-architecture)
   - [Gunicorn WSGI Server](#gunicorn-wsgi-server)
   - [Single Worker Configuration](#single-worker-configuration)
   - [Process Management](#process-management)
3. [Server Configuration Details](#server-configuration-details)
   - [Gunicorn Configuration File](#gunicorn-configuration-file)
   - [Application Factory Pattern](#application-factory-pattern)
   - [Signal Handling](#signal-handling)
4. [Reverse Proxy Security](#reverse-proxy-security)
   - [ProxyFix Middleware](#proxyfix-middleware)
   - [Header Trust Configuration](#header-trust-configuration)
   - [Security Implications](#security-implications)
5. [Health Monitoring System](#health-monitoring-system)
   - [Health Check Endpoint](#health-check-endpoint)
   - [Docker Health Check Configuration](#docker-health-check-configuration)
   - [Load Balancer Integration](#load-balancer-integration)
6. [Container Deployment](#container-deployment)
   - [Dockerfile Production Configuration](#dockerfile-production-configuration)
   - [Docker Compose Setup](#docker-compose-setup)
   - [Environment Variables](#environment-variables)
7. [Performance Characteristics](#performance-characteristics)
   - [Request Handling](#request-handling)
   - [Memory Management](#memory-management)
   - [Timeout Configuration](#timeout-configuration)
8. [Logging and Monitoring](#logging-and-monitoring)
   - [Access Logging](#access-logging)
   - [Error Logging](#error-logging)
   - [Log Aggregation](#log-aggregation)
9. [Security Best Practices](#security-best-practices)
   - [Cache Control Headers](#cache-control-headers)
   - [Path Traversal Protection](#path-traversal-protection)
   - [Rate Limiting Considerations](#rate-limiting-considerations)
10. [Deployment Scenarios](#deployment-scenarios)
    - [Behind Nginx](#behind-nginx)
    - [Behind Apache](#behind-apache)
    - [Behind Cloud Load Balancers](#behind-cloud-load-balancers)
11. [Troubleshooting Guide](#troubleshooting-guide)
12. [Recommendations and Future Improvements](#recommendations-and-future-improvements)

## Executive Summary

The Metadata Remote application has been migrated from Flask's development server to a production-ready Gunicorn WSGI server configuration. This setup provides industrial-strength request handling, proper reverse proxy support through ProxyFix middleware, comprehensive health monitoring, and graceful shutdown capabilities. The configuration prioritizes application state consistency by using a single worker process while maintaining high availability through proper process management and health checks.

Key production features:
- **Gunicorn WSGI Server**: Production-grade Python web server with proven reliability
- **Single Worker Architecture**: Maintains in-memory state consistency for history and caching
- **Reverse Proxy Support**: ProxyFix middleware for correct header interpretation
- **Health Monitoring**: Dedicated endpoint with Docker health check integration
- **Graceful Shutdown**: Proper SIGTERM/SIGINT handling for clean termination
- **Production Logging**: Structured logging to stdout/stderr for container environments

## Production Server Architecture

### Gunicorn WSGI Server

Gunicorn (Green Unicorn) is a Python WSGI HTTP Server that provides:
- **Pre-fork Worker Model**: Master process manages worker processes
- **Synchronous Workers**: Handles one request at a time per worker
- **Automatic Worker Management**: Restarts failed workers automatically
- **Graceful Reloading**: Zero-downtime configuration updates

Integration with Flask (app.py:1167-1172):
```python
# Application factory pattern for Gunicorn
if __name__ == '__main__':
    # This block will only run during development
    # In production, Gunicorn will import 'app' directly
    logger.warning("Running in development mode. Use Gunicorn for production!")
    app.run(host=HOST, port=PORT, debug=False)
```

### Single Worker Configuration

The application uses a single worker configuration due to critical in-memory state:

1. **History System** (core/history.py:83-94):
   - Stores undo/redo actions in memory
   - Thread-safe with mutex locking
   - Would be inconsistent across multiple workers

2. **Inference Cache** (core/inference.py):
   - Caches metadata suggestions for performance
   - 1-hour cache duration
   - Thread-safe implementation

Configuration rationale (gunicorn_config.py:10-13):
```python
# Worker processes
# IMPORTANT: Using single worker due to in-memory state (history, inference cache)
# Multiple workers would each have separate state, breaking undo/redo functionality
workers = 1
```

### Process Management

Gunicorn provides robust process management:

1. **Master Process**:
   - Manages worker lifecycle
   - Handles signals (TERM, INT, HUP, USR1)
   - Monitors worker health

2. **Worker Process**:
   - Handles actual requests
   - Automatic restart on failure
   - Configurable request limits

3. **Request Recycling** (gunicorn_config.py:19-21):
```python
# Restart workers after this many requests, with some variability
max_requests = 1000
max_requests_jitter = 100
```

## Server Configuration Details

### Gunicorn Configuration File

Complete configuration (gunicorn_config.py:1-69):

```python
"""
Gunicorn configuration for Metadata Remote production deployment
"""
import os

# Server socket
bind = f"0.0.0.0:{os.environ.get('PORT', '8338')}"
backlog = 2048

# Worker processes
workers = 1
worker_class = 'sync'
worker_connections = 1000
timeout = 120  # 2 minutes for long batch operations
keepalive = 5

# Restart workers after this many requests, with some variability
max_requests = 1000
max_requests_jitter = 100

# Logging
accesslog = '-'  # Log to stdout
errorlog = '-'   # Log to stderr
loglevel = 'info'
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Process naming
proc_name = 'metadata-remote'

# Server mechanics
daemon = False
pidfile = None
umask = 0
user = None
group = None
tmp_upload_dir = None

# SSL/TLS (disabled - handled by reverse proxy)
keyfile = None
certfile = None

# Server hooks for lifecycle management
def when_ready(server):
    """Called just after the server is started"""
    server.log.info("Server is ready. Listening at: %s", server.address)

def worker_int(worker):
    """Called just after a worker exited on SIGINT or SIGQUIT"""
    worker.log.info("Worker interrupted: %s", worker.pid)

def pre_fork(server, worker):
    """Called just before a worker is forked"""
    server.log.info("Worker spawning: %s", worker.pid)

def post_fork(server, worker):
    """Called just after a worker has been forked"""
    server.log.info("Worker spawned: %s", worker.pid)

def pre_exec(server):
    """Called just before a new master process is forked"""
    server.log.info("Forking new master process")

def pre_request(worker, req):
    """Called just before a worker processes the request"""
    worker.log.debug("%s %s", req.method, req.path)

def post_request(worker, req, environ, resp):
    """Called after a worker processes the request"""
    return None

# Performance tuning
sendfile = True  # Use sendfile() for static files
```

Key configuration decisions:

1. **Bind Address**: `0.0.0.0:8338` - Listens on all interfaces
2. **Timeout**: 120 seconds - Accommodates long batch operations
3. **Backlog**: 2048 - Large connection queue for burst traffic
4. **Logging**: stdout/stderr for container compatibility

### Application Factory Pattern

The application follows the factory pattern for Gunicorn compatibility:

1. **Module-level App Instance** (app.py:73):
```python
app = Flask(__name__)
```

2. **Gunicorn Import** (Dockerfile:37):
```dockerfile
CMD ["gunicorn", "--config", "gunicorn_config.py", "app:app"]
```

3. **Development Compatibility** (app.py:1167-1172):
```python
if __name__ == '__main__':
    logger.warning("Running in development mode. Use Gunicorn for production!")
    app.run(host=HOST, port=PORT, debug=False)
```

### Signal Handling

Graceful shutdown implementation (app.py:85-91):

```python
# Configure proper SIGTERM handling for graceful shutdown
def signal_handler(sig, frame):
    logger.info('Received shutdown signal, cleaning up...')
    sys.exit(0)

signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)
```

Signal flow:
1. Container orchestrator sends SIGTERM
2. Signal handler logs shutdown message
3. Clean exit allows Gunicorn to finish active requests
4. History and cache data preserved until process ends

## Reverse Proxy Security

### ProxyFix Middleware

The application uses Werkzeug's ProxyFix middleware (app.py:75-83):

```python
# Configure for reverse proxy
# This ensures Flask correctly interprets headers set by the reverse proxy
app.wsgi_app = ProxyFix(
    app.wsgi_app, 
    x_for=1,      # Trust 1 proxy for X-Forwarded-For
    x_proto=1,    # Trust 1 proxy for X-Forwarded-Proto  
    x_host=1,     # Trust 1 proxy for X-Forwarded-Host
    x_prefix=1    # Trust 1 proxy for X-Forwarded-Prefix
)
```

### Header Trust Configuration

ProxyFix processes these headers:

1. **X-Forwarded-For**: Client IP address
   - Used for logging and rate limiting
   - Trust level: 1 (single proxy)

2. **X-Forwarded-Proto**: Original protocol (http/https)
   - Used for secure cookie flags
   - Ensures proper URL generation

3. **X-Forwarded-Host**: Original host header
   - Used for absolute URL generation
   - Prevents host header injection

4. **X-Forwarded-Prefix**: URL path prefix
   - Used when app is mounted at subpath
   - Maintains correct routing

### Security Implications

1. **Trust Level Configuration**:
   - Set to 1 for single reverse proxy
   - Prevents header spoofing attacks
   - Must match actual proxy count

2. **IP Address Security**:
   - Real client IP for access control
   - Accurate geolocation data
   - Proper rate limiting

3. **Protocol Security**:
   - Correct HTTPS detection
   - Secure cookie settings
   - Mixed content prevention

## Health Monitoring System

### Health Check Endpoint

Implementation (app.py:129-137):

```python
@app.route('/health')
def health_check():
    """Health check endpoint for monitoring and load balancer checks"""
    return jsonify({
        'status': 'healthy',
        'service': 'metadata-remote',
        'version': '1.0.0',
        'timestamp': datetime.now().isoformat()
    }), 200
```

Response format:
```json
{
    "status": "healthy",
    "service": "metadata-remote",
    "version": "1.0.0",
    "timestamp": "2024-01-11T10:30:45.123456"
}
```

### Docker Health Check Configuration

Docker Compose configuration (docker-compose.yml:18-23):

```yaml
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8338/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

Parameters explained:
- **test**: Uses wget to check endpoint (Alpine compatible)
- **interval**: Check every 30 seconds
- **timeout**: 10-second timeout per check
- **retries**: 3 failures before unhealthy
- **start_period**: 40 seconds for initial startup

### Load Balancer Integration

The health endpoint enables:

1. **Automatic Instance Management**:
   - Remove unhealthy instances from rotation
   - Add recovered instances back
   - Zero-downtime deployments

2. **Monitoring Integration**:
   - Prometheus/Grafana scraping
   - CloudWatch health checks
   - Custom monitoring solutions

3. **Orchestration Support**:
   - Kubernetes liveness probes
   - Docker Swarm health checks
   - ECS health monitoring

## Container Deployment

### Dockerfile Production Configuration

Key production elements (Dockerfile:26-37):

```dockerfile
# Copy application files
COPY app.py .
COPY config.py .
COPY gunicorn_config.py .
COPY core/ core/
COPY static/ static/
COPY templates/ templates/

EXPOSE 8338

# Use Gunicorn instead of Flask's development server
CMD ["gunicorn", "--config", "gunicorn_config.py", "app:app"]
```

Production optimizations:
1. **Minimal Image**: Alpine Linux base
2. **Layer Caching**: Separate dependency installation
3. **Security**: Non-root user execution (via PUID/PGID)
4. **Performance**: Compiled Python bytecode

### Docker Compose Setup

Production configuration (docker-compose.yml:1-23):

```yaml
version: '3.8'
services:
  metadata-remote:
    build: .
    container_name: metadata-remote
    ports:
      - "8338:8338"
    volumes:
      - ${MUSIC_DIR:-/path/to/music}:/music:rw
      - metadata-history:/app/history
    environment:
      - PUID=1000
      - PGID=1000
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8338/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  metadata-history:
```

### Environment Variables

Supported environment variables:

1. **PORT**: Server port (default: 8338)
   - Used by Gunicorn configuration
   - Allows flexible deployment

2. **PUID/PGID**: User/Group IDs (default: 1000)
   - File permission management via `fix_file_ownership()` function
   - Security isolation
   - Applied after all file write operations

3. **MUSIC_DIR**: Music directory path
   - Volume mount point
   - Configurable per deployment

## Performance Characteristics

### Request Handling

Performance metrics:

1. **Concurrency Model**:
   - Synchronous worker: 1 request at a time
   - Suitable for I/O bound operations
   - File operations are primary bottleneck

2. **Connection Handling**:
   - Backlog: 2048 connections
   - Keepalive: 5 seconds
   - Efficient connection reuse

3. **Worker Recycling**:
   - After 1000 requests (±100)
   - Prevents memory leaks
   - Maintains fresh workers

### Memory Management

Memory considerations:

1. **In-Memory State**:
   - History: ~1KB per action
   - Inference cache: ~10KB per file
   - Total: <100MB typical usage

2. **Worker Memory**:
   - Base: ~50MB Python + Flask
   - Libraries: ~30MB Mutagen
   - Working set: ~100-200MB

3. **Memory Limits**:
   - No hard limit configured
   - Container limits recommended
   - Monitor via health checks

### Timeout Configuration

Timeout strategy (gunicorn_config.py:16):

```python
timeout = 120  # 2 minutes for long batch operations
```

Timeout scenarios:
1. **Batch Operations**: Large folder processing
2. **Audio Streaming**: Large file transfers
3. **Inference**: External API calls

## Logging and Monitoring

### Access Logging

Format configuration (gunicorn_config.py:27):

```python
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'
```

Log fields:
- `%(h)s`: Remote address
- `%(t)s`: Request time
- `%(r)s`: Request line
- `%(s)s`: Status code
- `%(b)s`: Response length
- `%(D)s`: Request duration (microseconds)

### Error Logging

Error handling:
1. **Application Errors**: Python tracebacks
2. **Worker Errors**: Process failures
3. **Timeout Errors**: Request timeouts

### Log Aggregation

Container logging best practices:

1. **stdout/stderr Output**:
   - Compatible with Docker logging drivers
   - Works with log aggregators
   - No file management needed

2. **Structured Logging**:
   - JSON format recommended
   - Parseable by log tools
   - Rich context information

3. **Log Levels**:
   - INFO: Normal operations
   - WARNING: Degraded performance
   - ERROR: Request failures

## Security Best Practices

### Cache Control Headers

Implementation (app.py:93-100):

```python
@app.after_request
def add_cache_headers(response):
    """Add cache-control headers to prevent reverse proxy caching of dynamic content"""
    if response.mimetype == 'application/json':
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, private'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response
```

Security benefits:
- Prevents proxy caching of user data
- Ensures fresh metadata reads
- Protects sensitive information

### Path Traversal Protection

Built-in protections:
1. **Safe Path Joins**: Using `safe_join()`
2. **Path Validation**: Checking against MUSIC_DIR
3. **Filename Sanitization**: Removing dangerous characters

### Rate Limiting Considerations

While not implemented, considerations for production:

1. **Per-IP Limits**: Using X-Forwarded-For
2. **Endpoint Limits**: Different limits per route
3. **User-based Limits**: After authentication

Recommended implementation:
```python
# Example with Flask-Limiter
from flask_limiter import Limiter
limiter = Limiter(
    app,
    key_func=lambda: request.headers.get('X-Forwarded-For', request.remote_addr)
)
```

## Deployment Scenarios

### Behind Nginx

Example Nginx configuration:

```nginx
server {
    listen 80;
    server_name metadata.example.com;

    location / {
        proxy_pass http://localhost:8338;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # Timeout for long operations
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

### Behind Apache

Example Apache configuration:

```apache
<VirtualHost *:80>
    ServerName metadata.example.com
    
    ProxyPass / http://localhost:8338/
    ProxyPassReverse / http://localhost:8338/
    
    # Required headers
    RequestHeader set X-Forwarded-Proto "http"
    RequestHeader set X-Forwarded-Host "%{HTTP_HOST}s"
    
    # Timeout for long operations
    ProxyTimeout 120
</VirtualHost>
```

### Behind Cloud Load Balancers

AWS ALB configuration considerations:

1. **Target Group Health Checks**:
   - Path: `/health`
   - Interval: 30 seconds
   - Healthy threshold: 2

2. **Listener Rules**:
   - Forward to target group
   - Stickiness not required

3. **Security Groups**:
   - Allow port 8338 from ALB
   - Restrict direct access

## Troubleshooting Guide

### Common Issues

1. **Worker Timeout**:
   - **Symptom**: 502 Bad Gateway after 30s
   - **Cause**: Operation exceeds timeout
   - **Solution**: Increase timeout in gunicorn_config.py

2. **Memory Issues**:
   - **Symptom**: Worker killed, OOM errors
   - **Cause**: Large batch operations
   - **Solution**: Add container memory limits

3. **Header Issues**:
   - **Symptom**: Wrong client IPs, HTTP instead of HTTPS
   - **Cause**: ProxyFix misconfiguration
   - **Solution**: Verify proxy count matches reality

### Debug Commands

1. **Check Worker Status**:
```bash
docker exec metadata-remote ps aux | grep gunicorn
```

2. **View Real-time Logs**:
```bash
docker logs -f metadata-remote
```

3. **Test Health Endpoint**:
```bash
curl http://localhost:8338/health
```

### Performance Monitoring

Key metrics to monitor:

1. **Response Times**: Via access logs
2. **Worker Restarts**: In error logs
3. **Memory Usage**: Container metrics
4. **Request Queue**: Reverse proxy metrics

## Recommendations and Future Improvements

### High Priority Enhancements

1. **External State Storage**:
   - Move history to Redis/PostgreSQL
   - Enable horizontal scaling
   - Improve reliability

2. **Async Workers**:
   - Use gevent/eventlet for concurrency
   - Handle more simultaneous requests
   - Better resource utilization

3. **Request ID Tracking**:
   - Add X-Request-ID header support
   - Trace requests through logs
   - Improve debugging

### Medium Priority Improvements

1. **Metrics Endpoint**:
   - Prometheus-compatible metrics
   - Worker statistics
   - Cache hit rates

2. **Graceful Reload**:
   - Zero-downtime deployments
   - Configuration hot-reload
   - Worker rotation

3. **Security Headers**:
   - HSTS for HTTPS enforcement
   - CSP for XSS protection
   - X-Frame-Options

### Low Priority Features

1. **Multi-Worker Support**:
   - Shared state backend
   - Session affinity
   - Distributed caching

2. **WebSocket Support**:
   - Real-time updates
   - Async worker class
   - Push notifications

3. **HTTP/2 Support**:
   - Better multiplexing
   - Server push
   - Header compression

## Implementation Notes

### File Ownership Management

The application includes automatic file ownership correction (core/file_utils.py:18-24):

```python
def fix_file_ownership(filepath):
    """Fix file ownership to match Jellyfin's expected user"""
    try:
        os.chown(filepath, OWNER_UID, OWNER_GID)
        logger.info(f"Fixed ownership of {filepath} to {OWNER_UID}:{OWNER_GID}")
    except Exception as e:
        logger.warning(f"Could not fix ownership of {filepath}: {e}")
```

This function is called after:
- Metadata writes
- Album art updates
- Filename changes
- Any file creation operations

### Path Validation Implementation

The core path validation (core/file_utils.py:11-16):

```python
def validate_path(filepath):
    """Validate that a path is within MUSIC_DIR"""
    abs_path = os.path.abspath(filepath)
    if not abs_path.startswith(os.path.abspath(MUSIC_DIR)):
        raise ValueError("Invalid path")
    return abs_path
```

This ensures all file operations remain within the configured music directory.

### Production Dependencies

The production environment requires (requirements.txt):
- Flask==3.0.0
- Gunicorn==21.2.0
- Werkzeug==3.0.1 (includes ProxyFix)
- Other dependencies for metadata handling

## Conclusion

The production server setup provides a robust, secure, and scalable foundation for the Metadata Remote application. The single-worker Gunicorn configuration maintains application state consistency while providing production-grade request handling. The reverse proxy support ensures secure deployment behind any standard web server or load balancer. With comprehensive health monitoring and proper logging, the application is ready for production deployment in containerized environments.

The architecture balances simplicity with production requirements, providing a solid foundation that can be enhanced based on actual usage patterns and scaling needs. The clear separation between development and production configurations ensures smooth transitions between environments while maintaining security and performance standards.