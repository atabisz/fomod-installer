# Phase 3: UX Hardening - Research

**Researched:** 2026-04-09
**Domain:** C# record extension, TUnit test authoring, README documentation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**UX-01: Warning payload design**
- D-01: Add two new nullable string properties to the `Instruction` record: `reason` and `platform`. New fields on the record — not repurposed existing fields (`destination`, `value`). Callers like Vortex read `instruction.reason` and `instruction.platform` directly.
- D-02: `platform` values match `process.platform` in Node.js: `"linux"` or `"win32"`. Allows Vortex callers to do `instruction.platform === process.platform` directly without string transformation.
- D-03: New overload: `UnsupportedFunctionalityWarning(string function, string reason, string platform)`. Caller provides all three values explicitly — no platform auto-detection inside the factory method.
- D-04: The call site at `Installer.cs:143` updates to: `Instruction.UnsupportedFunctionalityWarning("CSharpScript", "CSharpScript not supported on Linux", "linux")`. The old zero-extra-param signature may remain or be removed at planner's discretion.
- D-05: `platform` carries `"linux"` — no Steam Deck vs generic Linux differentiation at C# level. STEAM-01 deferred to v2.
- D-06: `verify-warning.spec.ts` must be updated to also assert `instruction.reason` and `instruction.platform` fields are present and non-empty on the emitted `unsupported` instruction.

**UX-02: README documentation**
- D-07: New `## Linux notes` section placed after `## How it works`. Covers: C# script limitation with UnsupportedFunctionalityWarning behavior; native AOT package as recommended Linux path; IPC package ships Linux ELF from v0.13.0+; Vortex workarounds at `InstallManager.ts:7923-7924` (`replaceAll("\\", "/")`) and `InstallManager.ts:7929` (`resolvePathCase()`).

**UX-03: IsSafeFilePath tests**
- D-08: Tests document current behavior — no code fix required. On Linux, `Path.DirectorySeparatorChar` = `/` and `Path.AltDirectorySeparatorChar` = `/`, so `"..\\"` is NOT a traversal sequence and returns `true` (allowed). Current behavior is intentionally platform-correct.
- D-09: Tests go in `test/Utils.Tests/FileSystemTests.cs` — new file alongside `FileTreeTests.cs`. Use TUnit 0.73.19.

**PR / Commit Strategy**
- D-10: Work on `linux-port` branch first, then merge to `master`. Three atomic commits, one per requirement.

### Claude's Discretion

- Whether to keep the old `UnsupportedFunctionalityWarning(string function)` overload alongside the new three-param one, or replace it entirely
- Exact TUnit test attribute style (matching `FileTreeTests.cs` — use `[Test]` + `await Assert.That(...)`)
- Exact wording of the README Linux notes prose (keep it concise, no marketing)

### Deferred Ideas (OUT OF SCOPE)

- STEAM-01: Steam Deck vs generic Linux differentiation in `platform` field — requires Vortex-side Steam API integration
- Proton context enrichment: Vortex can layer `"(Steam Proton)"` onto user messages using its own environment detection
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-01 | `Instruction.UnsupportedFunctionalityWarning()` carries `reason` and `platform` fields | Instruction.cs record structure verified; new nullable properties follow flat record pattern; overload strategy documented below |
| UX-02 | `README.md` documents Linux limitations, recommended paths, and which Vortex workarounds can be removed | README structure and existing content verified; exact Vortex workaround line refs confirmed in PROTON-VORTEX.md |
| UX-03 | Unit tests for `FileSystem.IsSafeFilePath()` covering `../` and `..\` traversal on Linux | `IsSafeFilePath()` implementation read; .NET runtime behavior verified on this Linux machine; TUnit 0.73.19 confirmed |
</phase_requirements>

---

## Summary

Phase 3 is three additive, independently PR-splittable deliverables. No new capabilities are introduced — the work is enriching an existing C# record, adding unit tests for an existing utility, and writing documentation.

**UX-01** adds two nullable string properties (`reason`, `platform`) to the existing `Instruction` C# record and adds a new three-parameter overload of `UnsupportedFunctionalityWarning`. The call site in `Installer.cs` is updated. The TypeScript `verify-warning.spec.ts` test is updated to assert the new fields. The `Instruction` record has a custom `Equals`/`GetHashCode` — the new fields must be included there too.

**UX-02** adds a `## Linux notes` section to `README.md`. Content is fully specified in CONTEXT.md D-07. The placement (after `## How it works`) is locked.

