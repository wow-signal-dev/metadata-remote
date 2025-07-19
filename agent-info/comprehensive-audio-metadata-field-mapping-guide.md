# Comprehensive Audio Metadata Field Mapping Guide

This guide provides complete mappings between semantic metadata field names and technical metadata identifiers across WAV, WavPack, OGG Vorbis, OPUS, M4A, MP3, WMA, and FLAC formats, including detailed Mutagen Python library implementation.

## Format-Specific Metadata Mappings

### MP3 Format (ID3v2 Tags)

MP3 files use ID3v2 tags with 4-character frame identifiers. The most widely supported version is ID3v2.3, though v2.4 offers enhanced features.

| Semantic Field | ID3v2.3 Frame ID | ID3v2.4 Frame ID | Notes |
|----------------|------------------|------------------|-------|
| **Title** | TIT2 | TIT2 | Song/content title |
| **Artist** | TPE1 | TPE1 | Lead performer(s) |
| **Album** | TALB | TALB | Album/collection name |
| **Album Artist** | TPE2 | TPE2 | Band/orchestra |
| **Year** | TYER | TDRC | v2.4 uses ISO 8601 format |
| **Date** | TDAT+TIME | TDRC | Consolidated in v2.4 |
| **Genre** | TCON | TCON | Numeric or text |
| **Track Number** | TRCK | TRCK | Format: "n/total" |
| **Disc Number** | TPOS | TPOS | Part of set |
| **Composer** | TCOM | TCOM | Composer/songwriter |
| **Comment** | COMM | COMM | Includes language code |
| **Copyright** | TCOP | TCOP | Copyright message |
| **Encoder** | TSSE | TSSE | Software/hardware |
| **BPM** | TBPM | TBPM | Beats per minute |
| **Cover Art** | APIC | APIC | Binary picture data |

**Character Encoding**: ID3v2.3 supports ISO-8859-1 and UTF-16; ID3v2.4 adds UTF-8 and UTF-16BE.

### FLAC, OGG Vorbis, and OPUS (Vorbis Comments)

These formats share the Vorbis Comment specification with case-insensitive field names stored as UTF-8 key-value pairs.

| Semantic Field | Vorbis Comment Field | Notes |
|----------------|---------------------|-------|
| **Title** | TITLE | Track title |
| **Artist** | ARTIST | Multiple values supported |
| **Album** | ALBUM | Album name |
| **Album Artist** | ALBUMARTIST | Album-level artist |
| **Date** | DATE | ISO 8601 format |
| **Genre** | GENRE | Multiple values supported |
| **Track Number** | TRACKNUMBER | May include total |
| **Disc Number** | DISCNUMBER | Multi-disc sets |
| **Composer** | COMPOSER | Music composer |
| **Comment** | COMMENT | Free-form text |
| **Copyright** | COPYRIGHT | Copyright info |
| **Organization** | ORGANIZATION | Record label |
| **Encoder** | ENCODER | Encoding software |
| **Cover Art** | METADATA_BLOCK_PICTURE | Base64 encoded (OGG/OPUS) |

**FLAC-Specific**: Cover art stored in separate PICTURE metadata blocks rather than Vorbis Comments.

### M4A/MP4 Format (iTunes Atoms)

M4A files use 4-character atom codes, many beginning with the © symbol, stored in the `moov.udta.meta.ilst` hierarchy.

| Semantic Field | iTunes Atom | Data Type | Notes |
|----------------|-------------|-----------|-------|
| **Title** | ©nam | String | Track title |
| **Artist** | ©ART | String | Primary artist |
| **Album** | ©alb | String | Album name |
| **Album Artist** | aART | String | Album-level artist |
| **Year/Date** | ©day | String | YYYY or YYYY-MM-DD |
| **Genre** | ©gen | String | Genre classification |
| **Track Number** | trkn | Two int | 16-bit current/total |
| **Disc Number** | disk | Two int | 16-bit current/total |
| **Composer** | ©wrt | String | Composer/songwriter |
| **Comment** | ©cmt | String | Comments |
| **Grouping** | ©grp | String | Content grouping |
| **BPM** | tmpo | uint8 | Beats per minute |
| **Compilation** | cpil | Boolean | Compilation flag |
| **Cover Art** | covr | Binary | JPEG or PNG data |

