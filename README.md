# <img src="screenshots/mdrm-icon-for-light-bg.svg" alt="Alt Text" width="25" height="21"> Metadata Remote (mdrm)

Web-based audio metadata editor for headless servers.

Edit audio file metadata through a browser interface, designed for servers without desktop environments.

![Screenshot](screenshots/main-interface.png)

## Why?

Need to edit audio metadata on a headless server? Until now you had to either use complex CLI tools over SSH, download files to edit locally, or navigate heavyweight library managers like Beets that require database backends, import pipelines, and complex configuration.

Metadata Remote "just does one thing well" — spin up a Docker container, open a browser on any device, and edit your metadata. That's it.

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

### 🧠 Smart Metadata Suggestions
Advanced inference engine that goes beyond simple MusicBrainz queries. Analyzes local context (filenames, folder patterns, siblings), performs confidence-weighted evidence synthesis, and iteratively refines suggestions. Handles edge cases like classical music, compilations, and live recordings with specialized strategies.

### 🔄 Fully Reversible Editing History
Full undo/redo system tracks up to 1000 edits. Revert mistakes and even undo bulk operations across entire folders. Edit fearlessly.

### ⚡ Powerful Bulk Operations
Apply metadata or album art to entire folders instantly. Save individual fields or update everything at once.

### 🎨 Advanced Album Art Management
Upload, preview, delete, and bulk apply album art. Metadata Remote automatically detects and repairs corrupted embedded images when editing.

### 🔧 Efficient Server Workflow
- **Keyboard-first navigation**: Arrow keys with smart repeat, Tab switching, Enter to expand
- **Real-time filtering**: Instant search within large folders
- **In-browser playback**: Stream files directly (supports most formats)
- **Direct file renaming**: Update filenames with automatic history tracking
- **Resizable panels**: Customize your workspace by dragging dividers

### ✨ Modern Interface
Clean dark theme with smooth animations, loading states, and clear visual feedback for every action.

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
- **↑↓ Arrow keys**: Navigate folders and files with smart key repeat
- **Enter**: Expand/collapse folders  
- **Tab**: Switch between folder and file panes
- **Click filename header**: Rename files directly
- **Click empty field**: Get automatic intelligent suggestions

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
- **Audio Processing**: FFmpeg for reading/writing metadata
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

- MusicBrainz for their amazing open music database
- FFmpeg team for reliable audio processing
- All our users and contributors

---

**Built with ❤️ for the self-hosted media server community**
