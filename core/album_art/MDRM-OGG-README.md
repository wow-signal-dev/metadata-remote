# OGG Album Art Implementation Guide - Metadata Remote

## Table of Contents
1. [Overview](#overview)
2. [Understanding OGG Album Art](#understanding-ogg-album-art)
3. [METADATA_BLOCK_PICTURE Format](#metadata_block_picture-format)
4. [Implementation Architecture](#implementation-architecture)
5. [Reading Album Art](#reading-album-art)
6. [Writing Album Art](#writing-album-art)
7. [Codec Detection](#codec-detection)
8. [Binary Data Handling](#binary-data-handling)
9. [FFmpeg Integration](#ffmpeg-integration)
10. [Error Handling and Edge Cases](#error-handling-and-edge-cases)
11. [Testing and Debugging](#testing-and-debugging)

## Overview

The OGG album art implementation in Metadata Remote provides a complete solution for reading and writing album artwork in OGG containers (Vorbis and Opus codecs) using only FFmpeg/FFprobe and Python 3.11's standard library. This guide details the technical implementation of the `core/album_art/ogg.py` module.

### Key Challenges Addressed
- OGG files use a special `METADATA_BLOCK_PICTURE` format (borrowed from FLAC)
- The picture data is stored as base64-encoded binary data
- Different handling required for Vorbis vs Opus codecs
- Must parse complex binary structures without external libraries
- FFmpeg command construction varies by codec

## Understanding OGG Album Art

### The OGG Container
OGG is a container format that can hold various codecs:
- **Vorbis**: The original OGG audio codec
- **Opus**: A newer, more efficient codec

### Album Art Storage Methods
1. **METADATA_BLOCK_PICTURE**: The standard method (what we implement)
2. **Legacy COVERART**: Deprecated, simple base64 image
3. **Video Stream**: Some old files use MJPEG video streams

### Key Differences: Vorbis vs Opus
```python
# Vorbis: Metadata at format level
ffmpeg -i input.ogg -metadata METADATA_BLOCK_PICTURE=<data> output.ogg

# Opus: Metadata at stream level
ffmpeg -i input.opus -metadata:s:a:0 METADATA_BLOCK_PICTURE=<data> output.opus
```

## METADATA_BLOCK_PICTURE Format

The METADATA_BLOCK_PICTURE format is a binary structure originally from FLAC, adopted by OGG:

### Binary Structure
```
┌─────────────────────────────────────┐
│ Picture Type        (4 bytes, BE)   │  0 = Other, 3 = Front Cover, etc.
├─────────────────────────────────────┤
│ MIME Type Length    (4 bytes, BE)   │  Length of MIME string
├─────────────────────────────────────┤
│ MIME Type           (variable)      │  e.g., "image/jpeg"
├─────────────────────────────────────┤
│ Description Length  (4 bytes, BE)   │  Length of description
├─────────────────────────────────────┤
│ Description         (variable)      │  UTF-8 text description
├─────────────────────────────────────┤
│ Width               (4 bytes, BE)   │  Image width in pixels
├─────────────────────────────────────┤
│ Height              (4 bytes, BE)   │  Image height in pixels
├─────────────────────────────────────┤
│ Color Depth         (4 bytes, BE)   │  Bits per pixel
├─────────────────────────────────────┤
│ Colors Used         (4 bytes, BE)   │  For indexed images
├─────────────────────────────────────┤
│ Picture Data Length (4 bytes, BE)   │  Length of image data
├─────────────────────────────────────┤
│ Picture Data        (variable)      │  Raw image bytes
└─────────────────────────────────────┘

BE = Big Endian
```

### Picture Types
```python
PICTURE_TYPES = {
    0: "Other",
    1: "32x32 pixels file icon",
    2: "Other file icon",
    3: "Cover (front)",
    4: "Cover (back)",
    5: "Leaflet page",
    6: "Media",
    7: "Lead artist/lead performer/soloist",
    8: "Artist/performer",
    9: "Conductor",
    10: "Band/Orchestra",
    11: "Composer",
    12: "Lyricist/text writer",
    13: "Recording Location",
    14: "During recording",
    15: "During performance",
    16: "Movie/video screen capture",
    17: "A bright coloured fish",
    18: "Illustration",
    19: "Band/artist logotype",
    20: "Publisher/Studio logotype"
}
```

## Implementation Architecture

### Class Structure
```python
class OggAlbumArtHandler:
    """Handles album art for OGG/Opus files using METADATA_BLOCK_PICTURE format"""
    
    def __init__(self):
        # Pre-compiled struct formats for performance
        self._struct_formats = {
            'uint32': struct.Struct('>I'),  # Big-endian unsigned int
        }
    
    # Main public methods
    def extract_album_art(self, filepath: str) -> Optional[str]
    def embed_album_art(self, filepath: str, art_data: str, remove_art: bool = False) -> bool
    def detect_codec(self, filepath: str) -> str
    
    # Internal methods
    def _parse_picture_block(self, data: bytes) -> Tuple[int, str, bytes]
    def _create_picture_block(self, image_data: bytes, mime_type: str, ...) -> bytes
    def _detect_mime_type(self, image_data: bytes) -> str
```

## Reading Album Art

### Step 1: Extract Metadata with FFprobe
```python
def extract_album_art(self, filepath: str) -> Optional[str]:
    """Extract album art from OGG/Opus file"""
    try:
        probe_data = run_ffprobe(filepath)
        
        # Check both format and stream levels
        # First check format level (common for Vorbis)
        format_tags = probe_data.get('format', {}).get('tags', {})
        for key, value in format_tags.items():
            if key.upper() == 'METADATA_BLOCK_PICTURE':
                # Found at format level
                binary_data = base64.b64decode(value)
                pic_type, mime_type, pic_data = self._parse_picture_block(binary_data)
                return base64.b64encode(pic_data).decode('utf-8')
        
        # Then check stream level (common for Opus)
        for stream in probe_data.get('streams', []):
            if stream.get('codec_type') == 'audio':
                stream_tags = stream.get('tags', {})
                for key, value in stream_tags.items():
                    if key.upper() == 'METADATA_BLOCK_PICTURE':
                        # Found at stream level
                        binary_data = base64.b64decode(value)
                        pic_type, mime_type, pic_data = self._parse_picture_block(binary_data)
                        return base64.b64encode(pic_data).decode('utf-8')
```

### Step 2: Parse Binary Picture Block
```python
def _parse_picture_block(self, data: bytes) -> Tuple[int, str, bytes]:
    """Parse METADATA_BLOCK_PICTURE binary data"""
    if len(data) < 32:
        raise ValueError("Invalid picture block: too short")
    
    offset = 0
    
    # Picture type (4 bytes, big-endian)
    pic_type = self._struct_formats['uint32'].unpack_from(data, offset)[0]
    offset += 4
    
    # MIME type length (4 bytes, big-endian)
    mime_len = self._struct_formats['uint32'].unpack_from(data, offset)[0]
    offset += 4
    
    # MIME type string
    mime_end = offset + mime_len
    if mime_end > len(data):
        raise ValueError("Invalid picture block: MIME length exceeds data")
    
    mime_type = data[offset:mime_end].decode('utf-8', errors='replace')
    offset = mime_end
    
    # Description length (4 bytes, big-endian)
    desc_len = self._struct_formats['uint32'].unpack_from(data, offset)[0]
    offset += 4
    
    # Skip description
    offset += desc_len
    
    # Skip dimensions (4 x 4 bytes: width, height, color depth, colors used)
    offset += 16
    
    # Picture data length (4 bytes, big-endian)
    pic_len = self._struct_formats['uint32'].unpack_from(data, offset)[0]
    offset += 4
    
    # Picture data
    pic_end = offset + pic_len
    if pic_end > len(data):
        raise ValueError("Invalid picture block: picture length exceeds data")
    
    pic_data = data[offset:pic_end]
    
    return pic_type, mime_type, pic_data
```

### Practical Example: Reading Album Art
```python
# Initialize handler
handler = OggAlbumArtHandler()

# Extract album art
art_data = handler.extract_album_art('/music/song.ogg')
if art_data:
    # art_data is base64-encoded image
    print(f"Found album art: {len(art_data)} bytes (base64)")
    
    # To save to file:
    import base64
    with open('cover.jpg', 'wb') as f:
        f.write(base64.b64decode(art_data))
```

## Writing Album Art

### Step 1: Create Picture Block
```python
def _create_picture_block(self, image_data: bytes, mime_type: str, 
                         pic_type: int = 3, description: str = "") -> bytes:
    """Create METADATA_BLOCK_PICTURE binary data"""
    # Encode strings
    mime_bytes = mime_type.encode('utf-8')
    desc_bytes = description.encode('utf-8')
    
    # Calculate total size
    total_size = (
        4 +  # picture type
        4 + len(mime_bytes) +  # MIME type length + data
        4 + len(desc_bytes) +  # description length + data
        16 +  # dimensions (4 x 4 bytes)
        4 + len(image_data)  # picture data length + data
    )
    
    # Create buffer
    data = bytearray(total_size)
    offset = 0
    
    # Picture type (4 bytes, big-endian)
    self._struct_formats['uint32'].pack_into(data, offset, pic_type)
    offset += 4
    
    # MIME type length and data
    self._struct_formats['uint32'].pack_into(data, offset, len(mime_bytes))
    offset += 4
    data[offset:offset + len(mime_bytes)] = mime_bytes
    offset += len(mime_bytes)
    
    # Description length and data
    self._struct_formats['uint32'].pack_into(data, offset, len(desc_bytes))
    offset += 4
    data[offset:offset + len(desc_bytes)] = desc_bytes
    offset += len(desc_bytes)
    
    # Dimensions (width, height, color depth, colors used)
    # Use 0 for all as we don't have this info
    for _ in range(4):
        self._struct_formats['uint32'].pack_into(data, offset, 0)
        offset += 4
    
    # Picture data length and data
    self._struct_formats['uint32'].pack_into(data, offset, len(image_data))
    offset += 4
    data[offset:offset + len(image_data)] = image_data
    
    return bytes(data)
```

### Step 2: Embed with FFmpeg
```python
def embed_album_art(self, filepath: str, art_data: str, remove_art: bool = False) -> bool:
    """Embed or remove album art in OGG/Opus file"""
    try:
        # Detect codec
        codec = self.detect_codec(filepath)
        
        # Decode image data
        if ',' in art_data:
            # Remove data URI prefix if present
            image_data = base64.b64decode(art_data.split(',')[1])
        else:
            image_data = base64.b64decode(art_data)
        
        # Detect MIME type from image data
        mime_type = self._detect_mime_type(image_data)
        
        # Create METADATA_BLOCK_PICTURE
        picture_block = self._create_picture_block(image_data, mime_type)
        picture_b64 = base64.b64encode(picture_block).decode('ascii')
        
        # Create temp file
        output_format, _, _ = get_file_format(filepath)
        ext = os.path.splitext(filepath)[1]
        fd, temp_file = tempfile.mkstemp(suffix=ext, dir=os.path.dirname(filepath))
        os.close(fd)
        
        # Build ffmpeg command
        cmd = [
            'ffmpeg', '-i', filepath, '-y',
            '-c', 'copy',  # No re-encoding
            '-map', '0',   # Copy all streams
        ]
        
        # Add metadata based on codec
        if codec == 'opus':
            cmd.extend(['-metadata:s:a:0', f'METADATA_BLOCK_PICTURE={picture_b64}'])
        else:
            cmd.extend(['-metadata', f'METADATA_BLOCK_PICTURE={picture_b64}'])
        
        cmd.extend(['-f', output_format, temp_file])
        
        # Execute
        result = subprocess.run(cmd, capture_output=True, timeout=30)
        
        if result.returncode == 0:
            # Replace original file
            os.replace(temp_file, filepath)
            return True
```

## Codec Detection

### Detecting Vorbis vs Opus
```python
def detect_codec(self, filepath: str) -> str:
    """Detect whether OGG file uses Vorbis or Opus codec"""
    try:
        probe_data = run_ffprobe(filepath)
        streams = probe_data.get('streams', [])
        
        for stream in streams:
            if stream.get('codec_type') == 'audio':
                codec_name = stream.get('codec_name', '').lower()
                if codec_name in ['vorbis', 'opus']:
                    return codec_name
        
        # Default to vorbis if not detected
        return 'vorbis'
    except:
        return 'vorbis'
```

### Why Codec Detection Matters
```bash
# Vorbis: Metadata at format level
ffmpeg -i input.ogg -metadata METADATA_BLOCK_PICTURE=... output.ogg

# Opus: Metadata at stream level (audio stream 0)
ffmpeg -i input.opus -metadata:s:a:0 METADATA_BLOCK_PICTURE=... output.opus
```

## Binary Data Handling

### Using Python's struct Module
```python
import struct

# Create a reusable struct for big-endian unsigned int
uint32_be = struct.Struct('>I')

# Pack a value
packed = uint32_be.pack(12345)  # Returns 4 bytes

# Unpack from buffer at offset
value = uint32_be.unpack_from(buffer, offset)[0]
```

### MIME Type Detection
```python
def _detect_mime_type(self, image_data: bytes) -> str:
    """Detect MIME type from image data magic bytes"""
    # Check magic bytes
    if image_data[:2] == b'\xff\xd8':
        return 'image/jpeg'
    elif image_data[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    elif image_data[:4] == b'GIF8':
        return 'image/gif'
    elif image_data[:4] == b'RIFF' and image_data[8:12] == b'WEBP':
        return 'image/webp'
    else:
        # Default to JPEG
        return 'image/jpeg'
```

## FFmpeg Integration

### Complete FFmpeg Command Examples

#### Embedding Album Art
```bash
# For Vorbis
ffmpeg -i input.ogg -y \
  -c copy \
  -map 0 \
  -metadata METADATA_BLOCK_PICTURE="<base64-encoded-picture-block>" \
  -f ogg output.ogg

# For Opus
ffmpeg -i input.opus -y \
  -c copy \
  -map 0 \
  -metadata:s:a:0 METADATA_BLOCK_PICTURE="<base64-encoded-picture-block>" \
  -f ogg output.opus
```

#### Removing Album Art
```bash
# For Vorbis
ffmpeg -i input.ogg -y \
  -c copy \
  -map 0 \
  -metadata METADATA_BLOCK_PICTURE= \
  -f ogg output.ogg

# For Opus
ffmpeg -i input.opus -y \
  -c copy \
  -map 0 \
  -metadata:s:a:0 METADATA_BLOCK_PICTURE= \
  -f ogg output.opus
```

### Key FFmpeg Parameters
- `-c copy`: Copy streams without re-encoding
- `-map 0`: Include all streams from input
- `-metadata:s:a:0`: Apply metadata to first audio stream (Opus)
- `-metadata`: Apply metadata at format level (Vorbis)
- `-f ogg`: Force OGG output format

## Error Handling and Edge Cases

### Common Issues and Solutions

#### 1. Corrupted METADATA_BLOCK_PICTURE
```python
try:
    binary_data = base64.b64decode(value)
    pic_type, mime_type, pic_data = self._parse_picture_block(binary_data)
except Exception as e:
    logger.warning(f"Failed to parse METADATA_BLOCK_PICTURE: {e}")
    # Try alternative extraction methods
```

#### 2. Legacy COVERART Field
Some old OGG files use simple COVERART field:
```python
# Check for legacy COVERART field
if 'COVERART' in tags:
    try:
        # COVERART is just base64-encoded image
        return tags['COVERART']
    except:
        pass
```

#### 3. Multiple Picture Blocks
The implementation handles only the first picture found. To support multiple:
```python
pictures = []
for key, value in tags.items():
    if key.upper().startswith('METADATA_BLOCK_PICTURE'):
        # Could be METADATA_BLOCK_PICTURE_0, _1, etc.
        pictures.append(parse_picture(value))
```

#### 4. Large Image Files
```python
# Add size validation
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
if len(image_data) > MAX_IMAGE_SIZE:
    raise ValueError("Image too large")
```

## Testing and Debugging

### Creating Test Files

#### 1. Create OGG Vorbis with Album Art
```bash
# Start with any audio file
ffmpeg -i input.mp3 -c:a libvorbis -q:a 4 test_vorbis.ogg

# Add album art using our tool
python -c "
from core.album_art.ogg import OggAlbumArtHandler
handler = OggAlbumArtHandler()
with open('cover.jpg', 'rb') as f:
    art_data = base64.b64encode(f.read()).decode()
handler.embed_album_art('test_vorbis.ogg', art_data)
"
```

#### 2. Create Opus with Album Art
```bash
# Create Opus file
ffmpeg -i input.mp3 -c:a libopus -b:a 128k test_opus.opus

# Add album art
python -c "
from core.album_art.ogg import OggAlbumArtHandler
handler = OggAlbumArtHandler()
with open('cover.jpg', 'rb') as f:
    art_data = base64.b64encode(f.read()).decode()
handler.embed_album_art('test_opus.opus', art_data)
"
```

### Debugging Commands

#### Inspect Metadata Structure
```bash
# See all metadata
ffprobe -v quiet -print_format json -show_format -show_streams file.ogg

# Extract just METADATA_BLOCK_PICTURE
ffprobe -v quiet -show_entries format_tags=METADATA_BLOCK_PICTURE file.ogg

# For Opus, check stream tags
ffprobe -v quiet -show_entries stream_tags=METADATA_BLOCK_PICTURE file.opus
```

#### Decode Picture Block Manually
```python
import base64
import struct

# Get the METADATA_BLOCK_PICTURE value from ffprobe
mb_picture = "..."  # The base64 string

# Decode
data = base64.b64decode(mb_picture)

# Read picture type
pic_type = struct.unpack('>I', data[0:4])[0]
print(f"Picture type: {pic_type}")

# Read MIME length and type
mime_len = struct.unpack('>I', data[4:8])[0]
mime_type = data[8:8+mime_len].decode('utf-8')
print(f"MIME type: {mime_type}")

# Continue parsing...
```

### Unit Testing Example
```python
import unittest
import tempfile
import shutil

class TestOggAlbumArt(unittest.TestCase):
    def setUp(self):
        self.handler = OggAlbumArtHandler()
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        shutil.rmtree(self.test_dir)
    
    def test_parse_picture_block(self):
        # Create a minimal valid picture block
        mime = b'image/jpeg'
        pic_data = b'\xff\xd8\xff\xe0...'  # JPEG header
        
        block = bytearray()
        block.extend(struct.pack('>I', 3))  # Type: Front cover
        block.extend(struct.pack('>I', len(mime)))
        block.extend(mime)
        block.extend(struct.pack('>I', 0))  # No description
        block.extend(struct.pack('>I', 0))  # Width
        block.extend(struct.pack('>I', 0))  # Height
        block.extend(struct.pack('>I', 0))  # Depth
        block.extend(struct.pack('>I', 0))  # Colors
        block.extend(struct.pack('>I', len(pic_data)))
        block.extend(pic_data)
        
        pic_type, mime_type, data = self.handler._parse_picture_block(bytes(block))
        self.assertEqual(pic_type, 3)
        self.assertEqual(mime_type, 'image/jpeg')
        self.assertEqual(data, pic_data)
```

## Best Practices

### 1. Always Preserve Original Metadata
```python
# When embedding new art, preserve other metadata
cmd = [
    'ffmpeg', '-i', filepath, '-y',
    '-c', 'copy',
    '-map', '0',  # This preserves all existing streams
    '-metadata:s:a:0', f'METADATA_BLOCK_PICTURE={picture_b64}',
    # Don't use -map_metadata 0, it's implicit with -c copy
]
```

### 2. Handle Different OGG Extensions
```python
# Both .ogg and .opus files use OGG container
if filepath.lower().endswith(('.ogg', '.opus', '.oga')):
    return self.extract_album_art(filepath)
```

### 3. Validate Image Data
```python
def validate_image(self, image_data: bytes) -> bool:
    """Validate image before embedding"""
    # Check magic bytes
    if not self._detect_mime_type(image_data).startswith('image/'):
        return False
    
    # Check size
    if len(image_data) > 10 * 1024 * 1024:  # 10MB
        return False
    
    return True
```

### 4. Error Recovery
```python
# Always use temp files for safety
temp_file = None
try:
    # ... process file ...
    os.replace(temp_file, filepath)
except Exception as e:
    if temp_file and os.path.exists(temp_file):
        os.remove(temp_file)
    raise
```

## Conclusion

The OGG album art implementation in Metadata Remote demonstrates how to work with complex binary formats using only Python's standard library and FFmpeg. Key takeaways:

1. **METADATA_BLOCK_PICTURE** is a well-defined binary format that must be carefully parsed and constructed
2. **Codec detection** is crucial for proper FFmpeg command construction
3. **Binary data handling** with Python's struct module provides efficient parsing
4. **FFmpeg integration** requires different approaches for Vorbis vs Opus
5. **Error handling** must account for various edge cases and legacy formats

This implementation provides a robust, production-ready solution for OGG album art management without requiring any external Python dependencies beyond FFmpeg.
