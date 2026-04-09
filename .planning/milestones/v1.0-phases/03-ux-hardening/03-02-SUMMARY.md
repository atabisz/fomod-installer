---
phase: 03-ux-hardening
plan: 02
subsystem: tests-and-docs
tags: [tests, documentation, linux, path-traversal, readme]
dependency_graph:
  requires: []
  provides: [UX-02, UX-03]
  affects: [README.md, test/Utils.Tests/FileSystemTests.cs]
tech_stack:
  added: []
  patterns: [TUnit async tests, platform-correct path traversal documentation]
key_files:
  created:
    - test/Utils.Tests/FileSystemTests.cs
  modified:
    - README.md
decisions:
  - Backslash is documented as non-traversal on Linux (intentional platform-correct behavior, not a bug)
  - Linux notes section placed after How it works and before Project structure for logical flow
metrics:
  duration_minutes: 15
  completed_date: "2026-04-09"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 3 Plan 2: IsSafeFilePath Tests and Linux Notes Summary

**One-liner:** TUnit traversal tests document Linux path-correctness for IsSafeFilePath; README Linux notes section covers C# limitation, native AOT recommendation, IPC ELF availability, and removable Vortex workarounds.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create FileSystemTests.cs with IsSafeFilePath traversal tests | 461c260 | test/Utils.Tests/FileSystemTests.cs |
| 2 | Add Linux notes section to README.md | da63ad5 | README.md |

## What Was Built

### Task 1 — FileSystemTests.cs

Six TUnit tests in `test/Utils.Tests/FileSystemTests.cs` document the platform-correct behavior of `IsSafeFilePath()` on Linux:

1. `ForwardSlashTraversalIsBlocked` — `../foo` blocked (DirectorySeparatorChar on Linux is `/`)
2. `BackslashIsNotTraversalOnLinux` — `..\foo` allowed (backslash is a valid ext4 filename char, not a separator)
3. `EmbeddedForwardSlashTraversalIsBlocked` — `foo/../bar` blocked
4. `EmbeddedBackslashIsNotTraversalOnLinux` — `foo/..\\bar` allowed
5. `RootedPathIsBlocked` — `/absolute/path` blocked
6. `NormalRelativePathIsAllowed` — `Data/Textures/foo.dds` allowed

All 6 tests pass on Linux net9.0. The pre-existing FileTreeTests failures (3 tests, unrelated to this plan) are present on the upstream base and out of scope.

### Task 2 — README.md Linux Notes

Added `## Linux notes` section after `## How it works` and before `## Project structure`, covering:

- **C# script limitation** — `UnsupportedFunctionalityWarning` instruction emitted instead of crashing, with `reason` and `platform` fields
- **Recommended Linux path** — `@nexusmods/fomod-installer-native` (native AOT, no .NET runtime, XML scripts)
- **IPC on Linux** — `@nexusmods/fomod-installer-ipc` ships Linux ELF from v0.13.0+
- **Vortex workarounds** — `replaceAll("\\", "/")` at `InstallManager.ts:7923-7924` (PATH-01) and `resolvePathCase()` at `InstallManager.ts:7929` (PATH-02) can be removed after fork fixes land

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — this plan adds tests and documentation only, no new trust boundaries.

## Pre-existing Issues (Out of Scope)

Three FileTreeTests failures exist on the upstream base (`581d5a8`) and are not caused by this plan's changes:
- `ParsesInputTree` — collection count mismatch
- `CanSelectToplevel` — collection count mismatch
- `CanSelectAnywhere` — sequence contains no matching element

These are logged here for awareness. They exist before and after this plan's changes.

## Self-Check: PASSED

- `test/Utils.Tests/FileSystemTests.cs` — FOUND
- `README.md` contains `## Linux notes` — FOUND
- Commit `461c260` — FOUND (test(03-02): add IsSafeFilePath traversal tests for Linux)
- Commit `da63ad5` — FOUND (docs(03-02): add Linux notes section to README)
