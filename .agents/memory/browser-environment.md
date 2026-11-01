---
name: Browser testing on Nix
description: Why browser tests use system Chromium rather than a downloaded Playwright browser.
---

Use Nix-provided system Chromium for local browser checks, with Playwright controlling that executable.

**Why:** Playwright's downloaded Linux Chromium did not launch in this Nix environment because its expected shared libraries were absent. Installing system Chromium provided a working, dependency-complete browser.

**How to apply:** Resolve system Chromium from PATH (or an explicit executable override). Do not repeatedly download browser bundles to solve missing system libraries. Keep browser caches out of Git and deployment files.
