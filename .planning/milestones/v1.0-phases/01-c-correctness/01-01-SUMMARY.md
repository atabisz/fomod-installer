---
phase: 01-c-correctness
plan: 01
subsystem: scripting
tags: [csharp, dotnet, path-normalization, fomod, xml-parser, linux-compat]

# Dependency graph
requires: []
provides:
  - Parse-time path normalization for FOMOD XML source/destination attributes (PATH-01)
  - Archive-case correct source path emission in copy instructions (PATH-02)
  - CSharpScript OS guard preventing TypeLoadException on Linux (GUARD-01)
affects: [02-ipc-build, 03-ux-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TextUtil.NormalizePath(value, false, true) — canonical call for XML attribute path normalization"
    - "RuntimeInformation.IsOSPlatform(OSPlatform.Windows) — positive platform guard wrapping Windows-only assembly registration"
    - "matchedFiles[0] pattern — use GetFileList() return value for archive-case path, discard XML-verbatim path after lookup"

key-files:
  created: []
  modified:
    - src/InstallScripting/XmlScript/Parsers/Parser10.cs
    - src/InstallScripting/XmlScript/XmlScriptInstaller.cs
    - src/ModInstaller.Adaptor.Dynamic/ModFormatManager.cs

key-decisions:
  - "linux-port branch created from 581d5a8 (upstream code baseline), not from docs commits — keeps upstream PR clean"
  - "Parser10.ReadFileInfo() only — fix propagates to Parser20-50 via inheritance, no duplicate edits"
  - "matchedFiles[0] used directly without NormalizeSeparators — archive paths already have correct casing and separators"
  - "Positive Windows check (IsOSPlatform.Windows) not negative Linux check — unknown platforms also skip CSharpScript safely"

patterns-established:
  - "Platform-guarded registration: wrap Windows-only assembly calls in #if block + runtime OS check"
  - "Archive-case emission: always use GetFileList() return value as copy source, not the XML-verbatim lookup path"

requirements-completed: [PATH-01, PATH-02, GUARD-01]

# Metrics
duration: 15min
completed: 2026-04-09
---

# Phase 01 Plan 01: C# Correctness Fixes Summary

**Three additive C# fixes enabling correct FOMOD installation on Linux: parse-time backslash normalization via TextUtil.NormalizePath, archive-case path emission via matchedFiles[0], and Windows-only CSharpScript registration guard via RuntimeInformation.IsOSPlatform**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-09T04:00:00Z
- **Completed:** 2026-04-09T04:11:14Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- PATH-01: Parser10.ReadFileInfo() now wraps both source and destination XML attributes in TextUtil.NormalizePath(value, false, true) — backslash paths from Windows-authored FOMODs are normalized at parse time on all platforms. Fix propagates automatically to Parser20-50 via inheritance.
- PATH-02: XmlScriptInstaller.InstallFile() now captures GetFileList() return value and uses matchedFiles[0] as the source for InstallFileFromMod — copy instructions carry the real archive-case path, eliminating case-mismatch file-not-found errors on ext4.
- GUARD-01: Both CSharpScript registration sites in Dynamic ModFormatManager.cs are wrapped in RuntimeInformation.IsOSPlatform(OSPlatform.Windows) — prevents TypeLoadException crash when USE_CSHARP_SCRIPT is defined and the installer runs on Linux.

## Task Commits

Each task was committed atomically on the `linux-port` branch:

1. **Task 1: PATH-01 — Parse-time path normalization** - `c17366b` (fix)
2. **Task 2: PATH-02 — Archive-case source path emission** - `17d3785` (fix)
3. **Task 3: GUARD-01 — CSharpScript OS guard** - `e9669a9` (fix)

**Merge commit into worktree branch:** `41aabeb` (Merge branch 'linux-port' into worktree-agent-aae84223)

## Files Created/Modified

- `src/InstallScripting/XmlScript/Parsers/Parser10.cs` — Added `using Utils;`, wrapped source and destination attribute extraction in TextUtil.NormalizePath(value, false, true)
- `src/InstallScripting/XmlScript/XmlScriptInstaller.cs` — Renamed strSource to strSourceXml, captured GetFileList() return in matchedFiles, used matchedFiles[0] as archive-case source
- `src/ModInstaller.Adaptor.Dynamic/ModFormatManager.cs` — Added `using System.Runtime.InteropServices;`, guarded both CSharpScript registration sites behind RuntimeInformation.IsOSPlatform(OSPlatform.Windows)

## Decisions Made

- Created `linux-port` branch from `581d5a8` (upstream code baseline) rather than from the docs commits (`a7f2f4f`) — keeps the branch clean for upstream PR submission with no planning artifacts
- Fixed only Parser10.ReadFileInfo() for PATH-01 — Parser20-50 inherit this method so the fix propagates automatically with zero duplicate edits
- Did not apply NormalizeSeparators to matchedFiles[0] — the archive path already has correct casing and platform-correct separators from the Mod.GetFileList() return path
- Used positive `IsOSPlatform(Windows)` check (not negative Linux check) so that unknown platforms also skip CSharpScript registration safely

## Deviations from Plan

None — plan executed exactly as written. All three edits matched the specified patterns. No unexpected blocking issues encountered.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All three Phase 1 C# correctness fixes are committed on `linux-port` and merged into the worktree branch for master integration
- PATH-01 removes the need for Vortex's `replaceAll("\\", "/")` workaround in InstallManager.ts:7923-7924
- PATH-02 reduces (but does not eliminate) the need for Vortex's `resolvePathCase()` workaround — keep as safety net per PROJECT.md
- GUARD-01 ensures Linux installations with CSharpScript mods fail gracefully (UnsupportedFunctionalityWarning) rather than crashing
- Phase 2 (IPC build pipeline) can now proceed — the blockers noted in STATE.md (GLIBC mismatch audit, chmod +x decision, Windows regression check) remain open for Phase 2 planning

## Threat Flags

No new security surface introduced. All changes are narrowing (normalize, guard, use-real-path). The T-01-04 accepted risk (../traversal not sanitized by NormalizePath) is documented in the plan's threat model and constrained by the Mod.GetFileList() archive whitelist.

## Self-Check: PASSED

- `src/InstallScripting/XmlScript/Parsers/Parser10.cs` — modified, 2 NormalizePath calls verified
- `src/InstallScripting/XmlScript/XmlScriptInstaller.cs` — modified, matchedFiles[0] verified
- `src/ModInstaller.Adaptor.Dynamic/ModFormatManager.cs` — modified, 2 OS guards verified
- Commits c17366b, 17d3785, e9669a9 exist on linux-port branch
- No collateral changes to Parser20-50, Typed adaptor, or Instruction.cs (0 diff lines)

---
*Phase: 01-c-correctness*
*Completed: 2026-04-09*
