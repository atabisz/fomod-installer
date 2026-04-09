---
phase: 02-ipc-linux-pipeline
plan: 01
subsystem: infra
tags: [github-actions, dotnet, ci, linux, ipc, matrix-build]

# Dependency graph
requires: []
provides:
  - CI matrix build-ipc job producing Windows EXE and Linux self-contained ELF
  - package-ipc job assembling both platform binaries into a single npm tarball
  - build-native linux-x64 runner pinned to ubuntu-22.04 for consistent GLIBC baseline
affects: [02-02, IPC-02, linux-port-PR]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Matrix CI pattern: strategy.matrix.include with per-platform conditional steps"
    - "Artifact split-then-assemble: platform jobs upload artifacts, packaging job downloads and assembles"

key-files:
  created: []
  modified:
    - .github/workflows/build-packages.yml

key-decisions:
  - "Windows IPC binary stays at dist/ModInstallerIPC.exe (root) for backward compatibility (D-01)"
  - "Linux IPC ELF goes to dist/linux-x64/ModInstallerIPC (new platform subdir) (D-02)"
  - "chmod +x runs as CI step on Linux runner before artifact upload, not as postinstall script (D-03)"
  - "build-ipc matrix: ubuntu-22.04 + windows-latest (D-04)"
  - "build-native linux-x64 pinned to ubuntu-22.04 for GLIBC baseline consistency (D-05)"

patterns-established:
  - "Platform matrix with include: entries mirrors build-native pattern already in workflow"
  - "Separate build/package jobs: builders upload artifacts, packager downloads and assembles tarball"

requirements-completed: [IPC-01]

# Metrics
duration: 10min
completed: 2026-04-09
---

# Phase 2 Plan 1: IPC Linux CI Matrix Build Summary

**GitHub Actions build-ipc expanded to matrix job producing Windows EXE and self-contained Linux ELF, assembled into single npm tarball by new package-ipc job**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-09T06:21:00Z
- **Completed:** 2026-04-09T06:31:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- `build-native` linux-x64 runner pinned to `ubuntu-22.04` for consistent GLIBC baseline across all Linux artifacts
- `build-ipc` expanded from single `ubuntu-latest` runner to matrix job (`ubuntu-22.04` + `windows-latest`)
- Linux self-contained ELF built with `dotnet publish -r linux-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true`, placed at `dist/linux-x64/ModInstallerIPC`
- `chmod +x` applied on Linux runner before artifact upload (no postinstall script)
- New `package-ipc` job downloads both platform artifacts, runs webpack bundle once, verifies both binaries, then `npm pack` — producing a tarball that includes both `dist/ModInstallerIPC.exe` and `dist/linux-x64/ModInstallerIPC`

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin build-native linux-x64 runner to ubuntu-22.04** - `9db05ad` (chore)
2. **Task 2: Expand build-ipc to matrix job with package-ipc step** - `5ec2eb2` (feat)

## Files Created/Modified

- `.github/workflows/build-packages.yml` - Matrix build-ipc (win32-x64 + linux-x64), new package-ipc assembly job, build-native linux-x64 pin

## Decisions Made

- Used `node build.js build-csharp` for Windows CI step (matches package.json `build-csharp` script, preserves existing behavior)
- Used `node build.js build-webpack` (with `working-directory`) in package-ipc job instead of `pnpm --filter` invocation (more explicit, avoids pnpm filter resolution in assembly job context)
- Upload artifact path uses GitHub Actions ternary expression for platform-conditional path selection

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None — this plan only modifies CI workflow YAML. No TypeScript or runtime stubs introduced.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes. CI artifact upload/download uses GitHub Actions infrastructure (T-02-01 accepted per plan threat model).

## Self-Check: PASSED

- `.github/workflows/build-packages.yml` exists and contains matrix build-ipc
- Commits `9db05ad` and `5ec2eb2` verified in git log
- YAML syntax validated via `python3 yaml.safe_load`

## Next Phase Readiness

- IPC-01 CI pipeline complete — both platform binaries will be shipped in npm tarball
- Ready for IPC-02 (Plan 02-02): TypeScript launcher platform resolution and Mono detection removal
- Windows path regression risk mitigated: Windows CI runner unchanged (`node build.js build-csharp`), EXE at same `dist/ModInstallerIPC.exe` path

---
*Phase: 02-ipc-linux-pipeline*
*Completed: 2026-04-09*
