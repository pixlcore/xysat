# Vendored node-windows

This directory contains a project-local copy of
[`node-windows`](https://github.com/coreybutler/node-windows) for xySat's
Windows builds.

The original source was taken from upstream tag `1.0.0-beta.8`, commit
`e60ec01cb63f73a713581548d24256b25c5f93f8`. The upstream MIT license is
preserved in `LICENSE`.

During the Windows release build, this directory is moved into
`node_modules/node-windows`, and its locked runtime dependencies are installed
with `npm ci`. Linux, macOS, and Docker builds exclude this directory.

This copy is intentionally maintained with xySat so that Windows service
wrapper fixes can be reviewed, tested, and released together with the
application. Do not replace it with the package from npm without first
reviewing and preserving the local changes.

## Local hardening

The service wrapper has been hardened for xySat in the following ways:

- Only one child process and one pending restart timer are allowed at a time.
- Every delayed restart re-checks the live child and shutdown state before it
  can launch anything.
- Restart limits use a rolling 60-second window, and stale child events cannot
  clear or restart a newer child generation.
- Wrapper-level uncaught exceptions trigger a controlled shutdown instead of
  recursively launching another copy of xySat.
- The Windows Event Log adapter writes to WinSW-captured stdout and stderr. It
  never spawns `eventcreate.exe` or an elevated fallback process.
- `stopparentfirst` and `abortOnError` are serialized as explicit `y` or `n`
  arguments. Existing XML containing `stopparentfirst=undefined` is safely
  interpreted as disabled.
