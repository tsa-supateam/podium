# models/

Populated by `scripts/fetch_models.py` at build time (about 300 MB). Podium never downloads anything at runtime.
`manifest.lock.json` pins the SHA-256 of every file; the script fails if a download does not match.
