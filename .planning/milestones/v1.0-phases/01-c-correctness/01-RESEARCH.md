# Phase 1: C# Correctness - Research

**Researched:** 2026-04-09
**Domain:** C# (.NET 9) FOMOD installer — path normalization, case-sensitive filesystem, runtime OS guards
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Call `TextUtil.NormalizePath(value, false, true)` on BOTH `source` AND `destination` attributes in `ReadFileInfo()` — `toLower=true` (default) applies to both. Destination lowercasing is intentional.
- **D-02:** Parser20–50 all inherit `ReadFileInfo()` from Parser10. Fix belongs in `Parser10.ReadFileInfo()` ONLY — do NOT patch each parser file redundantly.
- **D-03:** PATH-02 uses approach A — emit the matched archive-case path (real case from `ModFiles`), not the XML-specified path and not toLower normalization.
- **D-04:** GUARD-01 goes in `src/ModInstaller.Adaptor.Dynamic/ModFormatManager.cs` ONLY. Typed adaptor needs no change.
- **D-05:** Both registration calls in Dynamic `ModFormatManager.cs` must be guarded. Do NOT extract to a shared helper — two independent `if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))` guards.
- **D-06:** Phase 1 does NOT add `reason`/`platform` fields to `UnsupportedFunctionalityWarning`. That is Phase 3 (UX-01). Phase 1 only prevents the Windows-assembly load crash.
- **D-07:** 3 atomic commits on `linux-port` branch — one per fix (PATH-01, PATH-02, GUARD-01). Each is independently PR-splittable to upstream.
- **D-08:** Work on `linux-port` first, then merge to `master`.

### Claude's Discretion

- Exact location in `Mod.cs` or `XmlScriptInstaller.cs` for the case-correct path lookup
- Whether to use `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)` or `!IsOSPlatform(OSPlatform.Linux)` — choose whichever reads more clearly
- Ordering of the 3 atomic commits (suggested: PATH-01 → GUARD-01 → PATH-02)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PATH-01 | All XML parser classes call `TextUtil.NormalizePath(value, false, true)` on every `source` and `destination` attribute extracted from FOMOD XML | Fix in `Parser10.ReadFileInfo()` propagates to Parser20–50 via inheritance; exact edit site identified at lines 220–221 |
| PATH-02 | `Mod.cs` emits the matched archive-case path in copy instructions, not the XML-verbatim path | Fix site is `XmlScriptInstaller.InstallFile()` — when `GetFileList` returns exactly 1 entry, use that archive-case entry as the source path |
| GUARD-01 | CSharpScript type registration is gated behind `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)` in Dynamic `ModFormatManager.cs` | Two `#if USE_CSHARP_SCRIPT` blocks identified at lines 46–48 and 118–120; `using System.Runtime.InteropServices;` must be added |
</phase_requirements>

---

## Summary

Phase 1 requires three small, independent edits to the C# codebase — all upstream-eligible and contained to three files. The codebase is already well-structured for these changes: the normalization utility exists and is correct, the inheritance chain concentrates the parser fix to one method, and the guard pattern is idiomatic .NET 9.

**PATH-01** is a two-line addition to `Parser10.ReadFileInfo()`: wrap `strSource` and `strDest` in `TextUtil.NormalizePath(value, false, true)` after extraction from XML attributes. Because Parser20 through Parser50 all inherit `ReadFileInfo()` from Parser10, this single edit covers all versioned parsers.

**PATH-02** requires understanding where XML-specified source paths become copy instruction sources. The flow is: Parser10 stores the verbatim XML path in `InstallableFile.Source` → `XmlScriptInstaller.InstallFile()` constructs `strSource` from `ModArchive.Prefix + installableFile.Source` → calls `ModArchive.GetFileList(strSource, true, false)` → when count == 1, calls `InstallFileFromMod(strSource, strDest, ...)`. The archive-case path is available in the `GetFileList` return value (a list containing the real `ModFiles` entry). The fix: capture `GetFileList()`'s single result and use that as the source for `InstallFileFromMod` instead of the constructed `strSource`.