**Custom Fields**: Use freeform atoms with format `----:com.apple.iTunes:FIELDNAME`.

### WAV Format (Multiple Methods)

WAV files support three metadata storage methods:

#### RIFF INFO Chunks
| Semantic Field | INFO Chunk ID | Notes |
|----------------|--------------|-------|
| **Title** | INAM | Track title |
| **Artist** | IART | Artist/performer |
| **Album** | IPRD | Product/album name |
| **Date** | ICRD | Creation date |
| **Genre** | IGNR | Genre |
| **Track Number** | ITRK | Track number |
| **Comment** | ICMT | Comments |
| **Copyright** | ICOP | Copyright |
| **Software** | ISFT | Encoding software |

**Limitations**: ASCII-only encoding, limited player support.

#### ID3v2 in WAV
Some WAV files include ID3v2 tags using the same frame IDs as MP3 files.

#### BWF Extension
Professional broadcast format adds `bext` chunk with timestamp, UMID, and loudness metadata.

### WMA/ASF Format

Windows Media files use string constants prefixed with `g_wszWM`:

| Semantic Field | ASF Attribute | Notes |
|----------------|--------------|-------|
| **Title** | g_wszWMTitle | Song title |
| **Artist** | g_wszWMAuthor | Artist/author |
| **Album** | g_wszWMAlbumTitle | Album name |
| **Album Artist** | g_wszWMAlbumArtist | Album artist |
| **Year** | g_wszWMYear | Release year |
| **Genre** | g_wszWMGenre | Genre |
| **Track Number** | g_wszWMTrackNumber | Track number |
| **Composer** | g_wszWMComposer | Composer |
| **Comment** | g_wszWMDescription | Description |
| **Copyright** | g_wszWMCopyright | Copyright |

### WavPack Format (APEv2 Tags)

WavPack uses APEv2 tags with case-sensitive keys:

| Semantic Field | APEv2 Field | Notes |
|----------------|------------|-------|
| **Title** | Title | Case sensitive |
| **Artist** | Artist | Multiple values via null |
| **Album** | Album | Album name |
| **Album Artist** | Album Artist | Space included |
| **Year** | Year | Release year |
| **Genre** | Genre | Multiple values supported |
| **Track Number** | Track | Track number |
| **Disc Number** | Disc | Disc number |
| **Composer** | Composer | Composer |
| **Comment** | Comment | Comments |
| **Cover Art** | Cover Art (Front) | Binary data |

**Key Features**: UTF-8 encoding, binary data support, 1MB default size limit.

## Mutagen Python Library Implementation

### Module Organization

Mutagen provides format-specific modules with both native and "Easy" interfaces:

```python
# Format-specific imports
from mutagen.mp3 import MP3
from mutagen.flac import FLAC
from mutagen.oggvorbis import OggVorbis
from mutagen.oggopus import OggOpus
from mutagen.mp4 import MP4
from mutagen.asf import ASF
from mutagen.wave import WAVE
from mutagen.wavpack import WavPack

# Easy interfaces for unified access
from mutagen.easyid3 import EasyID3
from mutagen.easymp4 import EasyMP4
```

### Unified Field Access with Easy Interfaces

Easy interfaces provide consistent field names across formats:

```python
# Auto-detect format and use easy mode
import mutagen
audio = mutagen.File("song.mp3", easy=True)

# Common fields across all formats
audio["title"] = "Song Title"
audio["artist"] = ["Main Artist", "Featured Artist"]
audio["album"] = "Album Name"
audio["date"] = "2024"
audio["tracknumber"] = "5/12"
audio.save()
```

### Native Format Access

