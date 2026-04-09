# Phase 2: IPC Linux Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 02-ipc-linux-pipeline
**Areas discussed:** Dist layout migration, chmod+x scope, Windows IPC CI runner, ubuntu-22.04 pin scope

---

## Dist layout migration

| Option | Description | Selected |
|--------|-------------|----------|
| Platform subdirs only | Windows → dist/win32-x64/ModInstallerIPC.exe, Linux → dist/linux-x64/ModInstallerIPC. Breaking change for consumers. | |
| Keep root copy for Windows | Linux gets dist/linux-x64/ModInstallerIPC, Windows stays at dist/ModInstallerIPC.exe. Non-breaking for Windows consumers. | ✓ |
| Platform subdirs + deprecation symlink | Platform subdirs as primary, dist/ModInstallerIPC.exe as symlink for one release cycle. | |

**User's choice:** Keep root copy for Windows
**Notes:** Backward compatibility for Vortex consumers who reference `dist/ModInstallerIPC.exe`. This is a fork with downstream consumers — breaking the Windows path is unacceptable.

**Follow-up: TypeScript resolver strategy**

| Option | Description | Selected |
|--------|-------------|----------|
| Platform paths only | Resolver checks platform-specific path only. Fail fast if not found. | ✓ |
| Platform path with root fallback | Linux tries dist/linux-x64/ first, then falls back to dist/ root. | |

**User's choice:** Platform paths only
**Notes:** Explicit, fail-fast. If the binary isn't where it should be, surface the error immediately.

---

## chmod+x scope

| Option | Description | Selected |
|--------|-------------|----------|
| CI step only | chmod +x in GitHub Action before npm pack. Published tarballs always correct. | ✓ |
| CI + postinstall script | Both CI step and npm postinstall. Protects local builds, but postinstall has side effects. | |

**User's choice:** CI step only
**Notes:** The published package is the primary use case. Local developers building from source can set execute permissions manually.

---

## Windows IPC CI runner

| Option | Description | Selected |
|--------|-------------|----------|
| Add Windows IPC runner | build-ipc becomes matrix: ubuntu-22.04 + windows-latest. CI-verified Windows EXE. | ✓ |
| Linux-only new runner | Keep Windows EXE out-of-CI. Risk: Windows regressions not caught automatically. | |

**User's choice:** Add Windows IPC runner
**Notes:** Since Windows EXE stays at dist/ root (D-01), CI must produce it. Also provides regression safety for IPC-02 TypeScript changes.

---

## ubuntu-22.04 pin scope

| Option | Description | Selected |
|--------|-------------|----------|
| Both IPC and native | Pin IPC and build-native linux-x64 to ubuntu-22.04 in same PR. | ✓ |
| IPC runner only | Pin IPC only. Native fix deferred to separate PR. | |

**User's choice:** Both IPC and native
**Notes:** STATE.md already flagged both. Consistent GLIBC baseline across all Linux artifacts. Minimal extra scope to fix both in one PR.

---

## Claude's Discretion

- Exact dotnet publish flags for self-contained Linux build
- Whether build.js is updated vs CI overrides output dir directly
- pgrep/kill command construction for IPC-03
- Commit ordering

## Deferred Ideas

None.
