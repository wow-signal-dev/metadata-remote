"""
Gunicorn configuration for Metadata Remote production deployment
"""
import os

# Server socket
bind = f"0.0.0.0:{os.environ.get('PORT', '8338')}"
backlog = 2048

# Worker processes
# IMPORTANT: Using single worker due to in-memory state (history, inference cache)
# Multiple workers would each have separate state, breaking undo/redo functionality
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

# SSL/Security (handled by reverse proxy)
secure_scheme_headers = {'X-FORWARDED-PROTOCOL': 'https', 'X-FORWARDED-PROTO': 'https', 'X-FORWARDED-SSL': 'on'}

# Performance
sendfile = True  # Use sendfile() for better file streaming performance
preload_app = False  # Don't preload app to avoid issues with file handles/subprocesses

# Server hooks for graceful shutdown
def worker_int(worker):
    """Called just after a worker exited on SIGINT or SIGQUIT."""
    worker.log.info("Worker received INT or QUIT signal")

def pre_fork(server, worker):
    """Called just before a worker is forked."""
    server.log.info("Worker spawning (pid: %s)", worker.pid)

def pre_exec(server):
    """Called just before a new master process is forked."""
    server.log.info("Forking new master process")

def when_ready(server):
    """Called just after the server is started."""
    server.log.info("Server is ready. Listening at: %s", server.address)

def on_exit(server):
    """Called just before exiting."""
    server.log.info("Server is shutting down")