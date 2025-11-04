# Project Structure

```
openfront/                          # Root directory (Git repository)
├── .git/                          # Git repository data
├── .github/                       # GitHub configuration
│   └── ISSUE_TEMPLATE/
│       ├── bug_report.md          # Bug report template
│       └── feature_request.md     # Feature request template
│
├── OpenFrontIO/                   # Game source (GITIGNORED - reference only)
│   ├── src/                       # Not tracked in this repo
│   ├── public/                    # Not tracked in this repo
│   └── ...                        # Not tracked in this repo
│
├── .gitattributes                 # Line ending configuration
├── .gitignore                     # Git ignore rules (excludes OpenFrontIO/)
├── CHANGELOG.md                   # Version history and changes
├── CONTRIBUTING.md                # Contribution guidelines
├── LICENSE                        # MIT License
├── PROJECT_STRUCTURE.md           # This file
├── QUICKSTART.md                  # Quick installation guide
├── README.md                      # Main documentation
└── hammerScript.js                # Main script (paste into browser console)
```

## File Purposes

### Core Files

| File | Purpose |
|------|---------|
| `hammerScript.js` | Main script - paste this into browser console to run Hammer Script |
| `README.md` | Complete documentation with features, usage, and troubleshooting |
| `QUICKSTART.md` | Fast installation guide for new users |

### Documentation

| File | Purpose |
|------|---------|
| `CHANGELOG.md` | Version history, changes, and development notes |
| `CONTRIBUTING.md` | Guide for contributing code, reporting bugs, suggesting features |
| `PROJECT_STRUCTURE.md` | This file - explains the repository layout |

### Configuration

| File | Purpose |
|------|---------|
| `.gitignore` | Prevents OpenFrontIO/ and other files from being tracked |
| `.gitattributes` | Ensures consistent line endings (LF) across platforms |
| `LICENSE` | MIT License - defines usage terms |

### GitHub Integration

| File | Purpose |
|------|---------|
| `.github/ISSUE_TEMPLATE/bug_report.md` | Template for filing bug reports |
| `.github/ISSUE_TEMPLATE/feature_request.md` | Template for requesting features |

## Repository Type: Monorepo

This is structured as a **monorepo** with the following characteristics:

1. **Single repository** for the Hammer Script project
2. **Reference folder** (OpenFrontIO/) for game source code - not tracked
3. **All documentation** lives alongside the code
4. **GitHub integration** for issues and contributions

## Why OpenFrontIO/ is Gitignored

The `OpenFrontIO/` folder contains the official OpenFront.io game source code. It is:

- **Reference material** - Used to understand game internals
- **External repository** - Has its own Git history
- **Not our code** - Maintained by OpenFront.io developers
- **Read-only** - We don't modify it as part of Hammer Script development

Users can clone it separately if needed for reference:

```bash
git clone https://github.com/openfrontio/OpenFrontIO.git
```

## Development Workflow

1. **Modify** `hammerScript.js` or documentation
2. **Test** in OpenFront.io browser console
3. **Stage** changes: `git add <files>`
4. **Commit** with clear message: `git commit -m "Add: Feature description"`
5. **Push** to remote: `git push origin main`

## Adding New Files

If you add new files to the project:

1. Place them in the root directory
2. Update this `PROJECT_STRUCTURE.md` file
3. Add entry to README.md if user-facing
4. Commit both the file and updated documentation

## Branches

- `main` (or `master`) - Stable releases
- `develop` - Active development (if using Git Flow)
- `feature/*` - Feature branches
- `fix/*` - Bug fix branches

## Tags

Use semantic versioning for releases:

```bash
git tag -a v2.2.0 -m "Release v2.2.0: Message-based detection"
git push origin v2.2.0
```

## File Sizes

As of v2.2:

- `hammerScript.js`: ~19 KB (main script)
- `README.md`: ~10 KB (comprehensive docs)
- `CONTRIBUTING.md`: ~6.6 KB (contributor guide)
- `CHANGELOG.md`: ~4.7 KB (version history)
- Total tracked files: ~50 KB (very lightweight!)

## No Build Process

This project intentionally has **no build process**:

- No npm/yarn dependencies
- No webpack/rollup bundling
- No transpilation needed
- Pure vanilla JavaScript
- Copy-paste ready

This keeps it simple and accessible for all contributors.