**GUARD-01** is a runtime `if` guard wrapping the two existing `#if USE_CSHARP_SCRIPT` blocks in `ModFormatManager.cs`. No namespace exists for `RuntimeInformation` in that file yet — `using System.Runtime.InteropServices;` must be added.

**Primary recommendation:** Fix in order PATH-01 → GUARD-01 → PATH-02 (simplest to most complex). Each commit is self-contained.

---

## Standard Stack

### Core (no new dependencies — all fixes use existing code)

| Library | Purpose | Notes |
|---------|---------|-------|
| `Utils.TextUtil.NormalizePath()` | Path normalization | Already correct; just needs calling at parse time [VERIFIED: read src/Utils/TextUtil.cs] |
| `System.Runtime.InteropServices.RuntimeInformation` | OS detection at runtime | Standard .NET 9 BCL — no NuGet package needed [VERIFIED: .NET 9 BCL] |
| `System.Runtime.InteropServices.OSPlatform` | OS identity enum | Same namespace as RuntimeInformation [VERIFIED: .NET 9 BCL] |

**No new packages to install.** All changes use existing code paths or .NET BCL types.

---

## Architecture Patterns

### Parser Inheritance Chain (PATH-01)

```
Parser10 : Parser
  └── Parser20 : Parser10
        └── Parser30 : Parser20
              └── Parser40 : Parser30
                    └── Parser50 : Parser40
```

`ReadFileInfo()` is defined in `Parser10` and not overridden in any subclass. [VERIFIED: read Parser10.cs, Parser20.cs, Parser30.cs, Parser40.cs, Parser50.cs]

**Fix scope:** One method in one file — `Parser10.ReadFileInfo()` lines 215–247.

### PATH-01 Fix Pattern

The current code extracts verbatim strings:
```csharp
// src/InstallScripting/XmlScript/Parsers/Parser10.cs — ReadFileInfo() lines 220-221
string strSource = xelFile.Attribute("source").Value;
string strDest = (xelFile.Attribute("destination") == null) ? strSource : xelFile.Attribute("destination").Value;
```

Apply normalization immediately after extraction:
```csharp
// Source: src/Utils/TextUtil.cs NormalizePath signature (VERIFIED)
string strSource = TextUtil.NormalizePath(xelFile.Attribute("source").Value, false, true);
string strDest = (xelFile.Attribute("destination") == null)
    ? strSource
    : TextUtil.NormalizePath(xelFile.Attribute("destination").Value, false, true);
```

`NormalizePath(path, dirTerminate: false, alternateSeparators: true)` converts `\` and `/` to `Path.DirectorySeparatorChar` (on Linux: `/`), trims leading/trailing separators, and lowercases (`toLower: true` is the default). [VERIFIED: read TextUtil.cs lines 73–97]

**Note:** The `alternateSeparators: true` parameter is critical — without it, `Path.AltDirectorySeparatorChar` is used as the target separator (which is also `/` on Linux), meaning backslashes from FOMOD XML would not be converted. The current implementation explicitly handles this edge case. [VERIFIED: TextUtil.cs lines 76–86]

### PATH-02 Fix Pattern

Data flow through the single-file install path: [VERIFIED: read XmlScriptInstaller.cs]

```
XmlScriptInstaller.InstallFile(installableFile, priorityOffset)
  strSource = NormalizeSeparators(Path.Combine(ModArchive.Prefix, installableFile.Source))
                                               ^-- XML-verbatim path from parser
  count = ModArchive.GetFileList(strSource, true, false).Count
  if count == 1:
    InstallFileFromMod(strSource, strDest, ...)
                       ^-- still XML-verbatim, not archive case
