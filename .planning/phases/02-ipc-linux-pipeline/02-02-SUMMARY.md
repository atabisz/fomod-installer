---
phase: 02-ipc-linux-pipeline
plan: 02
subsystem: ipc-typescript
tags: [linux, ipc, platform-detection, process-management, cleanup]
dependency_graph:
  requires: []
  provides: [IPC-02, IPC-03]
  affects: [BaseIPCConnection, RegularProcessLauncher, cleanup-processes]
tech_stack:
  added: []
  patterns: [process.platform guard, platform-subdir binary layout]
key_files:
  created: []
  modified:
    - src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts
    - src/ModInstaller.IPC.TypeScript/src/launchers/RegularProcessLauncher.ts
    - src/ModInstaller.IPC.TypeScript/src/cleanup-processes.ts
    - src/ModInstaller.IPC.TypeScript/test/verify-warning.spec.ts
    - src/ModInstaller.IPC.TypeScript/test/ModInstaller.ipc.spec.ts
decisions:
  - Platform binary name selected in findExecutable() via process.platform ternary, not in getExecutablePaths()
  - Linux binary path uses dist/linux-x64/ subdir to match CI publish layout (D-02)
  - Mono detection removed entirely; .NET 9 self-contained ELF needs no interpreter
  - pgrep -f used (not pgrep -x) to match full command line, avoiding 15-char /proc/comm truncation (A2 mitigation)
metrics:
  duration_minutes: 8
  completed_date: "2026-04-09"
  tasks_completed: 2
  files_modified: 5
---

# Phase 02 Plan 02: TypeScript IPC Launcher Platform-Awareness Summary

**One-liner:** Platform-aware binary resolution (linux-x64 subdir), Mono removal, and cross-platform pgrep/kill cleanup utility.

## What Was Built

### Task 1: Platform-aware binary resolution and Mono removal (commits: 128571f)

**BaseIPCConnection.ts — `findExecutable()` and `getExecutablePaths()`:**

- `findExecutable()` now selects the exe name via `process.platform === 'win32' ? 'ModInstallerIPC.exe' : 'ModInstallerIPC'` before calling `getExecutablePaths()`
- `getExecutablePaths()` returns `dist/ModInstallerIPC.exe` (flat, Windows-compatible) on Win32 and `dist/linux-x64/ModInstallerIPC` on Linux, matching the CI publish layout from plan 02-01

**RegularProcessLauncher.ts:**

- Removed the entire Mono detection block (lines 20-32 in original): the `process.platform !== 'win32' && exePath.endsWith('.exe')` guard and the `mono` redirect
- Launcher now calls `spawn(exePath, args, options)` directly — correct because `findExecutable()` already provides the right platform-specific binary path

**Test files (verify-warning.spec.ts, ModInstaller.ipc.spec.ts):**

- `getExecutablePaths()` overrides in both test classes updated to return `dist/linux-x64/exeName` on Linux
- Skip guards updated from hardcoded `dist/ModInstallerIPC.exe` check to platform-conditional path, so tests are not falsely skipped on Linux when the ELF binary is present

### Task 2: Cross-platform cleanup utility (commit: 45135b1)

**cleanup-processes.ts:**

- `findStuckProcesses()`: `process.platform !== 'win32'` guard added; Linux branch uses `pgrep -f ModInstallerIPC` with a `try/catch` that returns `[]` on pgrep exit code 1 (no matches — not an error); Windows `tasklist` logic unchanged
- `killProcess()`: Linux branch uses `kill -9 ${pid}`; Windows `taskkill` logic unchanged
- JSDoc and console messages updated to drop `.exe` suffix (utility is now cross-platform)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 128571f | Platform-aware binary resolution, remove Mono detection |
| 2 | 45135b1 | Cross-platform process cleanup utility (pgrep/kill on Linux) |

## Verification Results

All plan verification criteria confirmed:

1. `grep -c "mono" RegularProcessLauncher.ts` → `0`
2. `grep "process.platform" BaseIPCConnection.ts` → two occurrences (findExecutable + getExecutablePaths)
3. `grep "linux-x64" BaseIPCConnection.ts` → platform subdir present in non-Windows branch
4. `grep "pgrep" cleanup-processes.ts` → Linux process detection present
5. `grep "linux-x64" test/*.spec.ts` → both test files updated
6. `npx tsc --noEmit` → exits 0 (no errors)

## Deviations from Plan

None — plan executed exactly as written.

## Branch Strategy Note

Per CLAUDE.md, IPC Linux changes belong on `linux-port` first. This worktree operates on a detached branch `worktree-agent-a4f48d78`. Commits `128571f` and `45135b1` need to be cherry-picked or merged to `linux-port` before merging to `master`.

## Known Stubs

None. All platform paths are fully wired — no hardcoded empty values or TODO placeholders introduced.

## Threat Flags

No new security-relevant surface introduced beyond what is in the plan threat model. All changes are guard additions (platform checks) and removal of dead code (Mono detection). The `pgrep -f ModInstallerIPC` and `kill -9` additions are covered by T-02-06 and T-02-07 in the plan.

## Self-Check: PASSED

Files confirmed present:
- `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts` — FOUND
- `src/ModInstaller.IPC.TypeScript/src/launchers/RegularProcessLauncher.ts` — FOUND
- `src/ModInstaller.IPC.TypeScript/src/cleanup-processes.ts` — FOUND
- `src/ModInstaller.IPC.TypeScript/test/verify-warning.spec.ts` — FOUND
- `src/ModInstaller.IPC.TypeScript/test/ModInstaller.ipc.spec.ts` — FOUND

Commits confirmed present:
- `128571f` — FOUND
- `45135b1` — FOUND