**UX-03** adds `test/Utils.Tests/FileSystemTests.cs` with TUnit tests for `IsSafeFilePath()`. .NET runtime behavior has been verified on this machine: on Linux, `Path.DirectorySeparatorChar` and `Path.AltDirectorySeparatorChar` are BOTH `/` and `Path.GetInvalidPathChars()` returns only one character (null byte, 0x00). Therefore `"..\foo"` is `true` (NOT a traversal) and `"../foo"` is `false` (IS a traversal). Tests document this intentional platform-correct behavior.

**Primary recommendation:** Execute the three deliverables in order (UX-01 → UX-03 → UX-02) as three separate commits on `linux-port`. UX-01 is the most structurally complex; UX-03 and UX-02 are straightforward follow-ons.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TUnit | 0.73.19 | C# test runner | Already in Utils.Tests.csproj; `[Test]` + `await Assert.That(...)` pattern established by FileTreeTests.cs |
| Vitest | 4.1.1 | TypeScript test runner | Already in IPC package; verify-warning.spec.ts is the existing test to update |

**No new dependencies.** All tooling is already present. `[VERIFIED: Utils.Tests.csproj read directly]`

---

## Architecture Patterns

### UX-01: Instruction Record Extension

The `Instruction` C# record (`src/FomodInstaller.Interface/ModInstaller/Instruction.cs`) uses a flat property list. The custom `Equals` and `GetHashCode` methods enumerate all fields explicitly. New fields must be added to all three places: properties, `Equals`, and `GetHashCode`.

**Current record properties:**
`type`, `source`, `destination`, `section`, `key`, `value`, `data`, `priority`

**New properties to add (nullable):**
```csharp
// Source: Instruction.cs — adding after existing property declarations
public string? reason { get; set; }
public string? platform { get; set; }
```

**Current overload:**
```csharp
public static Instruction UnsupportedFunctionalityWarning(string function)
{
    return new Instruction
    {
        type = "unsupported",
        source = function,
    };
}
```

**New overload to add:**
```csharp
// Source: CONTEXT.md D-03
public static Instruction UnsupportedFunctionalityWarning(string function, string reason, string platform)
{
    return new Instruction
    {
        type = "unsupported",
        source = function,
        reason = reason,
        platform = platform,
    };
}
```

**Equals update required** — the custom `Equals` body compares all fields. New fields must be added:
```csharp
// Add to Equals() method body (after existing comparisons):
&& reason == other.reason
&& platform == other.platform
```

**GetHashCode update required:**
```csharp
// Add to GetHashCode() unchecked block:
hash = hash * 31 + (reason?.GetHashCode() ?? 0);
hash = hash * 31 + (platform?.GetHashCode() ?? 0);
```

**Call site update (`Installer.cs:143`):**
```csharp
// Before:
Instructions.Insert(0, Instruction.UnsupportedFunctionalityWarning("CSharpScript"));
// After (CONTEXT.md D-04):
Instructions.Insert(0, Instruction.UnsupportedFunctionalityWarning("CSharpScript", "CSharpScript not supported on Linux", "linux"));
```

