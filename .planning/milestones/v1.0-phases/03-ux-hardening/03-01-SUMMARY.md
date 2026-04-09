---
phase: 03-ux-hardening
plan: 01
subsystem: api
tags: [csharp, dotnet, instruction, ipc, unsupported-warning, linux]

# Dependency graph
requires:
  - phase: 02-ipc-linux-pipeline
    provides: IPC binary build pipeline and verify-warning.spec.ts integration test scaffold
provides:
  - Instruction record with reason and platform nullable string fields
  - Three-param UnsupportedFunctionalityWarning overload alongside one-param
  - Installer.cs call site passes reason="CSharpScript not supported on Linux" and platform="linux"
  - verify-warning.spec.ts asserts exact reason and platform field values
affects:
  - 03-02
  - vortex-side UX (callers can build OS-specific user messages without hardcoding platform knowledge)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Enriched warning instructions: factory overloads carry structured diagnostic fields (reason, platform) for downstream UX"
    - "Overload-based extension: new three-param overload preserves one-param for upstream compat (D-03, D-04)"

key-files:
  created: []
  modified:
    - src/FomodInstaller.Interface/ModInstaller/Instruction.cs
    - src/ModInstaller.Adaptor.Dynamic/Installer.cs
    - src/ModInstaller.IPC.TypeScript/test/verify-warning.spec.ts

key-decisions:
  - "Keep one-param UnsupportedFunctionalityWarning overload for upstream compat — three-param is additive"
  - "reason and platform are nullable string? to preserve JSON compatibility with existing consumers"
  - "Static string values (not user input) in reason/platform fields — no PII risk per T-03-01"

patterns-established:
  - "Instruction factory overloads: add richer overload alongside existing for backward compat"

requirements-completed:
  - UX-01

# Metrics
duration: 12min
completed: 2026-04-09
---

# Phase 03 Plan 01: UnsupportedFunctionalityWarning Enrichment Summary

**UnsupportedFunctionalityWarning now carries reason="CSharpScript not supported on Linux" and platform="linux" fields so Vortex can build OS-specific user messages without hardcoding platform knowledge**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-09T00:00:00Z
- **Completed:** 2026-04-09T00:12:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `reason` and `platform` nullable string properties to `Instruction` record with updated `Equals` and `GetHashCode`
- Added three-param `UnsupportedFunctionalityWarning` overload alongside original one-param for upstream compatibility
- Updated `Installer.cs` call site to pass `"CSharpScript"`, `"CSharpScript not supported on Linux"`, `"linux"`
- Updated `verify-warning.spec.ts` to assert exact `reason` and `platform` field values on the emitted instruction

## Task Commits

Each task was committed atomically:

1. **Task 1: Add reason and platform properties to Instruction record and update call site** - `1da5986` (feat)
2. **Task 2: Update verify-warning.spec.ts to assert reason and platform fields** - `724c9f6` (test)

## Files Created/Modified

- `src/FomodInstaller.Interface/ModInstaller/Instruction.cs` — Added `reason?` and `platform?` properties, three-param overload, updated Equals/GetHashCode
- `src/ModInstaller.Adaptor.Dynamic/Installer.cs` — Updated call site to three-param overload with diagnostic strings
- `src/ModInstaller.IPC.TypeScript/test/verify-warning.spec.ts` — Added `reason`/`platform` to type annotations, exact-value assertions, updated console.log

## Decisions Made

- Kept the existing one-param `UnsupportedFunctionalityWarning(string function)` overload intact — any upstream consumers using it will not break
- Used `string?` (nullable) for `reason` and `platform` — JSON deserialization with existing consumers gracefully handles absent fields (T-03-02 accept disposition)
- Static developer-controlled strings only — no user input flows through these fields (T-03-01 accept disposition)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Both C# projects compiled with zero errors. CS8632 nullable annotation warnings on lines 158-159 of Instruction.cs are pre-existing across the codebase (no `#nullable enable` project-wide) and do not affect runtime behavior.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Instruction enrichment complete; Vortex callers can now read `reason` and `platform` from `unsupported` instructions
- Plan 03-02 (README documentation for Linux C# script limitation) can proceed independently
- No blockers

---
*Phase: 03-ux-hardening*
*Completed: 2026-04-09*

## Self-Check: PASSED

- FOUND: src/FomodInstaller.Interface/ModInstaller/Instruction.cs
- FOUND: src/ModInstaller.Adaptor.Dynamic/Installer.cs
- FOUND: src/ModInstaller.IPC.TypeScript/test/verify-warning.spec.ts
- FOUND: .planning/phases/03-ux-hardening/03-01-SUMMARY.md
- FOUND commit: 1da5986 (feat(03-01): add reason and platform fields)
- FOUND commit: 724c9f6 (test(03-01): assert reason and platform fields)