```

The fix: capture `GetFileList()` result, use its single entry as `strSource`:

```csharp
// XmlScriptInstaller.cs — InstallFile(), replace lines 134-140
string strSourceXml = NormalizeSeparators(Path.Combine(ModArchive.Prefix, installableFile.Source));
IList<string> matchedFiles = ModArchive.GetFileList(strSourceXml, true, false);
int count = matchedFiles.Count;
if (count == 1)
{
    string strSource = matchedFiles[0];   // archive-case path from ModFiles
    string strDest = NormalizeSeparators(installableFile.Destination);
    InstallFileFromMod(strSource, strDest, installableFile.Priority + priorityOffset);
}
```

`GetFileList()` returns entries directly from `ModFiles` (the archive's real-case path list) — confirmed in `Mod.GetFiles()` which appends entries from `ModFiles` without case modification. [VERIFIED: read Mod.cs lines 233–264]

### GUARD-01 Fix Pattern

Current state in `src/ModInstaller.Adaptor.Dynamic/ModFormatManager.cs`: [VERIFIED: read file]

```csharp
// GetRequirements() — lines 44-50
CurrentScriptTypeRegistry = new ScriptTypeRegistry();
#if USE_CSHARP_SCRIPT
CurrentScriptTypeRegistry.RegisterType(new FomodInstaller.Scripting.CSharpScript.CSharpScriptType());
#endif

// GetScriptType() — lines 117-121
CurrentScriptTypeRegistry = new ScriptTypeRegistry();
#if USE_CSHARP_SCRIPT
CurrentScriptTypeRegistry.RegisterType(new FomodInstaller.Scripting.CSharpScript.CSharpScriptType());
#endif
```

The fix wraps each `#if` block with a runtime OS check:

```csharp
// Add at top of file (not currently present):
using System.Runtime.InteropServices;

// Both registration sites become:
#if USE_CSHARP_SCRIPT
if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
{
    CurrentScriptTypeRegistry.RegisterType(new FomodInstaller.Scripting.CSharpScript.CSharpScriptType());
}
#endif
```

When CSharpScript is not registered on Linux, the existing `UnsupportedFunctionalityWarning` fallback path in `ScriptFunctionProxy.cs` already handles this gracefully — no new code required. [VERIFIED: grep found UnsupportedFunctionalityWarning at ScriptFunctionProxy.cs lines 468, 480, 559]

The `GetRequirements` method currently throws `UnsupportedException` (not `UnsupportedFunctionalityWarning`) when no script type is found — this is fine: the Dynamic adaptor's `UnsupportedException` is an internal signal, not an instruction emitted to Vortex. The guard prevents the crash during type registration; the no-script-type fallback handles the subsequent flow.

### Anti-Patterns to Avoid

- **Patching Parser20–50 directly:** All five parsers share `ReadFileInfo()` from Parser10. Adding the normalization call to each parser produces duplicate code and creates a maintenance hazard when new parser versions are added.
- **Normalizing at emit time in Mod.cs:** CONTEXT.md D-01 locks parse-time normalization. Doing it at emit time instead would fix PATH-01 symptoms but violate the stated design.
- **Adding `reason`/`platform` to `UnsupportedFunctionalityWarning` in Phase 1:** That is explicitly deferred to Phase 3 (UX-01) per D-06.
- **Using `!IsOSPlatform(OSPlatform.Linux)` in GUARD-01:** This would incorrectly allow CSharpScript on macOS and other platforms. `IsOSPlatform(OSPlatform.Windows)` is the correct positive check.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path separator conversion | Custom `Replace('\\', '/')` logic | `TextUtil.NormalizePath(path, false, true)` | Already handles double-slash collapse, trimming, toLower, and AltDirectorySeparatorChar edge case [VERIFIED: TextUtil.cs] |
| OS detection | `Environment.OSVersion` or `RuntimeEnvironment` checks | `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)` | Standard .NET 9 API; `Environment.OSVersion` is unreliable cross-platform |

