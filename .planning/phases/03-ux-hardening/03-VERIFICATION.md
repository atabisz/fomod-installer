---
phase: 03-ux-hardening
verified: 2026-04-09T00:00:00Z
status: human_needed
score: 13/13 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run the IPC integration test: pnpm vitest run test/verify-warning.spec.ts inside src/ModInstaller.IPC.TypeScript — requires a built ModInstallerIPC ELF binary in dist/linux-x64/"
    expected: "Test passes — UnsupportedFunctionalityWarning instruction is present in result.instructions with reason='CSharpScript not supported on Linux' and platform='linux'"
    why_human: "Test is guarded by test.skipIf(!executableExists) — skips automatically when the binary is absent. Cannot verify the full round-trip IPC serialization path programmatically without running the server process."
---

# Phase 3: UX Hardening Verification Report

**Phase Goal:** Callers receive actionable, OS-specific context when C# script mods are encountered, path traversal safety is validated on Linux, and Linux limitations are documented for downstream consumers
**Verified:** 2026-04-09T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | UnsupportedFunctionalityWarning instruction carries a non-null reason string | VERIFIED | `Instruction.cs` line 158: `public string? reason { get; set; }`; three-param factory at lines 124-133 sets `reason = reason` |
| 2 | UnsupportedFunctionalityWarning instruction carries a non-null platform string | VERIFIED | `Instruction.cs` line 159: `public string? platform { get; set; }`; factory sets `platform = platform` |
| 3 | The Installer.cs call site passes all three arguments: function, reason, platform | VERIFIED | `Installer.cs` line 143: `Instruction.UnsupportedFunctionalityWarning("CSharpScript", "CSharpScript not supported on Linux", "linux")` |
| 4 | verify-warning.spec.ts asserts reason and platform fields on the emitted unsupported instruction | VERIFIED | Lines 147-148: `expect(warning!.reason).toBe('CSharpScript not supported on Linux'); expect(warning!.platform).toBe('linux')` |
| 5 | Instruction equality and hash code account for reason and platform fields | VERIFIED | `Equals` at lines 21-22: `reason == other.reason && platform == other.platform`; `GetHashCode` at lines 38-39 hashes both fields |
| 6 | IsSafeFilePath rejects forward-slash traversal ../foo on Linux | VERIFIED | `FileSystemTests.cs` `ForwardSlashTraversalIsBlocked`: asserts `IsSafeFilePath("../foo") == false`; test passes |
| 7 | IsSafeFilePath allows backslash ..\\foo on Linux because backslash is not a separator | VERIFIED | `FileSystemTests.cs` `BackslashIsNotTraversalOnLinux`: asserts `IsSafeFilePath("..\\foo") == true`; test passes |
| 8 | IsSafeFilePath rejects rooted paths on Linux | VERIFIED | `FileSystemTests.cs` `RootedPathIsBlocked`: asserts `IsSafeFilePath("/absolute/path") == false`; test passes |
| 9 | IsSafeFilePath allows normal relative paths on Linux | VERIFIED | `FileSystemTests.cs` `NormalRelativePathIsAllowed`: asserts `IsSafeFilePath("Data/Textures/foo.dds") == true`; test passes |
| 10 | README documents C# script Windows-only restriction | VERIFIED | `README.md` lines 37-38: "C# script FOMADs are not supported on Linux...emits an UnsupportedFunctionalityWarning instruction with reason and platform fields" |
| 11 | README documents native AOT package as recommended Linux path | VERIFIED | `README.md` line 39: "Recommended Linux path: Use the native AOT package (@nexusmods/fomod-installer-native)" |
| 12 | README documents IPC package Linux ELF binary from v0.13.0+ | VERIFIED | `README.md` line 41: "The IPC package (@nexusmods/fomod-installer-ipc) ships a self-contained Linux ELF binary from v0.13.0+" |
| 13 | README documents which Vortex workarounds can be removed | VERIFIED | `README.md` lines 44-46: documents `replaceAll("\\", "/")` at `InstallManager.ts:7923-7924` (PATH-01) and `resolvePathCase()` at `InstallManager.ts:7929` (PATH-02) |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/FomodInstaller.Interface/ModInstaller/Instruction.cs` | reason and platform nullable string properties, three-param UnsupportedFunctionalityWarning overload | VERIFIED | Properties at lines 158-159, three-param factory at lines 124-133, one-param preserved at lines 115-122 |
| `src/ModInstaller.Adaptor.Dynamic/Installer.cs` | Updated call site using three-param overload | VERIFIED | Line 143: full three-param call with static diagnostic strings |
| `src/ModInstaller.IPC.TypeScript/test/verify-warning.spec.ts` | TypeScript test asserting reason and platform fields | VERIFIED | Lines 147-148 assert exact field values; type annotation at line 142 includes reason and platform |
| `test/Utils.Tests/FileSystemTests.cs` | TUnit tests for IsSafeFilePath on Linux | VERIFIED | 6 TUnit tests, all pass (test run: 11 total, 8 succeeded, 3 pre-existing FileTreeTests failures) |
| `README.md` | Linux notes documentation section | VERIFIED | Section at lines 35-46, positioned after "How it works" (line 26) and before "Project structure" (line 48) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/ModInstaller.Adaptor.Dynamic/Installer.cs` | `src/FomodInstaller.Interface/ModInstaller/Instruction.cs` | UnsupportedFunctionalityWarning three-param overload call | WIRED | Exact call: `UnsupportedFunctionalityWarning("CSharpScript", "CSharpScript not supported on Linux", "linux")` at line 143 |
| `src/ModInstaller.IPC.TypeScript/test/verify-warning.spec.ts` | IPC JSON serialization | assert on deserialized instruction fields | WIRED | `warning!.reason` and `warning!.platform` assertions present; test is runtime-only (skipIf guard) |
| `test/Utils.Tests/FileSystemTests.cs` | `src/Utils/FileSystem.cs` | calls IsSafeFilePath static method | WIRED | All 6 tests call `Utils.FileSystem.IsSafeFilePath(...)` — project reference confirmed in `Utils.Tests.csproj` |

