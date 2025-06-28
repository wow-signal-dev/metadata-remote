## Synology NAS Users

### Special Volume Mounting Configuration

Synology NAS devices may create hidden system folders and metadata structures that can interfere with Metadata Remote's ability to detect audio files. If you're seeing `@eaDir` folders or "No audio files found" messages, you'll need to use a specific mounting configuration.

**Solution:** Create a dedicated subdirectory for your music files and use a nested mount path:

```yaml
volumes:
  - /volume1/docker/mdrm/music:/music/music:rw
```

Instead of the standard configuration:
```yaml
volumes:
  - /volume1/docker/mdrm:/music:rw
```

### Why This Works

This configuration isolates your audio files from Synology's system artifacts like:
- `@eaDir` (thumbnail/metadata folders)
- Folders with `.mp3` extensions created by Synology's media indexing

By mounting a clean subdirectory, the app can properly detect and display your actual audio files.

### Complete Setup Guide

For a comprehensive installation guide specifically for Synology NAS users, please refer to the excellent tutorial created by [@mariushosting](https://github.com/mariushosting):

📖 **[How to Install Metadata Remote on Your Synology NAS](https://mariushosting.com/how-to-install-metadata-remote-on-your-synology-nas/)**

*Special thanks to [@mariushosting](https://github.com/mariushosting) for discovering this solution and creating detailed documentation to help the Synology community!*
