# Contributing to metadata-remote

Thanks for your interest in contributing! This project aims to be a simple, lightweight solution for editing audio metadata on headless servers.

## Reporting Issues

**Before submitting an issue:**
- Check if the issue already exists in [GitHub Issues](https://github.com/wow-signal-dev/metadata-remote/issues)
- Test with the latest version if possible

**When reporting bugs, please include:**
- Your operating system and Docker version
- Steps to reproduce the issue
- Expected vs actual behavior
- Any error messages or logs
- Audio file format (MP3/FLAC) if relevant

## Suggesting Features

Feature requests are welcome! Please:
- Check existing issues first to avoid duplicates
- Explain the use case and why it would be helpful
- Keep in mind the project's goal of being lightweight and simple
- Consider if the feature aligns with headless server workflows

## Development Setup

### Prerequisites
- Python 3.11+
- Docker and Docker Compose
- FFmpeg installed locally (for development)

### Local Development
1. **Clone the repository:**
   ```bash
   git clone https://github.com/wow-signal-dev/metadata-remote.git
   cd metadata-remote
   ```

2. **Set up Python environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install flask
   ```

3. **Set environment variable:**
   ```bash
   export MUSIC_DIR=/path/to/your/test/music
   ```

4. **Run the application:**
   ```bash
   python app.py
   ```

5. **Access at:** `http://localhost:8338`

### Docker Development
```bash
docker-compose up --build
```

## Code Guidelines

### Python (Backend)
- Follow PEP 8 style guidelines
- Use descriptive variable names
- Add comments for complex logic
- Handle errors gracefully with appropriate HTTP status codes
- Keep functions focused and single-purpose

### JavaScript (Frontend)
- Use vanilla JavaScript (no frameworks)
- Follow consistent naming conventions
- Add comments for complex UI interactions
- Maintain keyboard navigation support
- Keep the interface responsive

### HTML/CSS
- Semantic HTML structure
- Maintain dark theme consistency
- Ensure accessibility (focus indicators, semantic markup)
- Keep CSS organized and well-commented

## Submitting Changes

### Pull Request Process
1. **Fork the repository** and create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the code guidelines

3. **Test your changes:**
   - Test basic functionality (browse folders, edit metadata, save files)
   - Test with both MP3 and FLAC files
   - Verify Docker deployment works
   - Check keyboard navigation still works

4. **Commit with clear messages:**
   ```bash
   git commit -m "Add feature: bulk delete album art"
   ```

5. **Push and create a pull request:**
   - Include a clear description of what the PR does
   - Reference any related issues
   - Include screenshots for UI changes

### What We Look For
- **Functionality:** Does it work as expected?
- **Simplicity:** Does it maintain the tool's lightweight nature?
- **Compatibility:** Works with existing Docker setup?
- **User Experience:** Maintains intuitive interface?

## Priority Areas

Help is especially welcome in these areas:

### High Priority
- **Additional audio formats** (AIFF, APE support)
- **Performance improvements** for large libraries
- **Better error handling** and user feedback
- **Mobile interface** improvements

### Medium Priority
- **Folder monitoring** for new files

### Nice to Have
- **Multi-user support** with permissions
- **Themes** beyond the current light and dark theme
- **Integration examples** with popular tools
- **API endpoints** for automation

## Community Guidelines

- Be respectful and welcoming to all contributors
- Focus on constructive feedback in code reviews
- Help newcomers get started with development
- Keep discussions relevant to the project goals
- Remember this is volunteer work - be patient and kind

## Testing

Currently testing is manual. Help setting up automated testing would be appreciated!

**Manual testing checklist:**
- [ ] Folder navigation works
- [ ] File selection and metadata loading
- [ ] Individual field editing and saving
- [ ] Bulk operations (apply to folder)
- [ ] Album art upload and application
- [ ] File renaming functionality
- [ ] Keyboard navigation
- [ ] Docker deployment

## Questions?

Feel free to:
- Open an issue for questions about contributing
- Start a discussion for broader topics
- Reach out if you're unsure about anything

Thanks for helping make metadata management easier for the self-hosted community! 🏠
