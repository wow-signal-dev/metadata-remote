# Audio Playback Backend Architecture

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Streaming Endpoint Design](#streaming-endpoint-design)
4. [HTTP Range Request Implementation](#http-range-request-implementation)
5. [File Format Support](#file-format-support)
6. [MIME Type Management](#mime-type-management)
7. [Security Implementation](#security-implementation)
8. [Streaming Algorithm](#streaming-algorithm)
9. [Error Handling Strategy](#error-handling-strategy)
10. [Performance Optimizations](#performance-optimizations)
11. [Content Delivery Headers](#content-delivery-headers)
12. [Integration with Flask](#integration-with-flask)
13. [File System Operations](#file-system-operations)
14. [Logging and Monitoring](#logging-and-monitoring)
15. [Code References](#code-references)
16. [Technical Limitations and Improvements](#technical-limitations-and-improvements)

## Executive Summary

The audio playback backend in Metadata Remote implements a robust HTTP-based streaming service that delivers audio files to the frontend player. Built on Flask, it provides range request support for efficient seeking and partial content delivery, ensuring smooth playback even for large audio files. The system includes on-the-fly transcoding for WavPack files to enable browser playback.

### Key Highlights:
- **HTTP/1.1 Range Support**: Full implementation of RFC 7233 for partial content delivery
- **Universal Format Support**: Handles 8 audio formats with proper MIME types
- **WavPack Transcoding**: Real-time conversion to WAV for browser compatibility
- **Chunked Streaming**: Memory-efficient 8KB chunk size for large files
- **Security First**: Path traversal protection and validation
- **Standard Compliance**: Proper HTTP headers for maximum compatibility
- **Efficient Delivery**: Minimal server resource usage through generator patterns

## Architecture Overview

The backend audio streaming system follows a layered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    HTTP Request Layer                        │
│                 (Range Header Processing)                    │
├─────────────────────────────────────────────────────────────┤
│                    Flask Route Handler                       │
│                   (/stream/<path:filepath>)                  │
├─────────────────────────────────────────────────────────────┤
│                   Security Validation                        │
│                  (Path Traversal Protection)                 │
├─────────────────────────────────────────────────────────────┤
│                    File Operations                           │
│              (Size Detection, Seek, Read)                    │
├─────────────────────────────────────────────────────────────┤
│                  Streaming Generator                         │
│                  (Chunked Data Delivery)                     │
├─────────────────────────────────────────────────────────────┤
│                   Response Builder                           │
│              (Headers, Status Codes, Content)               │
└─────────────────────────────────────────────────────────────┘
```

## Streaming Endpoint Design

### Route Definitions

The backend provides two streaming endpoints:

#### 1. Standard Streaming Endpoint

The primary streaming endpoint is defined at `app.py:107`:

```python
@app.route('/stream/<path:filepath>')
def stream_audio(filepath):
    """Stream audio file with range request support"""
```

- **Base Path**: `/stream/`
- **File Path**: URL-encoded relative path from MUSIC_DIR
- **Example**: `/stream/Artist/Album/01%20-%20Song.mp3`

#### 2. WavPack Transcoding Endpoint

A specialized endpoint for WavPack files is defined at `app.py:176`:

```python
@app.route('/stream/wav/<path:filepath>')
def stream_wav_transcoded(filepath):
    """Stream WavPack files as WAV for browser playback"""
```

- **Base Path**: `/stream/wav/`
- **Purpose**: Transcodes WavPack (.wv) files to WAV format on-the-fly
- **Example**: `/stream/wav/Artist/Album/01%20-%20Song.wv`

### Request Flow

1. **Path Reception**: Flask captures the complete file path
2. **Validation**: Path is validated for security
3. **File Location**: Resolved against MUSIC_DIR
4. **Streaming Decision**: Based on presence of Range header
5. **Response Generation**: Either full file or partial content

## HTTP Range Request Implementation

### Range Header Parsing (`app.py:128-137`)

The implementation follows RFC 7233 for byte-range requests:

```python
if range_header:
    # Parse range header
    byte_start = 0
    byte_end = file_size - 1
    
    match = re.search(r'bytes=(\d+)-(\d*)', range_header)
    if match:
        byte_start = int(match.group(1))
        if match.group(2):
            byte_end = int(match.group(2))
```

### Supported Range Formats

1. **Single Range**: `bytes=0-1023` (first 1024 bytes)
2. **Open-Ended Range**: `bytes=1024-` (from byte 1024 to end)
3. **Suffix Range**: Not implemented (e.g., `bytes=-500`)
4. **Multiple Ranges**: Not implemented (e.g., `bytes=0-500,1000-1500`)

### Range Request Response

For range requests, the server returns:
- **Status Code**: 206 Partial Content
- **Content-Range Header**: `bytes {start}-{end}/{total}`
- **Accept-Ranges Header**: `bytes`
- **Content-Length**: Actual bytes being sent

## File Format Support

### Supported Audio Extensions (`config.py`)

```python
AUDIO_EXTENSIONS = (
    '.mp3',   # MPEG-1 Audio Layer III
    '.flac',  # Free Lossless Audio Codec
    '.wav',   # Waveform Audio File Format
    '.m4a',   # MPEG-4 Audio
    '.wma',   # Windows Media Audio
    '.wv',    # WavPack
    '.ogg',   # Ogg Vorbis
    '.opus'   # Opus Audio Codec
)
```

### Format Characteristics

| Format | Compression | Quality | Browser Support | Streaming Method | Typical Use Case |
|--------|-------------|---------|-----------------|------------------|------------------|
| MP3    | Lossy       | Good    | Universal       | Direct           | General purpose  |
| FLAC   | Lossless    | Perfect | Modern browsers | Direct           | Archival         |
| WAV    | None        | Perfect | Universal       | Direct           | Production       |
| M4A    | Lossy       | Good    | Good            | Direct           | Apple ecosystem  |
| WMA    | Lossy       | Good    | None*           | Not supported    | Windows legacy   |
| WV     | Lossless    | Perfect | None*           | Transcoded†      | Audiophile       |
| OGG    | Lossy       | Good    | Good            | Direct           | Open source      |
| OPUS   | Lossy       | Excellent | Modern       | Direct           | Low bitrate      |

* WMA and WV formats are not natively supported by browsers
† WV files are transcoded to WAV format on-the-fly using wvunpack

## MIME Type Management

### MIME Type Mapping (`config.py`)

```python
MIME_TYPES = {
    '.mp3': 'audio/mpeg',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.wma': 'audio/x-ms-wma',
    '.wv': 'audio/x-wavpack',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/opus'
}
```

### MIME Type Resolution (`app.py:124-126`)

```python
# Get MIME type
ext = os.path.splitext(file_path.lower())[1]
mimetype = MIME_TYPES.get(ext, 'audio/mpeg')
```

The system:
1. Extracts file extension in lowercase
2. Looks up corresponding MIME type
3. Falls back to `audio/mpeg` for unknown types

## Security Implementation

### Path Validation (`app.py:111`)

```python
file_path = validate_path(os.path.join(MUSIC_DIR, filepath))
```

The `validate_path` function (defined elsewhere) ensures:
1. **No Directory Traversal**: Blocks `../` patterns
2. **Absolute Path Resolution**: Converts to canonical path
3. **Boundary Checking**: Ensures path stays within MUSIC_DIR
4. **Exception on Violation**: Raises ValueError for invalid paths

### Security Measures

1. **Path Sanitization**:
   - Resolves symbolic links
   - Normalizes path separators
   - Removes redundant components

2. **Access Control**:
   - Only serves files within MUSIC_DIR
   - No access to system files
   - No execution of files

3. **Error Handling** (`app.py:169-170`):
   ```python
   except ValueError:
       return jsonify({'error': 'Invalid path'}), 403
   ```

## Streaming Algorithm

### Generator Function (`app.py:140-152`)

```python
def generate():
    with open(file_path, 'rb') as f:
        f.seek(byte_start)
        remaining = byte_end - byte_start + 1
        chunk_size = 8192
        
        while remaining > 0:
            to_read = min(chunk_size, remaining)
            chunk = f.read(to_read)
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk
```

### Algorithm Breakdown

1. **File Opening**: Binary mode for audio data
2. **Seek Operation**: Jump to requested byte position
3. **Chunk Reading**: 8KB chunks for optimal performance
4. **Boundary Respect**: Never read beyond requested range
5. **Yield Pattern**: Memory-efficient generator

### Chunk Size Selection

The 8KB (8192 bytes) chunk size balances:
- **Memory Usage**: Small enough to prevent high memory consumption
- **I/O Efficiency**: Large enough to minimize system calls
- **Network Packets**: Fits well within typical MTU sizes
- **Responsiveness**: Quick initial data delivery

## Error Handling Strategy

### Multi-Level Error Handling

1. **File Not Found** (`app.py:113-114`):
   ```python
   if not os.path.exists(file_path):
       return jsonify({'error': 'File not found'}), 404
   ```

2. **Invalid Path** (`app.py:169-170`):
   ```python
   except ValueError:
       return jsonify({'error': 'Invalid path'}), 403
   ```

3. **General Exceptions** (`app.py:171-173`):
   ```python
   except Exception as e:
       logger.error(f"Error streaming file {filepath}: {e}")
       return jsonify({'error': 'Server error'}), 500
   ```

### Error Response Format

All errors return JSON with consistent structure:
```json
{
    "error": "Human-readable error message"
}
```

## Performance Optimizations

### 1. Generator-Based Streaming

The use of Python generators provides:
- **Constant Memory Usage**: Independent of file size
- **Lazy Evaluation**: Data read only when needed
- **Backpressure Handling**: Client controls flow rate

### 2. Efficient File Operations

```python
with open(file_path, 'rb') as f:
    f.seek(byte_start)  # O(1) operation for seeking
```

- **Binary Mode**: No text encoding overhead
- **Context Manager**: Automatic file closure
- **Direct Seek**: Avoids reading unnecessary data

### 3. Smart Buffering

The 8KB chunk size aligns with:
- Python's default buffer size
- Typical file system block sizes
- Network packet sizes

### 4. Conditional Response

For non-range requests (`app.py:166-167`):
```python
return send_file(file_path, mimetype=mimetype, as_attachment=False)
```

Flask's `send_file`:
- Uses platform-specific optimizations (sendfile on Linux)
- Handles caching headers automatically
- Manages memory efficiently for large files

## Content Delivery Headers

### Range Request Headers (`app.py:158-163`)

```python
headers={
    'Content-Range': f'bytes {byte_start}-{byte_end}/{file_size}',
    'Accept-Ranges': 'bytes',
    'Content-Length': str(byte_end - byte_start + 1),
    'Content-Disposition': f'inline; filename="{safe_filename}"; filename*=UTF-8\'\'{utf8_filename}'
}
```

### Header Purposes

1. **Content-Range**: Indicates which bytes are being sent
2. **Accept-Ranges**: Tells client that range requests are supported
3. **Content-Length**: Exact size of this response
4. **Content-Disposition**: Suggests inline playback with proper filename

### Filename Encoding (`app.py:119-122`)

```python
basename = os.path.basename(file_path)
safe_filename = basename.encode('ascii', 'ignore').decode('ascii')
utf8_filename = urllib.parse.quote(basename, safe='')
```

Handles international characters in filenames:
- ASCII fallback for legacy clients
- UTF-8 encoded version for modern clients
- RFC 5987 compliant format

## Integration with Flask

### Response Object Construction

For range requests (`app.py:154-164`):
```python
return Response(
    generate(),
    status=206,
    mimetype=mimetype,
    headers={...}
)
```

### Flask Integration Points

1. **Route Decorator**: Leverages Flask's URL routing
2. **Path Parameter**: Uses Flask's path converter
3. **Request Object**: Accesses headers via `request.headers`
4. **Response Helpers**: Uses both Response and send_file
5. **Error Handling**: Returns JSON via jsonify

### WSGI Compliance

The streaming generator ensures:
- Proper WSGI iteration protocol
- Automatic connection cleanup
- Client disconnect detection

## File System Operations

### File Access Pattern

1. **Path Construction** (`app.py:111`):
   ```python
   file_path = validate_path(os.path.join(MUSIC_DIR, filepath))
   ```

2. **Existence Check** (`app.py:113`):
   ```python
   if not os.path.exists(file_path)
   ```

3. **Size Detection** (`app.py:116`):
   ```python
   file_size = os.path.getsize(file_path)
   ```

4. **File Reading** (`app.py:141-142`):
   ```python
   with open(file_path, 'rb') as f:
       f.seek(byte_start)
   ```

### File System Considerations

- **Large File Support**: Handles multi-GB files efficiently
- **Network Shares**: Compatible with SMB/NFS mounts
- **File Locking**: Read-only access prevents conflicts
- **Concurrent Access**: Multiple clients can stream same file

## Logging and Monitoring

### Error Logging (`app.py:172`)

```python
logger.error(f"Error streaming file {filepath}: {e}")
```

### Logging Coverage

1. **Error Conditions**: All exceptions logged with context
2. **File Path**: Included for debugging
3. **Exception Details**: Full error information preserved
4. **Log Level**: ERROR for operational issues

### Monitoring Opportunities

The current implementation could be enhanced with:
- Access logs for streaming requests
- Bandwidth usage metrics
- Popular file tracking
- Performance timing data

## Code References

1. **Main Streaming Route**: Complete handler (`app.py:107-173`)
2. **Route Definition**: Flask endpoint declaration (`app.py:107-108`)
3. **Path Validation**: Security check (`app.py:111`)
4. **File Existence Check**: 404 handling (`app.py:113-114`)
5. **File Size Detection**: Range calculation (`app.py:116`)
6. **Range Header Access**: HTTP header parsing (`app.py:117`)
7. **Filename Encoding**: International support (`app.py:119-122`)
8. **MIME Type Resolution**: Format detection (`app.py:124-126`)
9. **Range Parsing**: Byte range extraction (`app.py:128-137`)
10. **Generator Function**: Streaming implementation (`app.py:140-152`)
11. **Seek Operation**: Efficient positioning (`app.py:142`)
12. **Chunk Reading**: Memory-efficient streaming (`app.py:144-152`)
13. **Range Response**: 206 status with headers (`app.py:154-164`)
14. **Full File Response**: Non-range fallback (`app.py:166-167`)
15. **Error Handling**: Comprehensive coverage (`app.py:169-173`)
16. **Audio Extensions**: Supported formats (`config.py:AUDIO_EXTENSIONS`)
17. **MIME Type Map**: Format associations (`config.py:MIME_TYPES`)

## WavPack Transcoding Implementation

### Transcoding Endpoint Details

The WavPack transcoding endpoint (`app.py:176-207`) provides real-time conversion of WavPack files to WAV format:

```python
@app.route('/stream/wav/<path:filepath>')
def stream_wav_transcoded(filepath):
    """Stream WavPack files as WAV for browser playback"""
    try:
        file_path = validate_path(os.path.join(MUSIC_DIR, filepath))
        
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
            
        # Only transcode .wv files
        if not file_path.lower().endswith('.wv'):
            return jsonify({'error': 'Not a WavPack file'}), 400
            
        # Use wvunpack to convert to WAV and stream
        process = subprocess.Popen(
            ['wvunpack', '-q', file_path, '-o', '-'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Stream the WAV output
        return Response(
            process.stdout,
            mimetype='audio/wav',
            headers={
                'Accept-Ranges': 'none',
                'Cache-Control': 'no-cache'
            }
        )
        
    except Exception as e:
        logger.error(f"Error transcoding WavPack file {filepath}: {e}")
        return jsonify({'error': str(e)}), 500
```

### Transcoding Process

1. **Validation**: Same security checks as standard streaming
2. **Format Verification**: Ensures file has `.wv` extension
3. **Process Spawning**: Uses `subprocess.Popen` to run `wvunpack`
4. **Command Arguments**:
   - `-q`: Quiet mode (no console output)
   - `-o -`: Output to stdout instead of file
5. **Streaming**: Pipes wvunpack output directly to HTTP response

### Performance Characteristics

- **No Temporary Files**: Direct pipe from wvunpack to response
- **Low Memory Usage**: Streaming prevents loading entire file
- **CPU Usage**: Minimal overhead from wvunpack decompression
- **Latency**: Slight initial delay for process startup

### Error Handling

1. **File Not Found**: Returns 404 if file doesn't exist
2. **Wrong Format**: Returns 400 if not a WavPack file
3. **Process Errors**: Caught and logged with 500 response

### Dependencies

- **wvunpack**: Provided by wavpack package in Alpine Linux
- **subprocess**: Python standard library for process management

## Technical Limitations and Improvements

### Current Limitations

1. **Single Range Only**:
   - No support for multiple byte ranges in one request
   - Cannot efficiently serve discontinuous segments
   - May impact advanced streaming clients

2. **No Caching Headers**:
   - Missing ETag generation
   - No Last-Modified headers
   - No Cache-Control directives
   - Prevents efficient client-side caching

3. **Limited Metadata**:
   - No duration information in headers
   - No bitrate information
   - No codec details
   - Frontend must discover these separately

4. **Basic Error Responses**:
   - Generic error messages
   - No retry hints
   - Limited debugging information

5. **No Bandwidth Management**:
   - No rate limiting
   - No adaptive streaming
   - No quality selection

6. **WMA Playback**:
   - Not supported in any browser
   - No transcoding solution implemented
   - UI shows disabled play buttons

7. **WavPack Limitations**:
   - No range request support for transcoded streams
   - Cannot seek within transcoded WavPack files
   - Entire file must be processed sequentially

### Recommended Improvements

1. **Enhanced Range Support**:
   ```python
   # Support multiple ranges
   def parse_range_header(range_header, file_size):
       ranges = []
       for range_spec in range_header.replace('bytes=', '').split(','):
           if '-' in range_spec:
               start, end = range_spec.split('-')
               # Handle various range formats
       return ranges
   ```

2. **Caching Implementation**:
   ```python
   # Add caching headers
   def add_cache_headers(response, file_path):
       stat = os.stat(file_path)
       response.headers['Last-Modified'] = formatdate(stat.st_mtime)
       response.headers['ETag'] = f'"{stat.st_mtime}-{stat.st_size}"'
       response.headers['Cache-Control'] = 'public, max-age=3600'
       return response
   ```

3. **Metadata Enrichment**:
   ```python
   # Add audio metadata headers
   from mutagen import File
   
   def add_audio_metadata(response, file_path):
       audio = File(file_path)
       if audio:
           response.headers['X-Audio-Duration'] = str(audio.info.length)
           response.headers['X-Audio-Bitrate'] = str(audio.info.bitrate)
       return response
   ```

4. **Bandwidth Control**:
   ```python
   # Rate-limited generator
   def rate_limited_generate(file_path, byte_start, byte_end, max_bps):
       chunk_size = 8192
       delay = chunk_size / max_bps
       
       with open(file_path, 'rb') as f:
           f.seek(byte_start)
           while True:
               chunk = f.read(chunk_size)
               if not chunk:
                   break
               yield chunk
               time.sleep(delay)
   ```

5. **Advanced Streaming Features**:
   - HLS/DASH manifest generation for adaptive streaming
   - Additional transcoding support (e.g., WMA to MP3)
   - Subtitle track delivery
   - Authentication/authorization integration
   - CDN-friendly headers

6. **WavPack Enhancements**:
   ```python
   # Add range support for transcoded streams
   def transcode_with_seek(file_path, start_byte, end_byte):
       # Use wvunpack with sample-based seeking
       sample_rate = get_sample_rate(file_path)
       start_sample = byte_to_sample(start_byte, sample_rate)
       
       process = subprocess.Popen([
           'wvunpack', '-q', file_path,
           '-s', str(start_sample),
           '-o', '-'
       ], stdout=subprocess.PIPE)
       
       return process.stdout
   ```

7. **WMA Transcoding**:
   ```python
   # Potential WMA transcoding endpoint
   @app.route('/stream/mp3/<path:filepath>')
   def stream_wma_transcoded(filepath):
       # Use ffmpeg to transcode WMA to MP3
       # Note: Would require adding ffmpeg to Docker image
       pass
   ```

6. **Monitoring Enhancement**:
   ```python
   # Add request tracking
   @app.before_request
   def log_streaming_request():
       if request.path.startswith('/stream/'):
           logger.info(f"Stream request: {request.path}, "
                      f"Range: {request.headers.get('Range', 'full')}")
   ```

The current implementation provides a solid foundation for audio streaming with excellent standards compliance and security. The addition of WavPack transcoding demonstrates the system's extensibility for format-specific requirements. The modular design allows for incremental enhancement based on specific needs while maintaining backward compatibility.

### Format Support Summary

- **Direct Streaming**: MP3, FLAC, WAV, M4A, OGG, OPUS
- **Transcoded Streaming**: WV (WavPack to WAV)
- **Not Supported**: WMA (playback disabled in UI)