#### MP3 with ID3v2
```python
from mutagen.id3 import ID3, TIT2, TPE1, TALB, TDRC

audio = ID3("song.mp3")
audio.add(TIT2(encoding=3, text="Song Title"))
audio.add(TPE1(encoding=3, text=["Artist"]))
audio.add(TALB(encoding=3, text="Album"))
audio.add(TDRC(encoding=3, text="2024"))
audio.save()
```

#### FLAC with Vorbis Comments
```python
from mutagen.flac import FLAC

audio = FLAC("song.flac")
audio["TITLE"] = "Song Title"
audio["ARTIST"] = ["Artist 1", "Artist 2"]
audio["ALBUM"] = "Album Name"
audio["DATE"] = "2024"
audio.save()
```

#### M4A with iTunes Atoms
```python
from mutagen.mp4 import MP4

audio = MP4("song.m4a")
audio["©nam"] = "Song Title"
audio["©ART"] = "Artist"
audio["©alb"] = "Album"
audio["©day"] = "2024"
audio["trkn"] = [(5, 12)]  # Track 5 of 12
audio.save()
```

### Cross-Format Metadata Handling

```python
def copy_metadata(source_file, target_file):
    """Copy metadata between different audio formats"""
    source = mutagen.File(source_file, easy=True)
    target = mutagen.File(target_file, easy=True)
    
    # Copy common fields
    for key in ["title", "artist", "album", "date", "genre", 
                "tracknumber", "albumartist", "composer"]:
        if key in source:
            target[key] = source[key]
    
    target.save()
```

### Mutagen-Specific Behaviors

#### Multiple Values
All formats support multiple values per field:
```python
audio["artist"] = ["Artist 1", "Artist 2"]
# Retrieved as list: ["Artist 1", "Artist 2"]
```

#### Character Encoding
- Automatic UTF-8 handling for all text
- Format-specific encoding conversions handled internally
- Unicode support across all formats

#### Case Sensitivity
- Easy interfaces: Case-insensitive field names
- Native interfaces: Format-specific rules apply
- Vorbis Comments: Case-insensitive but stored as uppercase
- APEv2: Case-sensitive keys

### Custom Field Registration

```python
# Register custom EasyID3 field
from mutagen.easyid3 import EasyID3
EasyID3.RegisterTextKey("custom_field", "TXXX:CustomField")

# Register custom EasyMP4 field
from mutagen.easymp4 import EasyMP4Tags
EasyMP4Tags.RegisterFreeformKey("custom_field", "Custom Field")
```

## Technical Format Details

### ID3v2 Frame Structure
- Header: 10 bytes ("ID3" + version + flags + size)
- Frames: 4-byte ID + size + flags + data
- Maximum frame size: 16MB (ID3v2.3/2.4)
- Total tag size limit: 256MB

### Vorbis Comment Structure
- Vendor string + comment count
- Each comment: length + "FIELD=value"
- UTF-8 encoded throughout
- No size limitations in specification

### MP4 Atom Structure
- Hierarchical: moov → udta → meta → ilst
- Each atom: 4-byte size + 4-byte type + data
- Special handling for 64-bit sizes
- Binary data supported natively

### APEv2 Structure
- Items: size + flags + key + null + value
- Footer: 32 bytes with "APETAGEX" signature
- UTF-8 values, ASCII keys
- Binary data type support

## Best Practices

### General Guidelines
1. Use Easy interfaces for cross-format compatibility
2. Preserve original metadata when converting formats
3. Validate character encoding, especially for legacy files
4. Handle multiple values appropriately for each format
5. Test with various players for compatibility

### Format Selection
- **FLAC**: Best for lossless archival with rich metadata
- **MP3**: Maximum compatibility, use ID3v2.3 for older devices
- **M4A**: Ideal for Apple ecosystem integration
- **OGG/OPUS**: Open-source preference with full UTF-8 support

### Performance Considerations
- Metadata operations don't process audio data
- Batch operations benefit from format auto-detection caching
- Large cover art can impact metadata processing speed
- Consider metadata size limits for streaming applications

This comprehensive guide provides the technical foundation for implementing robust audio metadata handling across all major formats using the Mutagen library or direct format manipulation.