---

## Common Pitfalls

### Pitfall 1: `alternateSeparators` Semantics on Linux

**What goes wrong:** Calling `NormalizePath(path, false, false)` (without `alternateSeparators: true`) on Linux does not convert backslashes from FOMOD XML, because `Path.DirectorySeparatorChar` is `/` and the code without `alternateSeparators` uses it as the target — but the `Replace('\\', targetSep)` call is only present when the method normalizes both separators explicitly.

**Why it happens:** `TextUtil.NormalizePath` has a subtlety: when `alternateSeparators: false`, `targetSep = Path.AltDirectorySeparatorChar` (which is `/` on Linux). The body still does `Replace('\\', targetSep)` unconditionally regardless of `alternateSeparators`. Reading the implementation confirms both separator replacements run in all cases. [VERIFIED: TextUtil.cs lines 82–86]

**How to avoid:** Always call `NormalizePath(value, false, true)` (with `alternateSeparators: true`) — this is the signature locked in D-01 and already used in `Mod.NormalizePathList()` and `Mod.GetFile()`.

**Warning signs:** Paths still containing `\` after normalization on Linux.

### Pitfall 2: PATH-02 Fix Location Confusion

**What goes wrong:** A developer might look for the fix in `Mod.cs` (since that's mentioned in CONTEXT.md and PROTON-VORTEX.md), but the actual emit of the XML-verbatim source path into copy instructions happens in `XmlScriptInstaller.InstallFile()`, not in `Mod.cs`.

**Why it happens:** `Mod.cs` provides `GetFileList()` which returns archive-case entries from `ModFiles`. But `XmlScriptInstaller.InstallFile()` calls `GetFileList()` only to get the count, then passes the original `strSource` (constructed from the XML path) to `InstallFileFromMod()` — discarding the archive-case path from the result list.

**How to avoid:** Fix is in `XmlScriptInstaller.InstallFile()` — capture `GetFileList()`'s return value, take `matchedFiles[0]` as the source when count == 1.

**Warning signs:** Running the installer on a case-mismatch mod still produces copy instructions with the wrong case in the source path.

### Pitfall 3: `using System.Runtime.InteropServices` Missing in Dynamic ModFormatManager

**What goes wrong:** Adding `RuntimeInformation.IsOSPlatform(...)` without adding the using statement causes a compile error.

**Why it happens:** The current `ModFormatManager.cs` in the Dynamic adaptor does not import `System.Runtime.InteropServices` — confirmed by reading the file's using block. [VERIFIED: Dynamic ModFormatManager.cs lines 1–8]

**How to avoid:** Add `using System.Runtime.InteropServices;` as the first code change to that file.

### Pitfall 4: Typed Adaptor ModFormatManager Change Not Needed

**What goes wrong:** Reflexively patching both `ModInstaller.Adaptor.Dynamic/ModFormatManager.cs` AND `ModInstaller.Adaptor.Typed/ModFormatManager.cs`.

**Why it happens:** There are two `ModFormatManager.cs` files in the repo.

**How to avoid:** The Typed adaptor's `ModFormatManager.cs` never registers `CSharpScriptType` — it only registers `XmlScriptType`. [VERIFIED: read Typed ModFormatManager.cs lines 31–32]. No change needed.

---

## Code Examples

### Current Verbatim Extraction (PATH-01 before fix)
```csharp
// Source: src/InstallScripting/XmlScript/Parsers/Parser10.cs lines 220-221 [VERIFIED]
string strSource = xelFile.Attribute("source").Value;
string strDest = (xelFile.Attribute("destination") == null) ? strSource : xelFile.Attribute("destination").Value;
```

### After PATH-01 Fix
```csharp
// NormalizePath(path, dirTerminate: false, alternateSeparators: true) — toLower: true is default
string strSource = TextUtil.NormalizePath(xelFile.Attribute("source").Value, false, true);
string strDest = (xelFile.Attribute("destination") == null)
    ? strSource
    : TextUtil.NormalizePath(xelFile.Attribute("destination").Value, false, true);
