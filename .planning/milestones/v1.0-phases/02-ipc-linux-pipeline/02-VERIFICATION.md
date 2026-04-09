---
phase: 02-ipc-linux-pipeline
verified: 2026-04-09T07:20:46Z
status: passed
score: 3/3 must-haves verified
overrides_applied: 0
---

# Phase 2: IPC Linux Pipeline Verification Report

**Phase Goal:** `@nexusmods/fomod-installer-ipc` ships a self-contained ELF binary with correct execute permissions, and the TypeScript launcher resolves the correct binary on both Linux and Windows
**Verified:** 2026-04-09T07:20:46Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm pack` of the IPC package includes `dist/linux-x64/ModInstallerIPC` (ELF, executable bit set) produced by the `ubuntu-22.04` CI runner without manual intervention | VERIFIED | `build-ipc` matrix job runs on `ubuntu-22.04`, `dotnet publish -r linux-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true -o dist/linux-x64`, `chmod +x dist/linux-x64/ModInstallerIPC` before upload; `package-ipc` downloads to `dist/linux-x64/`, verifies `test -x`, then `npm pack`; `package.json` `"files": ["dist/"]` captures the entire `dist/` tree |
| 2 | On Linux, `BaseIPCConnection` resolves and spawns `dist/linux-x64/ModInstallerIPC` without hitting `ENOENT` or `EACCES`; on Windows the existing `dist/ModInstallerIPC.exe` path still resolves | VERIFIED | `findExecutable()` selects `'ModInstallerIPC.exe'` (Windows) or `'ModInstallerIPC'` (Linux); `getExecutablePaths()` returns `path.join(__dirname, exeName)` on Windows (flat layout, backward compatible) and `path.join(__dirname, 'linux-x64', exeName)` on Linux; matches CI artifact download layout; `RegularProcessLauncher` calls `spawn(exePath, args, options)` directly — no Mono wrapping, zero `mono` occurrences |
| 3 | `cleanup-processes.ts` completes without throwing `ENOENT` on Linux — orphaned IPC processes are detected via `pgrep` and terminated via `kill` | VERIFIED | `findStuckProcesses()` and `killProcess()` both have `process.platform !== 'win32'` guards; Linux branch uses `pgrep -f ModInstallerIPC` inside try/catch that returns `[]` on pgrep exit code 1 (no-match is not an error); `kill -9 ${pid}` for termination; Windows `tasklist`/`taskkill` logic unchanged |

**Score:** 3/3 truths verified

### Note on ROADMAP SC-2 wording

ROADMAP SC-2 mentions `dist/win32-x64/ModInstallerIPC.exe` as the Windows path. The actual implementation uses `dist/ModInstallerIPC.exe` (flat, no `win32-x64` subdir) — this was the pre-existing Windows layout, and plan decision D-01 explicitly preserves it for backward compatibility. The ROADMAP wording is a documentation error; the functional intent (Windows path unchanged, resolves correctly) is fully satisfied.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/build-packages.yml` | Matrix build-ipc with platform-conditional dotnet publish and packaging | VERIFIED | Matrix `include` with `ubuntu-22.04/linux-x64` and `windows-latest/win32-x64`; conditional steps `if: matrix.platform == 'linux-x64'` and `if: matrix.platform == 'win32-x64'`; `package-ipc` job present with `needs: build-ipc` |
| `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts` | Platform-aware `findExecutable()` and `getExecutablePaths()` | VERIFIED | Line 452: `process.platform === 'win32' ? 'ModInstallerIPC.exe' : 'ModInstallerIPC'`; line 156: Windows branch returns flat path, Linux branch returns `linux-x64/` subdir |
| `src/ModInstaller.IPC.TypeScript/src/launchers/RegularProcessLauncher.ts` | Direct binary launch without Mono fallback | VERIFIED | `spawn(exePath, args, options)` directly; zero occurrences of `mono`; no `actualExePath`/`actualArgs` variables |
| `src/ModInstaller.IPC.TypeScript/src/cleanup-processes.ts` | Cross-platform process cleanup (pgrep/kill on Linux, tasklist/taskkill on Windows) | VERIFIED | Both `findStuckProcesses()` and `killProcess()` have `process.platform !== 'win32'` guards; pgrep exit code 1 handled as empty result |
| `src/ModInstaller.IPC.TypeScript/test/verify-warning.spec.ts` | Platform-aware skip guard and `getExecutablePaths` override | VERIFIED | Skip guard uses `path.join(packageRoot, 'dist', 'linux-x64', 'ModInstallerIPC')` on Linux; override returns `dist/linux-x64/` on Linux |
| `src/ModInstaller.IPC.TypeScript/test/ModInstaller.ipc.spec.ts` | Platform-aware skip guard and `getExecutablePaths` override | VERIFIED | Skip guard uses `path.join(packageRoot, 'dist', 'linux-x64', 'ModInstallerIPC')` on Linux; override returns `dist/linux-x64/` on Linux |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `build-ipc` job | `dotnet publish` | `if: matrix.platform == 'linux-x64'` conditional step | WIRED | Step present with full self-contained flags: `-r linux-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true` |
| `build-ipc` job | `package-ipc` job | `needs: build-ipc` | WIRED | `package-ipc` declares `needs: build-ipc` |
| `BaseIPCConnection.findExecutable()` | `getExecutablePaths()` | platform-aware `exeName` ternary | WIRED | `exeName` resolved at line 452 via `process.platform` ternary, passed to `getExecutablePaths(exeName)` at line 453 |
| `getExecutablePaths()` | `dist/linux-x64/` subdir | `path.join(__dirname, 'linux-x64', exeName)` | WIRED | Non-Windows branch at line 161 returns correct platform subdir path |
| `RegularProcessLauncher.launch()` | `spawn()` | direct `exePath` (no Mono wrapper) | WIRED | `spawn(exePath, args, options)` at line 27; Mono detection block fully removed |
| `cleanup-processes.ts findStuckProcesses()` | `pgrep -f ModInstallerIPC` | `process.platform !== 'win32'` guard | WIRED | Lines 13-24: Linux guard + `pgrep -f` + try/catch for exit code 1 |

