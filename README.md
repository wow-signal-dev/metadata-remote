# Metadata Remote (mdrm)

A modern web-based metadata editor for audio files, designed for managing large music collections with clean bulk editing capabilities.

![Screenshot](screenshots/main-interface.png)

## Features

- 🎵 Multi-format support: MP3 and FLAC files
- 🎨 Album art management: Upload, preview, and apply to entire folders
- 📁 Bulk operations: Apply metadata to all files in a folder
- ⌨️ Keyboard navigation: Arrow keys, tab switching, and shortcuts
- 🎛️ Three-pane interface: Folders, files, and metadata editing
- ▶️ In-browser playback: Files can be played through the web interface
- 🔄 File renaming: Direct file management through the web interface
- 🌙 Modern dark UI: Responsive design with resizable panes
- 🚀 Ultra-lightweight: Only 189MB Docker image (75% smaller than alternatives)
- ⚡ Fast performance: Alpine Linux base with optimized dependencies

## Quick Start (Recommended)

The easiest way to get started is using our pre-built Docker image.

### Prerequisites
- Docker and Docker Compose
- A music directory to manage

### Installation

1. Download the docker-compose.yml file:
```bash
wget https://raw.githubusercontent.com/wow-signal-dev/metadata-remote/main/docker-compose.yml
```

2. Edit the music directory path in `docker-compose.yml`:
```bash
nano docker-compose.yml
# Change the line: /path/to/your/music:/music
```

3. Start the application:
```bash
docker-compose up -d
```

4. Open your browser to `http://localhost:8338`

That's it! The container will automatically download and run the latest version.

## For Portainer Users

1. In Portainer, go to **Stacks** → **Add Stack**
2. Name your stack: `metadata-remote`
3. Paste this compose configuration:

```yaml
version: '3.8'

services:
  metadata-remote:
    image: ghcr.io/wow-signal-dev/metadata-remote:latest
    container_name: metadata-remote
    ports:
      - "8338:8338"
    volumes:
      - /path/to/your/music:/music  # CHANGE THIS LINE
    environment:
      - PUID=1000
      - PGID=1000
    restart: unless-stopped
```

4. Update the music volume path to your actual music directory
5. Click **Deploy the stack**

## Building from Source (For Developers)

If you want to build the image locally or contribute to development:

1. Clone this repository:
```bash
git clone https://github.com/wow-signal-dev/metadata-remote.git
cd metadata-remote
```

2. Use the local development compose file:
```bash
# Copy the local compose file
cp docker-compose.local.yml docker-compose.yml

# Edit the music directory path
nano docker-compose.yml
```

3. Build and start:
```bash
docker-compose up -d --build
```

## Updating

### Using Pre-built Image
```bash
docker-compose pull
docker-compose up -d
```

### Using Local Build
```bash
git pull
docker-compose up -d --build
```

## Usage

### Navigation
- **Arrow keys**: Navigate folders and files
- **Enter**: Expand/collapse folders or reload file metadata
- **Tab**: Switch between folder and file panes
- **Click filename**: Rename files directly
- **Click 'play' icon**: Play the file

### Bulk Operations
- **Apply to Folder**: Change any metadata field for all files in a folder
- **Album Art**: Upload once, apply to entire album folders
- **Keyboard workflow**: Navigate → Enter → Edit → Save

### Perfect for
- Jellyfin/Plex media server preparation
- Large music collection organization
- FLAC library management
- Batch metadata cleanup

## Configuration

### Environment Variables
- `PUID`: User ID for file permissions (default: 1000)
- `PGID`: Group ID for file permissions (default: 1000)

### Ports
- `8338`: Web interface (customizable in docker-compose.yml)

### Volumes
- `/music`: Your music directory (read/write access required)

## Security

⚠️ This application is designed for LOCAL USE ONLY and should NEVER be exposed to the internet.

## Technical Details

- **Backend**: Python Flask with FFmpeg
- **Frontend**: Vanilla JavaScript with modern CSS
- **Audio Processing**: FFprobe for reading, FFmpeg for writing
- **Container**: Alpine Linux-based image (only 189MB)
- **Deployment**: Docker with proper file permissions
- **Container Registry**: GitHub Container Registry (ghcr.io)

## Troubleshooting

### Permission Issues
If you encounter permission errors, ensure the PUID/PGID match your user:
```bash
id -u  # Your user ID
id -g  # Your group ID
```

### Can't Access the Web Interface
- Check if the container is running: `docker ps`
- Check logs: `docker-compose logs`
- Ensure port 8338 isn't already in use

## Contributing

Found a bug or have a feature request? Please open an issue!

Pull requests welcome - see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

Built for the self-hosted media server community 🏠