```

### Current InstallFile Single-File Path (PATH-02 before fix)
```csharp
// Source: src/InstallScripting/XmlScript/XmlScriptInstaller.cs lines 133-140 [VERIFIED]
string strSource = NormalizeSeparators(Path.Combine(ModArchive.Prefix, installableFile.Source));
int count = ModArchive.GetFileList(strSource, true, false).Count;
if (count == 1)
{
    string strDest = NormalizeSeparators(installableFile.Destination);
    InstallFileFromMod(strSource, strDest, installableFile.Priority + priorityOffset);
}
```

### After PATH-02 Fix
```csharp
string strSourceXml = NormalizeSeparators(Path.Combine(ModArchive.Prefix, installableFile.Source));
IList<string> matchedFiles = ModArchive.GetFileList(strSourceXml, true, false);
int count = matchedFiles.Count;
if (count == 1)
{
    string strSource = matchedFiles[0];  // archive-case path — real casing from ModFiles
    string strDest = NormalizeSeparators(installableFile.Destination);
    InstallFileFromMod(strSource, strDest, installableFile.Priority + priorityOffset);
}
```

### GUARD-01 — Both Registration Sites After Fix
```csharp
// Add at top: using System.Runtime.InteropServices;

// GetRequirements() and GetScriptType() — both sites become:
#if USE_CSHARP_SCRIPT
if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
{
    CurrentScriptTypeRegistry.RegisterType(new FomodInstaller.Scripting.CSharpScript.CSharpScriptType());
}
#endif
```

### Commit Message Templates (D-07)
```
fix: normalize path separators at XML parse time (Linux)
fix: guard CSharpScript registration to Windows only
fix: emit archive-case path in copy instructions (Linux)
```

---

## File Edit Map

| Requirement | File | Change |
|-------------|------|--------|
| PATH-01 | `src/InstallScripting/XmlScript/Parsers/Parser10.cs` | Wrap `strSource` and `strDest` extractions in `TextUtil.NormalizePath(..., false, true)` at lines 220–221 |
| PATH-02 | `src/InstallScripting/XmlScript/XmlScriptInstaller.cs` | Capture `GetFileList()` return, use `matchedFiles[0]` as source when count == 1 (lines 133–140) |
| GUARD-01 | `src/ModInstaller.Adaptor.Dynamic/ModFormatManager.cs` | Add `using System.Runtime.InteropServices;`, wrap both `#if USE_CSHARP_SCRIPT` registration blocks with `if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))` |

**Files that must NOT change:**
- `src/InstallScripting/XmlScript/Parsers/Parser20.cs` — inherits fix from Parser10
- `src/InstallScripting/XmlScript/Parsers/Parser30.cs` — inherits fix from Parser10
- `src/InstallScripting/XmlScript/Parsers/Parser40.cs` — inherits fix from Parser10
- `src/InstallScripting/XmlScript/Parsers/Parser50.cs` — inherits fix from Parser10
- `src/ModInstaller.Adaptor.Typed/ModFormatManager.cs` — no CSharpScript registration, no change needed
- `src/FomodInstaller.Interface/ModInstaller/Instruction.cs` — Phase 3 concern only
- `src/FomodInstaller.Interface/ModInstaller/Mod.cs` — PATH-02 fix is upstream in XmlScriptInstaller, not here

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `GetFileList()` returning 1 entry guarantees that entry is the real archive-case path from `ModFiles` | PATH-02 Fix Pattern | If `GetFiles()` transforms casing, the fix would emit a different case than expected. Risk: LOW — `Mod.GetFiles()` appends from `ModFiles` without modification [VERIFIED: Mod.cs lines 242–263] |

---

## Open Questions

