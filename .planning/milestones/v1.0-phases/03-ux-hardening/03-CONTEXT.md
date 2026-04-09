# Phase 3: UX Hardening - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Three additive deliverables that make the Linux fork production-ready for callers:

1. **UX-01** — Enrich `Instruction.UnsupportedFunctionalityWarning()` with new `reason` and `platform` fields so callers can build OS-specific user messages
2. **UX-02** — Add a `## Linux notes` section to `README.md` documenting C# limitations, recommended paths, and which Vortex workarounds unblock
3. **UX-03** — Write C# unit tests in `test/Utils.Tests/` for `FileSystem.IsSafeFilePath()` covering `../` and `..\` traversal sequences on Linux

No new capabilities beyond these three requirements. All changes upstream-eligible.

</domain>

<decisions>
## Implementation Decisions

### UX-01: Warning payload design

- **D-01:** Add two new nullable string properties to the `Instruction` record: `reason` and `platform`. New fields on the record — not repurposed existing fields (`destination`, `value`). Callers like Vortex read `instruction.reason` and `instruction.platform` directly.
- **D-02:** `platform` values match `process.platform` in Node.js: `"linux"` or `"win32"`. This allows Vortex callers to do `instruction.platform === process.platform` directly without string transformation.
- **D-03:** New overload: `UnsupportedFunctionalityWarning(string function, string reason, string platform)`. Caller provides all three values explicitly — no platform auto-detection inside the factory method.
- **D-04:** The one call site (`Installer.cs:143`) updates to: `Instruction.UnsupportedFunctionalityWarning("CSharpScript", "CSharpScript not supported on Linux", "linux")`. The old zero-extra-param signature may remain (or be removed) at planner's discretion — the important thing is the new overload exists and the call site is updated.
- **D-05:** `platform` carries `"linux"` — fomod-installer cannot distinguish Steam Deck vs generic Linux vs Proton context at the C# level (all appear as Linux). Vortex adds Proton-specific context from its own environment. STEAM-01 (Steam Deck differentiation) is deferred to v2.
- **D-06:** `verify-warning.spec.ts` must be updated to also assert `instruction.reason` and `instruction.platform` fields are present and non-empty on the emitted `unsupported` instruction.

### UX-02: README documentation

- **D-07:** New `## Linux notes` section placed after `## How it works`. Covers all four content areas selected:
  - C# script FOMADs are not supported on Linux — an `UnsupportedFunctionalityWarning` is emitted instead of a crash
  - Native AOT package (`@nexusmods/fomod-installer-native`) is the recommended Linux path — lighter, no .NET runtime, XML scripts only
  - IPC package (`@nexusmods/fomod-installer-ipc`) ships a Linux ELF binary from v0.13.0+ — IPC path works on Linux but C# scripts still do not run
  - Vortex workarounds that can be removed after this fork lands: `replaceAll("\\", "/")` at `InstallManager.ts:7923-7924` and `resolvePathCase()` at `InstallManager.ts:7929` (with file/line references)

### UX-03: IsSafeFilePath tests