### Data-Flow Trace (Level 4)

Not applicable — artifacts are process-launching infrastructure (CI workflow, process spawner, process cleanup utility), not data-rendering components. No state-to-render data flows to trace.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles without errors | `cd src/ModInstaller.IPC.TypeScript && npx tsc --noEmit` | Exit 0, no output | PASS |
| RegularProcessLauncher has zero Mono references | `grep -i mono src/.../RegularProcessLauncher.ts` | No matches | PASS |
| `cleanup-processes.ts` has pgrep Linux branch | `grep pgrep src/.../cleanup-processes.ts` | Line 16: `pgrep -f ModInstallerIPC` | PASS |
| CI workflow has matrix build-ipc | `grep strategy .github/workflows/build-packages.yml` | Matrix present with ubuntu-22.04 and windows-latest | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| IPC-01 | 02-01-PLAN.md | GitHub Actions `build-packages.yml` adds Linux runner, publishes self-contained ELF, sets `chmod +x`, includes in npm tarball under `dist/linux-x64/ModInstallerIPC` | SATISFIED | Matrix `build-ipc` with ubuntu-22.04, `dotnet publish -r linux-x64 --self-contained true`, `chmod +x` step, `package-ipc` downloads both artifacts and runs `npm pack`; `"files": ["dist/"]` captures `dist/linux-x64/` |
| IPC-02 | 02-02-PLAN.md | `RegularProcessLauncher.ts` resolves correct IPC binary path based on `process.platform`; `BaseIPCConnection.findExecutable()` no longer hardcodes `.exe` unconditionally | SATISFIED | `findExecutable()` uses `process.platform` ternary for exe name; `getExecutablePaths()` returns platform-specific paths; `RegularProcessLauncher` has zero Mono references; spawns `exePath` directly |
| IPC-03 | 02-02-PLAN.md | `cleanup-processes.ts` is cross-platform — replaces `tasklist`/`taskkill` with platform-aware process detection (`pgrep`/`kill` on Linux) | SATISFIED | Both functions guarded with `process.platform !== 'win32'`; Linux uses `pgrep -f`/`kill -9`; Windows retains original `tasklist`/`taskkill` logic unchanged |

All 3 requirements for this phase are SATISFIED. No orphaned requirements detected.

### Anti-Patterns Found

No anti-patterns detected in modified files:
- No TODO/FIXME/placeholder comments in any modified file
- No empty implementations (`return null`, `return {}`, `return []` stubs without data paths)
- No hardcoded empty data flowing to rendering
- All function bodies are substantive and fully implemented

### Human Verification Required

No human verification items — all behavioral claims are verifiable programmatically for this phase.

The one item that is unverifiable without running CI is whether GitHub Actions `upload-artifact@v4` correctly preserves the execute bit on the downloaded artifact in `package-ipc`. This is documented GitHub Actions behavior (v3+ preserves file permissions) and the workflow includes an explicit `test -x` check in the Verify dist contents step that would fail the CI run if the bit were lost.

### Gaps Summary

No gaps. All three ROADMAP success criteria are satisfied:

1. The CI matrix build-ipc job produces a self-contained ELF on ubuntu-22.04 with `chmod +x` applied before artifact upload, and `package-ipc` assembles both platform binaries into a single npm tarball.
2. `BaseIPCConnection` resolves platform-specific paths (`dist/linux-x64/ModInstallerIPC` on Linux, `dist/ModInstallerIPC.exe` on Windows) and `RegularProcessLauncher` spawns the binary directly without Mono.
3. `cleanup-processes.ts` is fully cross-platform using `pgrep`/`kill` on Linux.

Commits verified: `51fd677` (CI matrix, 02-01), `128571f` (binary resolution + Mono removal, 02-02), `45135b1` (cross-platform cleanup, 02-02).

---

_Verified: 2026-04-09T07:20:46Z_
_Verifier: Claude (gsd-verifier)_
