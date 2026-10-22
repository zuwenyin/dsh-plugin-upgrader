# Changelog

## 1.0.0

First public release.

- **Versions tab** on the DeepSeek Harness Plugins page, next to *Installed* and *Discover*.
- **One-click upgrade** of every upgradable plugin, with progress, per-plugin results and failure reasons.
- **Multi-select upgrade**: tick a subset and upgrade only those.
- **Version history and rollback**: every published version with its publish date, engine requirement and deprecation notice; one click switches to it.
- **GitHub links**: `GH` opens the repository homepage, a version number opens that version's release page.
- Routes are loopback-only; the enabled / disabled state of a plugin survives an upgrade; one batch at a time with adoption of work in progress.

### Notes

- Switching versions is a remove + install, because `installBundle` refuses an already-installed package name (`already-installed`). The same path the official Update action takes.
- A version without its own git tag falls back to the repository's release feed, so no version link is a dead end.
