# Contributing to Hammer Script

Thank you for considering contributing to Hammer Script! This document provides guidelines and information for contributors.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/openfront.git`
3. Create a feature branch: `git checkout -b feature/my-new-feature`
4. Make your changes
5. Test thoroughly in OpenFront.io
6. Commit with clear messages: `git commit -m "Add: New port efficiency algorithm"`
7. Push to your fork: `git push origin feature/my-new-feature`
8. Open a Pull Request

## Development Setup

### Prerequisites

- Modern web browser (Chrome, Firefox, Edge, Safari)
- OpenFront.io account
- Text editor or IDE
- Basic JavaScript knowledge

### Testing Your Changes

1. Edit `hammerScript.js`
2. Open OpenFront.io in your browser
3. Join a match
4. Open browser console (F12)
5. Paste your modified script
6. Test all tabs and features
7. Check Debug tab for raw message detection
8. Export data to verify JSON format

### The OpenFrontIO Folder

The `OpenFrontIO/` folder in this repository is **reference only** - it contains the game's source code for understanding the client-side architecture. This folder is:

- **Gitignored** - Not tracked in version control
- **Read-only** - Should not be modified as part of Hammer Script development
- **For reference** - Helps understand game internals for better detection strategies

To set up the reference folder:

```bash
# Clone the OpenFront.io repository separately
git clone https://github.com/openfrontio/OpenFrontIO.git
```

## Code Style

### JavaScript Style

- Use ES6+ features (arrow functions, template literals, etc.)
- 2-space indentation
- Semicolons optional but be consistent
- Descriptive variable names
- Comments for complex logic

### Good Example

```javascript
// Parse human-readable amount strings (1k, 2M, etc.)
const parseHuman = (txt) => {
  const m = String(txt || "")
    .replace(/[, ]/g, "")
    .match(/^([\d.]+)([kKmM])?$/)
  if (!m) return NaN
  let n = Number(m[1])
  if (m[2]) n *= m[2].toLowerCase() === "m" ? 1_000_000 : 1_000
  return Math.round(n)
}
```

### Code Organization

The script is organized as a single IIFE with clear sections:

1. Hard reset (cleanup old instances)
2. Utils (helper functions)
3. State (data structures)
4. UI (DOM creation)
5. Controls (event handlers)
6. Rendering (view logic)
7. Message parser (detection logic)
8. Observer setup
9. Initialization
10. Global exposure

When adding features, place code in the appropriate section.

## Contribution Areas

### High Priority

- **Canvas message detection** - Fallback for when messages aren't in DOM
- **Performance optimization** - Reduce CPU/memory usage in long matches
- **Mobile support** - Responsive UI for phone/tablet players
- **Additional message patterns** - Support more game events

### Medium Priority

- **Historical charts** - Visualize donation trends over time
- **Configurable thresholds** - Let users set their own embargo GPM limits
- **Keyboard shortcuts** - Quick access to tabs and controls
- **Sound alerts** - Notify on large donations

### Documentation

- Improve README clarity
- Add usage examples
- Create video tutorials
- Translate to other languages

## Message Detection

The core of Hammer Script is message detection. If you find new message patterns, add them to the `handleLine()` function:

```javascript
// Example: Adding alliance request detection
m = /^Alliance request from\s+(.+)$/.exec(line)
if (m) {
  const name = m[1].trim()
  // Handle alliance request
  return
}
```

### Regex Pattern Guidelines

- Use `^` and `$` to anchor start/end
- Capture amounts with `([\d.,kKmM]+)` for parseHuman()
- Capture names with `(.+)` and trim
- Test against actual game messages

## Testing Checklist

Before submitting a PR, verify:

- [ ] Script loads without console errors
- [ ] All five tabs render correctly
- [ ] Tag Mates filter works (prompt, toggle, filtering)
- [ ] Export produces valid JSON
- [ ] Pause/Resume works
- [ ] Reset clears all data
- [ ] Size cycling works
- [ ] Minimize/restore works
- [ ] Drag and drop works
- [ ] Manual resize preserves body height
- [ ] Debug tab shows raw messages
- [ ] Port efficiency calculations are correct
- [ ] Feed auto-scrolls to top
- [ ] Script re-run removes old instance cleanly

## Pull Request Guidelines

### Title Format

Use conventional commit style:

- `Add: New feature description`
- `Fix: Bug description`
- `Docs: Documentation changes`
- `Refactor: Code improvement without feature changes`
- `Test: Testing improvements`
- `Chore: Maintenance tasks`

### Description Template

```markdown
## Changes
- Bullet list of changes made

## Motivation
Why this change is needed

## Testing
How you tested the changes

## Screenshots
(if applicable)

## Breaking Changes
(if any)
```

## Reporting Bugs

Use the bug report template in `.github/ISSUE_TEMPLATE/bug_report.md`

Include:
- Browser and version
- Script version
- Debug tab output
- Console errors
- Steps to reproduce
- Expected vs actual behavior

## Suggesting Features

Use the feature request template in `.github/ISSUE_TEMPLATE/feature_request.md`

Provide:
- Clear description
- Problem statement
- Proposed solution
- Use case
- Priority level

## Communication

- Be respectful and constructive
- Focus on the code, not the person
- Assume good intentions
- Ask questions if something is unclear
- Help others who are learning

## Code Review Process

1. Maintainers will review PRs within 1-2 weeks
2. Address feedback by pushing to your branch
3. Once approved, maintainers will merge
4. Your contribution will be credited in CHANGELOG.md

## Performance Considerations

- Avoid blocking the main thread
- Use efficient data structures (Map > Object for lookups)
- Bound collection sizes to prevent memory leaks
- Minimize DOM manipulation
- Debounce/throttle expensive operations
- Test in long matches (2+ hours)

## Security Considerations

- Never eval() user input
- Sanitize all text before innerHTML
- Don't expose sensitive game data
- Don't make external network requests
- Don't modify game state maliciously

## Versioning

We use Semantic Versioning (SemVer):

- **MAJOR** (x.0.0): Breaking changes
- **MINOR** (0.x.0): New features, backwards compatible
- **PATCH** (0.0.x): Bug fixes

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

- Open a GitHub Discussion
- Comment on existing issues
- Reach out to maintainers

---

Thank you for helping make Hammer Script better for the OpenFront.io community!
