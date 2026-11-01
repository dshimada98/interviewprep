---
name: Browser testing constraints
description: System Chromium requirements and populated fixtures for mobile dashboard checks.
---

Use Nix-provided system Chromium for local browser checks, with Playwright controlling that executable.

**Why:** Playwright's downloaded Linux Chromium did not launch in this Nix environment because its expected shared libraries were absent. Installing system Chromium provided a working, dependency-complete browser.

**How to apply:** Resolve system Chromium from PATH (or an explicit executable override). Do not repeatedly download browser bundles to solve missing system libraries. Keep browser caches out of Git and deployment files.

Use a populated, multi-column heatmap when checking mobile dashboard overflow,
not just a single case session.

**Why:** A single-case dashboard fitted the phone viewport while a larger
heatmap exposed page-level overflow. A long case-book title was not the cause.

**How to apply:** Measure document width separately from the heatmap's intended
internal scrolling, and confirm that scrolling remains inside its container.
An overflowing table's bounding rectangle alone does not prove page overflow.