1. **`NormalizeSeparators` in `XmlScriptInstaller` — redundant after PATH-01?**
   - What we know: `XmlScriptInstaller` has its own `NormalizeSeparators()` private method that converts `\` and `/` to `Path.DirectorySeparatorChar` (lines 27–31). After PATH-01 lands, parsed paths will already be normalized. `NormalizeSeparators(matchedFiles[0])` in the PATH-02 fix would be a no-op.
   - What's unclear: Whether to apply `NormalizeSeparators` to `matchedFiles[0]` or use it directly.
   - Recommendation: Do not apply `NormalizeSeparators` to `matchedFiles[0]` — the archive path is already in real case and should not be double-processed. The variable name `strSource` makes the path origin clear without an extra call.

2. **`#if USE_CSHARP_SCRIPT` compile-time vs `RuntimeInformation` runtime interaction**
   - What we know: If the build does not define `USE_CSHARP_SCRIPT`, the registration code is compiled out entirely — no runtime guard is needed for that scenario.
   - What's unclear: Whether the Linux IPC binary is ever built with `USE_CSHARP_SCRIPT` defined.
   - Recommendation: Add the guard regardless. If `USE_CSHARP_SCRIPT` is not defined, the guard is dead code; if it is defined, the guard prevents the crash. Both states are correct.

---

## Environment Availability

Step 2.6: No external tooling dependencies for Phase 1. All changes are C# source edits — no new CLI tools, services, or runtimes required beyond the .NET 9 SDK already in the project.

---

## Sources

### Primary (HIGH confidence)
- `src/InstallScripting/XmlScript/Parsers/Parser10.cs` — read; exact edit site at lines 220–221 confirmed
- `src/InstallScripting/XmlScript/Parsers/Parser20.cs` — read; inheritance `Parser20 : Parser10` confirmed, no `ReadFileInfo` override
- `src/InstallScripting/XmlScript/Parsers/Parser30.cs` — read; inheritance confirmed, no override
- `src/InstallScripting/XmlScript/Parsers/Parser40.cs` — read; inheritance confirmed, no override
- `src/InstallScripting/XmlScript/Parsers/Parser50.cs` — read; inheritance confirmed, no override
- `src/InstallScripting/XmlScript/XmlScriptInstaller.cs` — read; PATH-02 emit site at lines 133–140 confirmed
- `src/FomodInstaller.Interface/ModInstaller/Mod.cs` — read; `GetFileList`/`GetFiles` return `ModFiles` entries directly confirmed
- `src/ModInstaller.Adaptor.Dynamic/ModFormatManager.cs` — read; two `#if USE_CSHARP_SCRIPT` blocks at lines 46–48 and 118–120 confirmed; missing `using System.Runtime.InteropServices` confirmed
- `src/ModInstaller.Adaptor.Typed/ModFormatManager.cs` — read; no CSharpScript registration confirmed
- `src/Utils/TextUtil.cs` — read; `NormalizePath` signature and implementation confirmed
- `src/FomodInstaller.Interface/ModInstaller/Instruction.cs` — read; `UnsupportedFunctionalityWarning` exists at line 111 confirmed
- `src/InstallScripting/Scripting/ScriptTypeRegistry.cs` — read; registration mechanics confirmed
- `.planning/phases/01-c-correctness/01-CONTEXT.md` — read; all locked decisions extracted

---

## Metadata

**Confidence breakdown:**
- File edit sites: HIGH — all source files read, exact lines identified
- Inheritance chain: HIGH — all five parser files read
- PATH-02 fix location: HIGH — full data flow traced through XmlScriptInstaller and Mod
- GUARD-01 namespace gap: HIGH — confirmed by reading Dynamic ModFormatManager using statements
- No regressions to Typed adaptor: HIGH — read and confirmed no CSharpScript in Typed

**Research date:** 2026-04-09
**Valid until:** Stable — no external dependencies; valid until source files change