- **D-08:** Tests document current behavior — no code fix required. On Linux, `Path.DirectorySeparatorChar` = `/`, so `"..\\"` (literal backslash) is a valid filename component on ext4, not a directory traversal. Current behavior is intentionally platform-correct:
  - `"../foo"` → `false` (blocked — Linux traversal)
  - `"..\\foo"` → `true` (allowed — `\` is not a separator on Linux)
  - Rooted paths → `false`
  - Normal relative paths → `true`
- **D-09:** Tests go in `test/Utils.Tests/FileSystemTests.cs` — new file in the existing C# Utils.Tests project alongside `FileTreeTests.cs`. Same TUnit test framework already in use.

### PR / Commit Strategy

- **D-10:** Work on `linux-port` branch first, then merge to `master` (per CLAUDE.md). Three deliverables → three atomic commits, one per requirement (UX-01, UX-02, UX-03), each independently PR-splittable.

### Claude's Discretion

- Whether to keep the old `UnsupportedFunctionalityWarning(string function)` overload alongside the new three-param one, or replace it entirely
- Exact TUnit test attribute style (matching `FileTreeTests.cs` — use `[Test]` + `await Assert.That(...)`)
- Exact wording of the README Linux notes prose (keep it concise, no marketing)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §UX-01, §UX-02, §UX-03 — Acceptance criteria and exact field names

### Fix Targets
- `src/FomodInstaller.Interface/ModInstaller/Instruction.cs` — UX-01: Add `reason` and `platform` fields; add new `UnsupportedFunctionalityWarning` overload
- `src/ModInstaller.Adaptor.Dynamic/Installer.cs` — UX-01: Update call site at line 143
- `src/Utils/FileSystem.cs` — UX-03: `IsSafeFilePath()` implementation being tested
- `README.md` — UX-02: Add `## Linux notes` section

### New Files
- `test/Utils.Tests/FileSystemTests.cs` — UX-03: New test file (doesn't exist yet)

### Existing Tests to Update
- `src/ModInstaller.IPC.TypeScript/test/verify-warning.spec.ts` — UX-01: Update to also assert `reason` and `platform` fields on the emitted `unsupported` instruction

### Existing Test Structure (reference)
- `test/Utils.Tests/FileTreeTests.cs` — TUnit test pattern to follow for UX-03

### Context (Vortex workarounds)
- `PROTON-VORTEX.md` — Full root-cause analysis; Vortex workaround locations at `InstallManager.ts:7923-7924` and `7929`

### Prior Phase Context
- `.planning/phases/01-c-correctness/01-CONTEXT.md` — D-06 explicitly deferred reason/platform fields to Phase 3; branch strategy and commit style
- `.planning/phases/02-ipc-linux-pipeline/02-CONTEXT.md` — platform guard pattern (`process.platform !== 'win32'`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Instruction` record (`Instruction.cs`) — `public record Instruction` with properties `type`, `source`, `destination`, `section`, `key`, `value`, `data`, `priority`. Adding `reason` and `platform` as new nullable string properties follows the existing flat structure.
- `UnsupportedFunctionalityWarning(string function)` factory — currently sets `type = "unsupported"`, `source = function`. New overload adds `reason` and `platform` population.
- `test/Utils.Tests/FileTreeTests.cs` — TUnit v0.x style: `[Test]`, `async Task`, `await Assert.That(...).IsEquivalentTo(...)`. FileSystemTests.cs should match this style.

### Established Patterns
- `process.platform !== 'win32'` guard — used throughout TypeScript IPC module; `platform = "linux"` string value aligns with this convention
- Three-param overload strategy — minimal change; existing callers using the one-param overload may break if removed, so keeping or defaulting is safer upstream

### Integration Points
- `Installer.cs:143` is the only call site for `UnsupportedFunctionalityWarning` in C# — confirmed by grep
- `verify-warning.spec.ts` is the only TypeScript test that checks `unsupported` instruction fields — must be updated to assert new fields
- `FileSystem.IsSafeFilePath()` has no existing C# unit tests — `FileSystemTests.cs` is the first

</code_context>

<specifics>
## Specific Ideas

- The new `Instruction` properties should be nullable (`string?`) so copy/mkdir/other instructions don't carry spurious null values that serializers might reject
- Phase 1 D-06 exact quote: "Phase 1 does NOT add `reason`/`platform` fields — that is Phase 3 (UX-01). Phase 1 only prevents the Windows-assembly load crash." This phase is the direct continuation of that decision.
- REQUIREMENTS.md §UX-01 exact language: "carries a `reason` string (e.g. `\"CSharpScript not supported on Linux\"`) and a `platform` field that callers can use to build OS-specific user messages"
- For README, the Vortex workaround lines to reference: `replaceAll("\\", "/")` at `InstallManager.ts:7923-7924` (unblocked by PATH-01), `resolvePathCase()` at `InstallManager.ts:7929` (can remain as safety net after PATH-02)

</specifics>

<deferred>
## Deferred Ideas

- **STEAM-01 (v2)**: Steam Deck vs generic Linux differentiation in `platform` field — requires Vortex-side Steam API integration, not feasible from fomod-installer alone. Already tracked in REQUIREMENTS.md v2.
- **Proton context enrichment**: Vortex can layer `"(Steam Proton)"` onto the user message using its own environment detection (`STEAM_COMPAT_DATA_PATH` etc.) — out of scope for this fork.

</deferred>

---

*Phase: 03-ux-hardening*
*Context gathered: 2026-04-09*
