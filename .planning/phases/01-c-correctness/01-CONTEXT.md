# Phase 1: C# Correctness - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Three atomic C# patches that make XML-script FOMOD installation correct on Linux:

1. **PATH-01** — Parse-time path normalization: call `TextUtil.NormalizePath(value, false, true)` on every `source` and `destination` attribute extracted from FOMOD XML in all versioned parser classes
2. **PATH-02** — Case-correct path emission: `Mod.cs` emits the real matched archive-case path in copy instructions, not the XML-verbatim path
3. **GUARD-01** — CSharpScript OS guard: gate CSharpScript type registration behind `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)` in `ModFormatManager.cs` (Dynamic adaptor only)

No TypeScript changes. No CI changes. All changes upstream-eligible to `Nexus-Mods/fomod-installer`.

</domain>

<decisions>
## Implementation Decisions

### PATH-01: Normalization call signature and scope

- **D-01:** Call `TextUtil.NormalizePath(value, false, true)` on BOTH `source` AND `destination` attributes — `toLower=true` (default) applies to both. Destination paths being lowercased is intentional: Vortex deploys through a case-insensitive overlay layer, so destination casing does not affect gameplay. Vortex's `resolvePathCase()` remains as a safety net.
- **D-02:** Parser20–50 all inherit from Parser10 (`Parser20 : Parser10` chain). The fix belongs in `Parser10.ReadFileInfo()` only — it propagates to all subclasses automatically. Do NOT patch each parser file redundantly.

### PATH-02: Archive-case emission

- **D-03:** Use approach A from PROTON-VORTEX.md — emit the matched archive-case path (real case from `ModFiles`), not the XML-specified path and not toLower normalization of source paths. After locating a file via case-insensitive match against `ModFiles`, the emitted instruction must use the `ModFiles` entry's original casing.

### GUARD-01: CSharpScript OS guard

- **D-04:** Guard goes in `ModFormatManager.cs` (Dynamic adaptor at `src/ModInstaller.Adaptor.Dynamic/`) only. The Typed adaptor (`src/ModInstaller.Adaptor.Typed/`) does not register CSharpScript at all — no change needed there.
- **D-05:** `ModFormatManager.cs` (Dynamic) registers CSharpScript in **two** code paths (main install flow ~line 47 and `GetScriptType()` ~line 119). Both registration calls must be guarded. Do not extract to a shared helper — two independent `if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))` guards keeps the diff minimal and reviewable.
- **D-06:** When CSharpScript is not registered (Linux), the existing "no script type found" fallback already emits an `UnsupportedFunctionalityWarning` instruction. Phase 1 does NOT add `reason`/`platform` fields — that is Phase 3 (UX-01). Phase 1 only prevents the Windows-assembly load crash.

### PR / Commit Strategy

- **D-07:** 3 atomic commits on `linux-port` branch — one per fix (PATH-01, PATH-02, GUARD-01). Each commit is independently PR-splittable to upstream. Commit messages reference the requirement ID for traceability.
- **D-08:** Work on `linux-port` first, then merge to `master` (per CLAUDE.md branch strategy). Do not commit planning artifacts to `linux-port`.

### Claude's Discretion

- Exact location in `Mod.cs` for the case-correct path lookup (which method / which line the real-path is returned from) — researcher should identify the specific site
- Whether to use `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)` or `!IsOSPlatform(OSPlatform.Linux)` — either is equivalent; choose whichever reads more clearly
- Ordering of the 3 atomic commits (suggested: PATH-01 → GUARD-01 → PATH-02, simplest to most complex)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Gap Analysis (primary reference)
- `PROTON-VORTEX.md` — Full root-cause analysis, exact code snippets showing the bugs, two alternative approaches for PATH-02, and Vortex mitigation workarounds that these fixes supersede. Read this before anything else.

### Requirements
- `.planning/REQUIREMENTS.md` §PATH-01, §PATH-02, §GUARD-01 — Acceptance criteria and exact call signatures

### Fix Targets
- `src/InstallScripting/XmlScript/Parsers/Parser10.cs` — Primary parser fix target (PATH-01); all other parsers inherit from this
- `src/FomodInstaller.Interface/ModInstaller/Mod.cs` — PATH-02 fix location; `GetFileList()` / `GetFiles()` return archive-case paths
- `src/ModInstaller.Adaptor.Dynamic/ModFormatManager.cs` — GUARD-01 fix location (two registration sites)

### Supporting Code
- `src/Utils/TextUtil.cs` — `NormalizePath()` implementation with full signature and behavior
- `src/InstallScripting/XmlScript/Parsers/Parser20.cs` — Confirms inheritance chain (`Parser20 : Parser10`)
- `src/ModInstaller.Adaptor.Typed/ModFormatManager.cs` — Confirm no CSharpScript registration (no change needed)
- `src/InstallScripting/Scripting/ScriptTypeRegistry.cs` — Confirm `UnsupportedFunctionalityWarning` fallback path exists

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TextUtil.NormalizePath(path, dirTerminate, alternateSeparators, toLower)` — Already correct; just needs to be called at parse time in Parser10.cs
- `UnsupportedFunctionalityWarning()` — Already exists as an instruction type; GUARD-01 relies on the existing fallback path triggering this
- `ModFiles` list in `Mod.cs` — Real archive paths with original casing; PATH-02 uses this list for the case-correct lookup

### Established Patterns
- `StringComparison.OrdinalIgnoreCase` — used throughout for case-insensitive comparisons; consistent with approach
- `TextUtil.NormalizePath(path, false, true)` — already called in `Mod.cs` `NormalizePathList()` (line 280) and `GetFile()` (line 188); PATH-01 extends this pattern to the parse boundary
- `RuntimeInformation.IsOSPlatform()` — standard .NET 9 API; appropriate for runtime OS detection in GUARD-01

### Integration Points
- Parser10.cs `ReadFileInfo()` is the single fix point for PATH-01 (all versioned parsers share it via inheritance)
- Mod.cs `GetFiles()` / `GetFileList()` already returns archive-case entries from `ModFiles`; PATH-02 fix likely in how instructions reference the source path downstream from these methods
- Dynamic adaptor is the only adaptor used by the IPC process (which can load C# scripts); Typed adaptor is AOT/XML-only and unaffected

</code_context>

<specifics>
## Specific Ideas

- PROTON-VORTEX.md §Fix section explicitly lists the exact call signature: `TextUtil.NormalizePath(value, false, true)` — use this verbatim for PATH-01
- The Vortex-side workaround `replaceAll("\\", "/")` at `InstallManager.ts:7923-7924` is unblocked once PATH-01 lands; `resolvePathCase()` at line 7929 can remain as a safety net after PATH-02 lands
- Commit message template for upstream PR readability: `fix: normalize path separators at XML parse time (Linux)`, `fix: emit archive-case path in copy instructions (Linux)`, `fix: guard CSharpScript registration to Windows only`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-c-correctness*
*Context gathered: 2026-04-09*
