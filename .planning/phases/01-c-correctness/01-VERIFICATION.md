---
phase: 01-c-correctness
verified: 2026-04-09T05:05:00Z
status: passed
score: 3/3 must-haves verified
overrides_applied: 0
gaps: []
deferred: []
human_verification:
  - test: "Build IPC process on Linux, run against CSharpTestCase.zip (fomod/script.cs, no ModuleConfig.xml), observe instruction list"
    expected: "An UnsupportedFunctionalityWarning instruction appears in the output; no TypeLoadException is thrown"
    result: "PASSED — runtime verified 2026-04-09 via verify-warning.spec.ts. IPC connected, Install command returned [{type:'unsupported',source:'CSharpScript'}, ...copy instructions]. Commit 28b4fe5 (linux-port), merged 1f231c7 (master). Two implementation bugs found and fixed during verification: (1) warning was discarded by Instructions reassignment in install branches — moved emit to after the if/else block; (2) backslash paths on Linux foiled Path.GetFileName — added Replace('\\\\','/') normalization before checks."
---

# Phase 01: C# Correctness Verification Report

**Phase Goal:** XML-script FOMOD installation produces correct file paths on Linux, case-mismatch mods install without silent failures, and C# script mods emit a clean warning instead of crashing
**Verified:** 2026-04-09T04:45:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | FOMOD XML with backslash paths produces forward-slash paths after Parser10.ReadFileInfo() on Linux | ✓ VERIFIED | `TextUtil.NormalizePath(xelFile.Attribute("source").Value, false, true)` at Parser10.cs:221; destination at line 224. Both attributes wrapped. |
| 2 | A case-mismatch mod (XML says `Foo.esp`, archive has `foo.esp`) emits `foo.esp` in copy instruction source | ✓ VERIFIED | `matchedFiles[0]` (archive-case path) used at XmlScriptInstaller.cs:139 via `string strSource = matchedFiles[0]`. GetFileList return captured at line 135. |
| 3 | Building with USE_CSHARP_SCRIPT on Linux does not crash — CSharpScript registration is skipped and UnsupportedFunctionalityWarning path is reached instead | ✗ FAILED | OS guard is present (ModFormatManager.cs:48, 123) and prevents TypeLoadException. However no UnsupportedFunctionalityWarning is emitted — GetScriptType returns null, HasInstallScript is false, and code falls through to BasicModInstall silently. |

**Score:** 2/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/InstallScripting/XmlScript/Parsers/Parser10.cs` | Parse-time path normalization via TextUtil.NormalizePath | ✓ VERIFIED | Contains `using Utils;` (line 8), 2 NormalizePath calls (lines 221, 224), source and destination attributes both wrapped. |
| `src/InstallScripting/XmlScript/XmlScriptInstaller.cs` | Archive-case source path in copy instructions | ✓ VERIFIED | Contains `IList<string> matchedFiles` (line 135), `string strSource = matchedFiles[0]` (line 139), `strSourceXml` variable (line 134), error messages reference `strSourceXml` (lines 146-147). |
| `src/ModInstaller.Adaptor.Dynamic/ModFormatManager.cs` | CSharpScript OS guard at both registration sites | ✓ VERIFIED (partial) | Contains `using System.Runtime.InteropServices;` (line 5), exactly 2 `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)` calls (lines 48, 123), both inside `#if USE_CSHARP_SCRIPT` blocks. Guard prevents crash. Warning emission not part of this file — gap is in Installer.cs null-ScriptType handling. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Parser10.ReadFileInfo() | TextUtil.NormalizePath() | direct call wrapping attribute extraction | ✓ WIRED | Pattern `TextUtil\.NormalizePath\(xelFile\.Attribute` found at lines 221 and 224 |
| XmlScriptInstaller.InstallFile() | ModArchive.GetFileList() | capture return value, use matchedFiles[0] as source | ✓ WIRED | `IList<string> matchedFiles = ModArchive.GetFileList(strSourceXml, true, false)` at line 135; `matchedFiles[0]` used at line 139 |
| ModFormatManager.GetRequirements() | RuntimeInformation.IsOSPlatform | runtime guard wrapping CSharpScript registration | ✓ WIRED | Pattern `RuntimeInformation\.IsOSPlatform\(OSPlatform\.Windows\)` found at lines 48 and 123 |
| ModFormatManager.GetScriptType() → null | Installer.cs null-ScriptType warning emission | (missing) | ✗ NOT_WIRED | No path from null ScriptType result to UnsupportedFunctionalityWarning instruction |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| Parser10.cs line 221 | strSource | `xelFile.Attribute("source").Value` → NormalizePath | Yes — wraps real XML attribute value | ✓ FLOWING |
| XmlScriptInstaller.cs line 139 | strSource | `matchedFiles[0]` ← `GetFileList()` ← real archive file list | Yes — archive-case path from Mod.GetFileList | ✓ FLOWING |
| ModFormatManager.cs lines 48+123 | (guard only, no data variable) | `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)` | Guard is evaluated at runtime | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Parser10.cs has exactly 2 NormalizePath calls | `grep -c "TextUtil.NormalizePath" Parser10.cs` | 2 | ✓ PASS |
| XmlScriptInstaller.cs uses matchedFiles[0] | `grep "matchedFiles\[0\]" XmlScriptInstaller.cs` | line 139 found | ✓ PASS |
| ModFormatManager.cs has exactly 2 OS guards | `grep -c "RuntimeInformation.IsOSPlatform"` | 2 | ✓ PASS |
| No collateral changes to Parser20-50 | `git diff 581d5a8..linux-port -- Parser20-50.cs` | empty diff | ✓ PASS |
| No collateral changes to Typed adaptor | `git diff 581d5a8..linux-port -- Typed/ModFormatManager.cs` | empty diff | ✓ PASS |
| No changes to Instruction.cs | `git diff 581d5a8..linux-port -- Instruction.cs` | empty diff | ✓ PASS |
| Commit c17366b exists (PATH-01) | `git cat-file -e c17366b` | exists | ✓ PASS |
| Commit 17d3785 exists (PATH-02) | `git cat-file -e 17d3785` | exists | ✓ PASS |
| Commit e9669a9 exists (GUARD-01) | `git cat-file -e e9669a9` | exists | ✓ PASS |
| All 3 fix commits reachable from master | `git log --oneline master \| grep "fix:"` | 3 commits found | ✓ PASS |
| Warning emitted when ScriptType is null on Linux | code trace through Installer.cs:99-125 | no warning path — BasicModInstall called silently | ✗ FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| PATH-01 | 01-01-PLAN.md | All XML parsers call TextUtil.NormalizePath on source/destination attributes | ✓ SATISFIED | Parser10.ReadFileInfo() wraps both attributes. Parser20-50 inherit via C# method inheritance. `using Utils;` directive present. |
| PATH-02 | 01-01-PLAN.md | Mod.cs emits archive-case path in copy instructions | ✓ SATISFIED | Implemented in XmlScriptInstaller.cs (not Mod.cs — REQUIREMENTS.md has wrong file name, but the behavior is correctly implemented). matchedFiles[0] provides archive-case path. |
| GUARD-01 | 01-01-PLAN.md | CSharpScript registration gated behind IsOSPlatform(Windows) | ✓ SATISFIED | Both registration sites in Dynamic ModFormatManager.cs guarded. Typed adaptor unchanged (no registration to guard). |

