# <img src="screenshots/mdrm-icon-for-light-bg.svg" alt="Alt Text" width="25" height="21"> Metadata Remote (mdrm)

Web-based audio metadata editor for headless servers.

Edit audio file metadata through a browser interface, designed for servers without desktop environments.

![Screenshot](screenshots/main-interface.png)

## Why?

Need to edit audio metadata on a headless server? Until now you had to either use complex CLI tools over SSH, download files to edit locally, or navigate heavyweight library managers like Beets that require database backends, import pipelines, and complex configuration. Metadata Remote _"just does one thing well"_ — spin up a Docker container, open a browser on any device, and edit your metadata. That's it.

## Quick Start

```bash
# Download docker-compose.yml
wget https://raw.githubusercontent.com/wow-signal-dev/metadata-remote/main/docker-compose.yml

# Edit your music directory path
nano docker-compose.yml  # Change /path/to/your/music:/music

# Start the service
docker compose up -d    # For Docker Compose V2 (newer installations)
# OR
docker-compose up -d    # For Docker Compose V1 (legacy installations)

# Access the web interface
open http://localhost:8338
```

Multi-architecture Docker images available for x86_64, ARM64, and ARMv7.

## Key Features

### Complete Metadata Control
- **Full field access** - View and edit ALL text metadata fields, organized into Standard and Extended categories
- **Field management** - Create new custom fields or delete existing ones, with full undo/redo support
- **Bulk operations** - Apply any changes to individual files or entire folders with one click
- **Long-form editor** - Automatically-appearing dedicated editor for lyrics and metadata content over 100 characters

### Intelligent Metadata Suggestions
- **Smart inference** - Analyzes filenames, folder patterns, and sibling files to suggest metadata
- **MusicBrainz integration** - Combines local context with online database queries
- **Confidence scoring** - Presents suggestions ranked by confidence percentage
- **Edge case handling** - Specialized strategies for classical music, compilations, and live recordings

### Powerful File Management
- **In-browser playback** - Stream files directly in the UI
- **Direct editing** - Rename files and folders without leaving the interface
- **Format support** - MP3, FLAC, OGG, OPUS, M4A, WMA, WAV, and WavPack
- **Album art control** - Upload, preview, delete, and bulk apply artwork with automatic corruption repair
- **Editing history** - Full undo/redo for up to 1000 operations, including bulk changes

### Keyboard-First Design
- **Complete keyboard control** - Every feature accessible without a mouse
- **Efficient navigation** - Arrow keys, Tab switching, Enter to play/edit, Escape to save
- **Smart shortcuts** - Double-tap Enter to rename folders, single Enter to edit fields

### Modern, Lightweight Architecture
- **Compact** - Just 81.6 MB container size using optimized Mutagen library
- **Production-ready** - Gunicorn server with reverse proxy support
- **Theme switching** - Toggle between light and dark modes
- **Multi-platform** - Native support for x86_64, ARM64, and ARMv7

### Additional Capabilities
Real-time search filtering • Resizable workspace panels • History tracking through renames • Extended metadata viewer • Automatic image repair • No external dependencies • Clean visual feedback • Responsive design

## Comparison with Other Tools

| | Metadata Remote | Mp3tag | MusicBrainz Picard | Beets |
|---------|----------------|--------|-------------------|-------|
| **Works on headless servers** | ✅ Yes | ❌ No | ❌ No | ✅ Yes |
| **Setup time** | ✅ < 1 minute | — | — | ❌ 30+ minutes |
| **Edit without importing** | ✅ Direct file editing | — | — | ❌ Must import to library |
| **Visual interface** | ✅ Full web UI | — | — | ⚠️ Terminal or basic web |
| **Bulk operations** | ✅ Click and edit | — | — | ⚠️ Command-line only |
| **Undo/safety** | ✅ Full history | — | — | ❌ No undo |
| **Learning curve** | ✅ None | — | — | ❌ Steep |
| **Smart suggestions** | ✅ Multi-source inference | — | — | ⚠️ MusicBrainz only |

## Usage Guide

### Navigation

**Essential Controls**
- **↑↓** Navigate files/folders
- **PgUp/PgDn** Jump by pages
- **Tab** Switch between panes
- **Enter** Expand folders / Play files / Edit fields • **Esc** Cancel edits / Close dialogs
- **Double Enter** Rename folders • **Shift+Delete** Delete metadata fields
- **Alt+T** Toggle theme • **?** Show help

**Editing Workflow**
1. Navigate to any metadata field and press Enter to edit
2. Make your changes, then Enter to save or Esc to cancel
3. Navigate to "File" or "Folder" buttons to save changes to one file or all files in the folder

All functionality is keyboard accessible - mouse optional. See the in-app help guide (?) for complete keyboard shortcuts.

### Smart Metadata Inference
When you click on an empty metadata field, Metadata Remote will:
1. Analyze the filename, folder structure, and nearby files
2. Query MusicBrainz if needed for additional data
3. Present suggestions with synthesized confidence scores
4. Just click any suggestion to apply it instantly

### Editing History
- **Bottom panel**: Click to expand the editing history view
- **Timeline view**: See all changes in chronological order
- **Undo/Redo**: Revert or reapply any change in any order (up to 1000 changes)
- **Filename tracking**: Undo/redo works even after renaming files - filename changes don't break metadata edit history
- **Batch tracking**: Even bulk operations can be undone
- **Clear history**: Remove all history when needed

