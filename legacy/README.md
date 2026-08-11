# Archived pre-rebuild Discord bot

This directory contains the Cheater's Market Discord bot as it existed before the ground-up rebuild.

- Archive date: 2026-08-11 (Australia/Sydney)
- Source branch: `master`
- Source commit: `a44fbd670baa08f9beffedfe20aab13fbf7fed70`
- Pre-experiment comparison commit: `fa2dc77ba9f631e2010cde87d171d34f9f439d6a`
- Status: reference-only; this code is not the new production bot

The source commit includes the inactive website Internal API experiment from `a44fbd6`. Use Git history and `docs/legacy-parity.md` to distinguish that experiment from the behavior present immediately before it.

The original root README is preserved verbatim as `README.original.md`. Generated `dist/` output and the local `node_modules/` install were moved here for archival continuity but remain ignored by Git; the tracked package and lock files are the reproducible dependency record.

The new production bot must never import, require, execute, or otherwise depend on code under `legacy/`. Reimplement required behavior at the repository root through the website-owned Internal Integrations API.