**Note on PATH-02:** REQUIREMENTS.md states "`Mod.cs` emits the matched archive-case path" but the fix is correctly in `XmlScriptInstaller.cs`. Mod.cs provides `GetFileList()` which returns archive-case paths; the fix is in how the caller uses that return value. The requirement's intent (archive-case path in copy instructions) is satisfied; the file attribution in REQUIREMENTS.md is a documentation error.

**Note on Traceability Table:** The REQUIREMENTS.md traceability table still shows PATH-01, PATH-02, GUARD-01 as "Pending" — this was not updated after implementation. This is a documentation gap, not an implementation gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/ModInstaller.Adaptor.Dynamic/ModFormatManager.cs` | 55 | `// TODO: I don't think there is a good way...` | ℹ️ Info | Pre-existing TODO from upstream baseline (581d5a8). Not introduced by this phase. No impact. |

### Human Verification Required

#### 1. C# Script FOMOD Warning Emission on Linux

**Test:** Build the IPC process on Linux with `USE_CSHARP_SCRIPT` defined. Create a test FOMOD archive containing `script.cs` (no `ModuleConfig.xml`). Run the installer against it. Inspect the returned instruction list.

**Expected:** An `UnsupportedFunctionalityWarning` instruction appears in the output; no `TypeLoadException` is thrown; the install does not proceed silently as a BasicModInstall.

**Why human:** Requires a Linux .NET 9 build environment with `USE_CSHARP_SCRIPT` preprocessor flag, a synthetic FOMOD archive, and runtime observation of the instruction list. Static analysis confirms the guard prevents the crash but cannot confirm whether the warning emission behavior matches SC-3.

---

## Gaps Summary

One gap blocking the phase goal: the GUARD-01 fix (VERIFIED artifact) prevents the `TypeLoadException` crash as required, but the code path after the guard does not emit an `UnsupportedFunctionalityWarning` instruction when a C# script FOMOD is encountered on Linux.

**Root cause:** `ModFormatManager.GetScriptType()` returns `null` when `CSharpScriptType` is not registered and the mod has `script.cs`. The caller (`Installer.cs` lines 99-125) checks `modToInstall.HasInstallScript` — which is `false` when `ScriptType` is `null` — and falls through to `BasicModInstall` with no warning added to the instruction list.

**Roadmap SC-3 says:** "emits an `UnsupportedFunctionalityWarning` instruction instead of throwing a Windows-assembly load exception."

**Actual behavior:** Does not throw (crash fixed). Does not emit warning (SC-3 partially unmet).

**Fix:** In `Installer.cs`, after `GetScriptType` returns `null` but `ScriptFilePath` is non-null (a C# script file was found in the archive), add:
```csharp
Instructions.Add(Instruction.UnsupportedFunctionalityWarning("CSharpScript"));
```
before or instead of falling through to `BasicModInstall`. Alternatively, enrich `GetScriptType` to return a sentinel type that triggers the warning.

**Not deferred:** Phase 3 (UX-01) enriches the `UnsupportedFunctionalityWarning` payload with `reason`/`platform` fields — it does not add the warning emission itself. This gap must be closed in Phase 1 (or a targeted gap-closure plan) before Phase 3 enrichment is meaningful.

---

_Verified: 2026-04-09T04:45:00Z_
_Verifier: Claude (gsd-verifier)_