### Bulk Operations
- **Apply to File**: Save a single field to the current file
- **Save all fields to file**: Save all metadata fields to a single file at once
- **Apply to Folder**: Apply any field value to all files in the folder
- **Album Art**: Upload once, apply to entire album folders
- **Smart workflow**: Navigate → Edit → Apply to folder

### Album Art Management
- **Upload**: Click "Upload Image" to add new art
- **Save Image**: Save only the album art without other metadata
- **Apply to Folder**: Apply the same art to all files in the folder
- **Delete**: Remove embedded album art
- **Auto-repair**: Corrupted art is automatically detected and fixed

## Installation

### Docker Compose (Recommended)

```yaml
version: '3.8'
services:
  metadata-remote:
    image: ghcr.io/wow-signal-dev/metadata-remote:latest
    container_name: metadata-remote
    ports:
      - "8338:8338"
    volumes:
      - /your/music/directory:/music
      # To add multiple music folders, mount them as well like this:
      # - /path/to/music1:/music/Library1
      # - /path/to/music2:/music/Library2
      # ... etc.
    environment:
      - PUID=1000
      - PGID=1000
    restart: unless-stopped
```

### Running the Container

```bash
# For newer Docker installations (Compose V2):
docker compose up -d

# For older installations (Compose V1):
docker-compose up -d
```

### Docker Run

```bash
docker run -d \
  --name metadata-remote \
  -p 8338:8338 \
  -v /your/music:/music \
  -e PUID=1000 \
  -e PGID=1000 \
  ghcr.io/wow-signal-dev/metadata-remote:latest
```

## Use Cases

### Headless Media Servers
- **Jellyfin/Plex preparation**: Organize metadata before library imports
- **NAS systems**: TrueNAS, Unraid, Synology - edit without desktop apps
- **VPS music libraries**: Cloud servers with no GUI access  
- **Raspberry Pi setups**: Lightweight enough for minimal hardware

### Large-Scale Operations
- **Bulk metadata cleanup**: Process thousands of files efficiently
- **Archive digitization**: Organize newly ripped collections
- **Mixed format libraries**: Handle different formats intelligently
- **Library maintenance**: Ongoing organization without workflow disruption

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PUID` | 1000 | User ID for file permissions |
| `PGID` | 1000 | Group ID for file permissions |
| `MUSIC_DIR` | /music | Internal container music path |

### Port Configuration

- `8338` - Web interface (configurable in docker-compose.yml)

### Volume Mounts

- `/music` - Mount your music directory here (read/write access required)

## Architecture

### Backend
- **Framework**: Python Flask
- **Audio Processing**: For reading/writing metadata:
  - **Primary**: [Mutagen](https://mutagen.readthedocs.io/) library for direct metadata manipulation
  - **Fallback**: FFmpeg/FFprobe for formats not supported by Mutagen
- **Inference Engine**: Custom pattern recognition algorithm + MusicBrainz API
- **History System**: In-memory with temporary file storage for album art

### Frontend
- **Framework**: Vanilla JavaScript (no dependencies)
- **UI Components**: Custom-built with modern CSS
- **State Management**: Centralized state object pattern
- **Performance**: Debounced operations, request cancellation

### Container
- **Base**: Alpine Linux (ultra-lightweight)
- **Size**: Only 189MB (75% smaller than desktop alternatives)
- **Architecture**: Multi-arch support (x86_64, ARM64, ARMv7)
- **Dependencies**: Self-contained, no external requirements

## Troubleshooting

### Permission Issues
Ensure PUID/PGID match your user:
```bash
id -u  # Your user ID
id -g  # Your group ID
```

### Can't Access the Interface
```bash
docker ps               # Check if container is running
docker compose logs     # View logs for errors
docker-compose logs     # View logs for errors (for older Docker installations)
```

### Inference Not Working
- Ensure you have internet connectivity for MusicBrainz queries
- Check browser console for errors
- Try refreshing the page

### History Not Saving
- History is stored in memory and clears on container restart
- This is by design for privacy and performance
- Future versions may add persistent storage options

### Container Not Starting
```bash
# Check container logs
docker compose logs metadata-remote    # (or docker-compose logs for older installations)

# Verify volume mounts
docker inspect metadata-remote
```

### Network Access Issues
```bash
# Verify container is running
docker ps

# Check port binding
netstat -tulpn | grep 8338
```

## Security

**⚠️ Important**: This application is designed for internal network use. Do not expose directly to the internet without proper authentication and encryption (reverse proxy with SSL recommended).

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup
```bash
git clone https://github.com/wow-signal-dev/metadata-remote.git
cd metadata-remote
# See CONTRIBUTING.md for local development setup
```

## Contributors

- [@gauravjot](https://github.com/gauravjot) - File filtering feature
- [@you](https://github.com/you) - Your contribution here!

## License

AGPL-3.0 License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Mutagen](https://github.com/quodlibet/mutagen) - Python multimedia tagging library (LGPL-2.1+)
- [MusicBrainz](https://musicbrainz.org) for their amazing open music database
- All our users and contributors

---

**Built with ❤️ for the self-hosted media server community**