### Data-Flow Trace (Level 4)

Not applicable. This phase produces C# record properties, a TypeScript test, and documentation — no UI components rendering dynamic data. The IPC test exercises runtime data flow but requires an external process (see Human Verification).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| FomodInstaller.Interface builds clean | `dotnet build FomodInstaller.Interface.csproj --nologo -v q` | 0 errors, 7 warnings (pre-existing CS8632) | PASS |
| ModInstaller.Adaptor.Dynamic builds clean | `dotnet build ModInstaller.Adaptor.Dynamic.csproj --nologo -v q` | 0 errors, 5 warnings (pre-existing CS8632) | PASS |
| FileSystemTests all pass | `dotnet test Utils.Tests.csproj` | 8/11 pass (6 FileSystemTests + 2 FileTreeTests), 3 FileTreeTests fail (pre-existing upstream) | PASS |
| verify-warning.spec.ts runtime integration | Requires live IPC binary | Cannot test without running process | SKIP — see Human Verification |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| UX-01 | 03-01-PLAN.md | UnsupportedFunctionalityWarning carries reason and platform fields | SATISFIED | Three-param overload in Instruction.cs; call site in Installer.cs; assertions in verify-warning.spec.ts |
| UX-02 | 03-02-PLAN.md | README.md documents Linux limitations | SATISFIED | Section "## Linux notes" at README.md line 35, covers all four required areas |
| UX-03 | 03-02-PLAN.md | IsSafeFilePath unit tests cover ../  and ..\ on Linux | SATISFIED | FileSystemTests.cs exists with 6 passing TUnit tests covering both traversal sequences |

All 3 requirements declared in plan frontmatter are accounted for. All 3 phase requirements mapped in REQUIREMENTS.md traceability table are satisfied.

### Anti-Patterns Found

No anti-patterns detected in phase-modified files.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TODOs, no stubs, no placeholder returns found | — | — |

Notes:
- CS8632 nullable annotation warnings in Instruction.cs lines 158-159 are pre-existing across the codebase (no `#nullable enable` project-wide) and were already present before this phase. Not introduced by this phase.
- FileTreeTests 3 failures are pre-existing on the upstream base and confirmed present before commit `461c260`. Not caused by this phase.

### Human Verification Required

#### 1. IPC Round-Trip: UnsupportedFunctionalityWarning carries reason and platform over the wire

**Test:** With a built Linux IPC binary present at `src/ModInstaller.IPC.TypeScript/dist/linux-x64/ModInstallerIPC`, run:
```bash
cd src/ModInstaller.IPC.TypeScript
pnpm vitest run test/verify-warning.spec.ts
```

**Expected:** Test passes with output `UnsupportedFunctionalityWarning("CSharpScript") present with reason=CSharpScript not supported on Linux platform=linux`

**Why human:** The test is guarded by `test.skipIf(!executableExists)` — it skips automatically when the ELF binary is absent. The test exercises the full IPC serialization round-trip (C# JSON emit → TCP transport → TypeScript deserialization → field access). This path cannot be verified without spawning the IPC server process. Programmatic checks confirmed all code-level assertions are in place; the runtime path is the remaining gap.

### Gaps Summary

No gaps found. All 13 must-have truths are verified against the actual codebase. All 3 requirements are satisfied. All artifacts exist, are substantive, and are wired. One human verification item remains for the full IPC round-trip test.

---

_Verified: 2026-04-09T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