**Decision point (Claude's Discretion):** Keep or remove the one-param overload. Keeping it is safer for upstream compatibility — other callers that use the one-param form will continue to compile. Removing it is cleaner but breaks any caller not yet updated. Recommendation: keep both overloads.

`[VERIFIED: Instruction.cs read directly]`

### UX-01: TypeScript Test Update

`verify-warning.spec.ts` currently asserts:
```typescript
const warning = result.instructions.find(
  (i: { type: string; source?: string }) =>
    i.type === 'unsupported' && i.source === 'CSharpScript',
);
expect(warning).toBeTruthy();
```

Must be updated to also assert `reason` and `platform` (CONTEXT.md D-06):
```typescript
expect(warning).toBeTruthy();
expect(warning.reason).toBeTruthy();    // non-empty string
expect(warning.platform).toBeTruthy();  // non-empty string
// Optionally stronger assertions:
expect(warning.reason).toBe('CSharpScript not supported on Linux');
expect(warning.platform).toBe('linux');
```

The type annotation on `i` will need updating too since the current type only declares `type` and `source`. `[VERIFIED: verify-warning.spec.ts read directly]`

### UX-03: TUnit Test Pattern

Reference from `FileTreeTests.cs` (TUnit 0.73.19, xunit 2.9.3 also present):

```csharp
// Source: test/Utils.Tests/FileTreeTests.cs — established pattern
using System.Linq;
using System.Threading.Tasks;

namespace Utils.Tests;

public class FileTreeTests
{
    [Test]
    public async Task ParsesInputTree()
    {
        // arrange
        var tree = new FileTree([...]);
        // assert
        await Assert.That(tree.Files).IsEquivalentTo(["toplevel.txt"]);
    }
}
```

`FileSystemTests.cs` must follow the same namespace, `[Test]` attribute, `async Task` return, and `await Assert.That(...).IsEqualTo(...)` / `await Assert.That(...).IsTrue()` pattern.

**Verified Linux behavior of `IsSafeFilePath` (results from running on this machine):**

| Input | Expected | Reason |
|-------|----------|--------|
| `"../foo"` | `false` | `..` + `/` = `..` + `DirectorySeparatorChar` → traversal blocked |
| `"..\foo"` | `true` | `\` is NOT a separator on Linux; not in `GetInvalidPathChars()`; valid filename component |
| `"foo/../bar"` | `false` | Contains `../` traversal |
| `"foo/..\bar"` | `true` | `\` is valid filename char on Linux |
| `"/absolute"` | `false` | `Path.IsPathRooted` = true |
| `"normal/path.txt"` | `true` | No invalid chars, not rooted, no traversal |

`[VERIFIED: dotnet run on this machine — net9.0]`

**Key finding:** On Linux net9.0, `Path.AltDirectorySeparatorChar` is `/` (same as `DirectorySeparatorChar`). `Path.GetInvalidPathChars()` returns exactly 1 character: `\0` (null byte). Backslash `\` is NOT in the invalid path chars set on Linux, which is why `"..\foo"` is safe.

### UX-02: README Section Structure

The README currently has these sections in order:
1. Fork notice (blockquote)
2. `# FOMOD Installer`
3. `## What this fork fixes`
4. `## How it works`
5. `## Project structure`
6. `## Requirements`
7. `## Local development with Vortex`
8. `## License`

The new `## Linux notes` section goes after `## How it works` (CONTEXT.md D-07). Content must cover all four items locked in D-07.

`[VERIFIED: README.md read directly]`

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| C# record equality | Custom equality for new fields from scratch | Follow the existing `Equals`/`GetHashCode` pattern already in the file | Pattern is established and consistent |
| Path separator introspection | Platform detection in IsSafeFilePath | Use `Path.DirectorySeparatorChar` + `Path.AltDirectorySeparatorChar` as-is | Already correct; tests document behavior, not change it |
| TUnit assertions | xunit-style `Assert.Equal` | TUnit `await Assert.That(...).IsEqualTo(...)` | TUnit is the established runner in this project |

---

## Common Pitfalls

### Pitfall 1: Forgetting Equals/GetHashCode When Adding Record Properties
**What goes wrong:** `Instruction` uses a custom `Equals`/`GetHashCode` override (not the record's auto-generated one). Adding new properties without updating those methods means two `Instruction` objects with different `reason`/`platform` values will incorrectly compare as equal.
**Why it happens:** C# `record` types auto-generate equality based on all properties ONLY when `Equals` is not overridden. This record overrides it manually.
**How to avoid:** Always search for `Equals` and `GetHashCode` when adding properties to a record or class. Add the new fields to both.
**Warning signs:** Tests comparing instruction equality pass even when `reason`/`platform` differ.

`[VERIFIED: Instruction.cs read directly — custom Equals at line 9, custom GetHashCode at line 24]`

### Pitfall 2: TUnit vs xunit API Confusion
**What goes wrong:** The `Utils.Tests.csproj` references BOTH `TUnit` 0.73.19 AND `xunit` 2.9.3. Using `Assert.Equal(expected, actual)` (xunit style) compiles but runs through xunit, not TUnit. Tests in `FileTreeTests.cs` use TUnit exclusively.
**Why it happens:** Both frameworks are present; xunit API is more familiar from training data.
**How to avoid:** Use `await Assert.That(actual).IsEqualTo(expected)` for all assertions. Use `[Test]` (TUnit) not `[Fact]` or `[Theory]` (xunit).
**Warning signs:** Tests run but don't appear in TUnit output; `async Task` without `await` inside.

`[VERIFIED: Utils.Tests.csproj and FileTreeTests.cs read directly]`

### Pitfall 3: TypeScript Type Narrowing in verify-warning.spec.ts
**What goes wrong:** The inline type `{ type: string; source?: string }` on the `find()` callback will cause TypeScript to reject `warning.reason` and `warning.platform` as unknown properties when the test tries to assert them.
**Why it happens:** The type is narrowed to only the declared fields.
**How to avoid:** Update the inline type to include `reason?: string; platform?: string`, or widen it to `Record<string, unknown>` before asserting new fields.

`[VERIFIED: verify-warning.spec.ts read directly — type annotation at line 142]`

### Pitfall 4: Backslash in `..\foo` Interpretation
**What goes wrong:** A test author might write `"..\foo"` expecting it to test backslash traversal, but on Linux this is the string containing a literal backslash followed by `foo` — which is a valid filename. The test would pass `true`, but for the wrong reason if the intent was "should be blocked."
**Why it happens:** Windows-centric mental model of `\` as separator.
**How to avoid:** The test comment must explicitly explain that `"..\foo"` returning `true` on Linux is CORRECT and intentional — `\` is not a path separator on Linux. The test documents the platform-correct behavior, not a bug.

`[VERIFIED: dotnet runtime behavior confirmed on this machine]`

---

## Code Examples

### Adding nullable properties to Instruction record
```csharp
// Source: Instruction.cs — follows existing property block pattern
public string type { get; set; }
public string source { get; set; }
public string destination { get; set; }
public string section { get; set; }
public string key { get; set; }
public string value { get; set; }
public byte[] data { get; set; }
public int priority { get; set; }
// ADD AFTER priority:
public string? reason { get; set; }
public string? platform { get; set; }
```

### FileSystemTests.cs skeleton
```csharp
// Source: test/Utils.Tests/FileSystemTests.cs (new file)
// Pattern from FileTreeTests.cs — TUnit 0.73.19
using System.Threading.Tasks;

namespace Utils.Tests;

public class FileSystemTests
{
    // Linux: '../' uses DirectorySeparatorChar '/' → traversal detected → false
    [Test]
    public async Task ForwardSlashTraversalIsBlocked()
    {
        await Assert.That(Utils.FileSystem.IsSafeFilePath("../foo")).IsEqualTo(false);
    }

    // Linux: '..\' uses backslash which is NOT a separator → treated as filename char → true
    [Test]
    public async Task BackslashTraversalIsAllowedOnLinux()
    {
        await Assert.That(Utils.FileSystem.IsSafeFilePath("..\\foo")).IsEqualTo(true);
    }

    [Test]
    public async Task RootedPathIsBlocked()
    {
        await Assert.That(Utils.FileSystem.IsSafeFilePath("/absolute/path")).IsEqualTo(false);
    }

    [Test]
    public async Task NormalRelativePathIsAllowed()
    {
        await Assert.That(Utils.FileSystem.IsSafeFilePath("Data/Textures/foo.dds")).IsEqualTo(true);
    }
}
```

---

## Runtime State Inventory

Step 2.5 SKIPPED — this is not a rename/refactor/migration phase. No runtime state to inventory.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| .NET 9 SDK | UX-01 C# changes, UX-03 tests | Yes | 9.0.115 | — |
| Node.js | UX-01 TypeScript test update | Yes (v18) | v18.19.1 | — |
| pnpm | IPC test run | Not checked | — | npm fallback |

**Note:** Node.js v18 is below the project's required v22 (enforced by `engines` field). This is a system Node.js. The project uses Volta to pin v22.22.0. Tests should be run via `pnpm vitest` inside the project (which will use Volta's Node.js), not the system Node.js.

`[VERIFIED: node --version and dotnet --version run on this machine]`

---

## Validation Architecture

`nyquist_validation` is `false` in `.planning/config.json` — validation architecture section omitted.

---

## Security Domain

Phase 3 makes no changes to authentication, session management, cryptography, or external input handling. The `IsSafeFilePath` method being tested is a security utility, but we are only adding tests that document existing behavior — no changes to the implementation.

The `reason` and `platform` fields on `Instruction` are developer-controlled strings set at call time, not user-controlled input. No injection risk.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Keeping the one-param `UnsupportedFunctionalityWarning` overload is safer for upstream compatibility | Architecture Patterns — UX-01 | If upstream has no other callers, removing it is cleaner; planner should decide |

All other claims are verified directly from the codebase or from dotnet runtime on this machine.

---

## Open Questions

1. **Keep or remove one-param overload?**
   - What we know: D-04 says "The old zero-extra-param signature may remain (or be removed) at planner's discretion"
   - What's unclear: Whether upstream has any callers beyond the one at `Installer.cs:143`
   - Recommendation: Keep both overloads. Cost is one extra method; benefit is no risk of breaking other callers.

2. **Assert exact string values or just truthy in TypeScript test?**
   - What we know: D-06 says "assert `reason` and `platform` fields are present and non-empty"
   - What's unclear: Whether stronger equality assertions are desired
   - Recommendation: Assert the exact strings (`"CSharpScript not supported on Linux"` and `"linux"`) for precision. Easy to update if the strings change.

---

## Sources

### Primary (HIGH confidence)
- `src/FomodInstaller.Interface/ModInstaller/Instruction.cs` — record structure, Equals/GetHashCode, existing UnsupportedFunctionalityWarning
- `src/ModInstaller.Adaptor.Dynamic/Installer.cs` — call site at line 143
- `src/Utils/FileSystem.cs` — IsSafeFilePath implementation
- `src/ModInstaller.IPC.TypeScript/test/verify-warning.spec.ts` — TypeScript test to update
- `test/Utils.Tests/FileTreeTests.cs` — TUnit test pattern reference
- `test/Utils.Tests/Utils.Tests.csproj` — TUnit 0.73.19 version confirmed
- `.planning/phases/03-ux-hardening/03-CONTEXT.md` — all locked decisions
- `dotnet run` on this machine (net9.0, Linux) — IsSafeFilePath behavior verified

### Secondary (MEDIUM confidence)
- `README.md` — section structure and placement for ## Linux notes
- `PROTON-VORTEX.md` — Vortex workaround line references (7923-7924, 7929)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all tooling confirmed in csproj
- Architecture: HIGH — all source files read directly; behavior verified by running dotnet
- Pitfalls: HIGH — Equals/GetHashCode trap verified from source; TUnit/xunit confusion verified from csproj; backslash behavior confirmed by runtime test

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable .NET and TUnit APIs; no moving targets)
