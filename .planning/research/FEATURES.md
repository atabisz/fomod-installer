# Feature Research

**Domain:** Linux/Proton FOMOD mod installer compatibility
**Researched:** 2026-04-09
**Confidence:** HIGH (grounded in codebase, upstream PRs, and gap analysis — not generic advice)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = mod installation silently produces wrong results or crashes on Linux.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Forward-slash path output for all source/destination instructions | Linux filesystem rejects backslash as separator; wrong separator = file not found at install time | LOW | `TextUtil.NormalizePath()` already exists; fix is calling it at XML parse boundaries in all Parser*.cs files |
| Case-correct source path emission from archive | Linux ext4 is case-sensitive; emitting XML-verbatim case when archive uses different case = file not found at copy | MEDIUM | `Mod.cs` must emit matched case from archive, not XML-specified case |
| Platform-aware IPC binary resolution (no `.exe` extension on Linux) | Without this, the full IPC path (C# scripts, fallback modes) is completely broken on Linux regardless of binary presence | LOW | `BaseIPCConnection.findExecutable()` hardcodes `.exe`; derive from `process.platform` |
| Self-contained ELF binary in npm package for Linux | Users cannot be expected to install .NET runtime; current package ships only Windows `.exe` | MEDIUM | CI must publish `--self-contained -r linux-x64`; postinstall must set execute bit |
| C# script OS guard (no crash on Linux) | IPC process built without `USE_CSHARP_SCRIPT` must not attempt to load Windows assemblies on Linux | LOW | `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)` check in `ModFormatManager.cs` before registration |
| TCP transport as default (not named pipe) on Linux | Named pipes are unavailable on Linux; falling back at runtime is acceptable but TCP must be the first strategy in `ConnectionStrategy[]` for Linux callers | LOW | Architecture already supports TCP; callers must configure strategy order |
| Cross-platform process cleanup utility | `cleanup-processes.ts` uses `tasklist`/`taskkill` (Windows-only); on Linux it throws ENOENT and orphans IPC processes | LOW | Replace with `pgrep`/`kill`; it is re-exported from the public API so callers on Linux are affected |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required for basic function, but provide meaningfully better experience than silently broken installs or opaque failures.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| User-facing warning when C# script mod is installed on Linux | Vortex (and similar callers) currently silences `unsupported` instructions, giving zero feedback. Surfacing "This mod uses a C# installer script that cannot run on Linux. Some components may not have been installed." prevents user confusion about partial installs | MEDIUM | fomod-installer emits `UnsupportedFunctionalityWarning`; Vortex side needs to consume and display it. This repo's deliverable: ensure the warning instruction carries enough context (which script type, whether any files were installed anyway) for the Vortex UI to construct a useful message |
| Richer `UnsupportedFunctionalityWarning` payload | Current `Instruction.UnsupportedFunctionalityWarning()` only sets `type: "unsupported"` and `source: functionName`. A `reason` field (e.g. `"CSharpScript not supported on Linux"`) and `platform` field would let callers give OS-specific guidance | LOW | Single field addition to `Instruction.cs`; non-breaking |
| Path traversal safety validation tested on Linux | `FileSystem.IsSafeFilePath()` exists; Linux has a different `Path.GetInvalidPathChars()` set than Windows. Without Linux unit tests, traversal via `../` could silently pass the safety check | LOW | Add unit tests for `../` and `..\` on Linux; confirm guard works on both platforms |
| README documentation of Linux limitations | Users and integrators need to know: (a) C# scripts are Windows-only, (b) native package is the recommended Linux path, (c) IPC package supports Linux from vX.Y.Z onward | LOW | Documentation-only; high user value for zero implementation cost |
| SteamOS/Proton-specific notification hook | Vortex PR #22282 introduced `rejectWithSteamOSNotification` — a callback that surfaces polkit/privilege warnings to Steam Deck users. fomod-installer can support this by ensuring errors propagate cleanly with enough context for callers to differentiate Steam Deck vs generic Linux | MEDIUM | Requires coordination with Vortex-side PR; fomod-installer role is to not swallow errors that callers need to route |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| C# FOMOD script execution on Linux via Mono | Users want parity with Windows; many popular mods (Skyrim, Fallout) use C# scripts | C# FOMOD scripts reference `System.Windows.Forms`, `System.Drawing.Common`, and Windows registry APIs. These cannot be shimmed by Mono. Attempting it produces wrong conditional logic (registry reads return nothing, DLL checks always fail) — a silent partial install that is worse than an explicit "unsupported" message | Emit `UnsupportedFunctionalityWarning` and surface it to the user. If they want C# script mods, they need a Windows install |
| Runtime C# script compilation via Roslyn on Linux | Technically possible to compile C# to IL on Linux | The scripts themselves call Windows APIs at runtime; they compile but crash or silently no-op during execution. False sense of compatibility | Same as above — warn, don't attempt |
| Case-insensitive filesystem shim (e.g. kernel overlay or FUSE mount) | Removes the need to fix case in fomod-installer | Adds a system-level dependency outside fomod-installer's control; is not available on all Linux setups; breaks on Steam Deck's immutable OS | Fix case emission in `Mod.cs` (the correct location) rather than working around it system-wide |
| Auto-detect and fix all path issues at install time via Vortex-side workarounds | "Keep fomod-installer unchanged, fix everything in Vortex" | The Vortex workarounds (`replaceAll("\\", "/")`, `resolvePathCase()`) already exist and have known edge cases. They are acknowledged as temporary by the Vortex team and are blocked on fomod-installer fixes landing. Perpetuating them increases Vortex complexity indefinitely | Fix the root cause in fomod-installer (parse-time normalization + case emit) so Vortex workarounds can be removed |
| Named pipe transport on Linux | Named pipes are simpler to configure for IPC | Named pipes are not available on Linux. Attempting to use them falls back to TCP anyway, but the fallback adds latency and obscures configuration intent | Use TCP transport as the explicit first strategy in `ConnectionStrategy[]` for Linux callers. TCP is already fully supported |

---

## Feature Dependencies

```
[Self-contained ELF binary in npm package]
    └──requires──> [CI Linux runner + dotnet publish --self-contained -r linux-x64]
                       └──requires──> [chmod +x in CI before npm pack]

[Platform-aware IPC binary resolution]
    └──requires──> [Self-contained ELF binary in npm package]
    └──enhances──> [User-facing C# script warning]

[User-facing C# script warning (Vortex side)]
    └──requires──> [Richer UnsupportedFunctionalityWarning payload]
                       └──requires──> [C# script OS guard]

[Case-correct source path emission]
    └──enhances──> [Forward-slash path output]
    (both address different failure modes of the same file-not-found class of bug)

[Path traversal safety on Linux]
    └──depends on──> [Forward-slash path output]
    (traversal tests are meaningful only after normalization is in place)

[Forward-slash path output]
    └──blocks removal of──> [Vortex replaceAll("\\", "/") workaround]

[Case-correct source path emission]
    └──blocks removal of (partially)──> [Vortex resolvePathCase() workaround]
```

### Dependency Notes

- **ELF binary requires self-contained publish:** A framework-dependent binary breaks on user machines without .NET runtime installed. Self-contained flag is mandatory.
- **Platform binary resolution requires the binary to exist:** `RegularProcessLauncher.ts` platform switch is wasted code if the Linux ELF is never built and packaged.
- **User-facing warning requires richer payload:** `UnsupportedFunctionalityWarning` currently only contains `type: "unsupported"` and `source: functionName`. Callers need a `reason` and `platform` field to construct a specific, actionable message.
- **C# OS guard is prerequisite for warning correctness:** Without the OS guard, the script type may be registered and attempted on Linux before the warning path is reached.
- **Path normalization and case emission are independent fixes** targeting different failure modes (separator vs. case) but belong in the same phase since they both address silent path-based install failures.

---

## MVP Definition

### Launch With (v1 — Phase 1 Core Correctness)

Minimum changes needed for correct XML-script FOMOD installation on Linux. These are pure correctness fixes — they eliminate silent wrong installs.

- [x] Parse-time path normalization in all Parser*.cs — **without this, any mod with Windows-authored FOMOD XML installs files with wrong paths on Linux**
- [x] Case-correct source path emission in `Mod.cs` — **without this, case-mismatch mods silently fail to copy on ext4**
- [x] C# script OS guard in `ModFormatManager.cs` — **without this, a Linux IPC build with `USE_CSHARP_SCRIPT` could crash attempting to load WinForms**

### Add After Validation (v1.x — Phase 2 Build Pipeline)

Required for the IPC package to be usable on Linux at all. These don't improve existing Linux behavior — they enable a new Linux code path.

- [ ] CI Linux runner for IPC binary — trigger: needed before any Linux user can use the IPC path
- [ ] Self-contained ELF publish (`--self-contained -r linux-x64`) — trigger: same
- [ ] `chmod +x` in CI and/or postinstall script — trigger: same; without it the binary is EACCES
- [ ] `RegularProcessLauncher.ts` platform binary selection (strip `.exe` on Linux) — trigger: immediately after ELF binary is packaged
- [ ] `cleanup-processes.ts` cross-platform process kill — trigger: same phase as launcher work

### Future Consideration (v2+)

Improvements that enhance UX beyond correctness but have no direct install breakage if deferred.

- [ ] Richer `UnsupportedFunctionalityWarning` payload (reason + platform fields) — defer: requires coordinated Vortex-side UI work; not blocking correct installs
- [ ] README documentation of Linux limitations — defer: documentation polish; ship alongside a versioned release
- [ ] Path traversal safety unit tests on Linux — defer: low risk for the common case; add in a hardening pass
- [ ] SteamOS/Proton-specific notification hook — defer: requires Vortex PR coordination; complex cross-repo work

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Forward-slash path output (all parsers) | HIGH | LOW | P1 |
| Case-correct source path emission | HIGH | MEDIUM | P1 |
| C# script OS guard | HIGH | LOW | P1 |
| Platform-aware IPC binary resolution | HIGH | LOW | P1 |
| Self-contained ELF + CI Linux runner | HIGH | MEDIUM | P1 |
| `chmod +x` in CI postinstall | HIGH | LOW | P1 |
| Cross-platform process cleanup | MEDIUM | LOW | P2 |
| Richer `UnsupportedFunctionalityWarning` payload | MEDIUM | LOW | P2 |
| User-facing C# script warning (Vortex side) | HIGH | MEDIUM | P2 |
| Path traversal safety tests on Linux | MEDIUM | LOW | P2 |
| README Linux limitations documentation | MEDIUM | LOW | P2 |
| TCP as explicit first strategy for Linux callers | LOW | LOW | P3 |
| SteamOS notification hook | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for Linux FOMOD installation to work correctly
- P2: Should have — improves UX or prevents edge-case silent failures
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | MO2 on Linux | Vortex on Linux (current) | This Fork |
|---------|--------------|---------------------------|-----------|
| FOMOD XML script installation | Marked "wontfix" for native Linux (uses USVFS/Wine) | Works via native Electron + fomod-installer, with Vortex-side workarounds | Correct with this fork's path normalization + case emission fixes |
| C# FOMOD script execution | Effectively broken (FOMOD options marked "wontfix", #1844) | Silent partial install — `unsupported` instructions silently filtered | Explicit OS guard + surfaceable warning instruction |
| Path separator normalization | Not natively supported (Wine handles it) | Workaround: `replaceAll("\\", "/")` in `InstallManager.ts` — to be removed | Fixed at parse time in all parsers |
| Case-insensitive path resolution | Not natively supported | Workaround: `resolvePathCase()` scans temp dir — kept as safety net | Fixed at emit time in `Mod.cs` |
| IPC binary on Linux | N/A (no IPC architecture) | Not shipped (Windows `.exe` only) | Self-contained ELF via CI Linux runner |
| User warning for unsupported features | "wontfix" with no user message | None (silent filter) | `UnsupportedFunctionalityWarning` instruction surfaced to caller |
| Binary execute permissions | N/A | Not applicable to current `.dll` | Postinstall `chmod +x` for ELF |

---

## Gap-to-Feature Mapping

Each feature traces directly to a gap in `PROTON-VORTEX.md`.

| Gap | Feature(s) Derived | Phase |
|-----|-------------------|-------|
| Gap 1: C# script silent failure | C# OS guard, Richer `UnsupportedFunctionalityWarning`, User-facing warning (Vortex) | Phase 1 + v1.x |
| Gap 2: Path normalization at parse time | Forward-slash path output in all Parser*.cs | Phase 1 |
| Gap 3: Case normalization in instruction emit | Case-correct source path emission in `Mod.cs` | Phase 1 |
| Gap 4: IPC executable Linux build pipeline | Self-contained ELF, CI Linux runner, `chmod +x` | Phase 2 |
| Gap 5: CSharpScript runtime OS guard | C# script OS guard | Phase 1 |
| Gap 6: Path safety validation for Linux | Path traversal safety unit tests | Phase 2 / v2+ |

---

## Sources

- `PROTON-VORTEX.md` — gap analysis authored against `581d5a8` (HIGH confidence, first-party)
- `PROJECT.md` — requirements and out-of-scope constraints (HIGH confidence, first-party)
- GitHub PR #22282 `Nexus-Mods/Vortex` — "Phase 1 Linux port" (closed but contains `resolvePathCase`, backslash normalization, `rejectWithSteamOSNotification` implementation detail) — HIGH confidence, reviewed PR diff
- GitHub PR #18887 `Nexus-Mods/Vortex` — "Build with FOMOD on Linux" (merged Nov 2025) — HIGH confidence, reviewed PR files
- GitHub PR #26 `Nexus-Mods/fomod-installer` — "Linux Support" (merged Nov 2025, by Aragas) — HIGH confidence; confirms `USE_CSHARP_SCRIPT` gating approach and `net9.0` targeting
- `Nexus-Mods/fomod-installer` README — C# script limitation documented explicitly ("Windows only") — HIGH confidence
- `src/FomodInstaller.Interface/ModInstaller/Instruction.cs` — `UnsupportedFunctionalityWarning` payload structure (two fields only: `type`, `source`) — HIGH confidence, first-party
- `src/ModInstaller.Adaptor.Dynamic/ModFormatManager.cs` — C# script registration via `#if USE_CSHARP_SCRIPT` (compile-time only, no runtime OS check) — HIGH confidence, first-party
- MO2 GitHub issue #1844 — "FOMOD Options Non-Functional on Linux" closed as "wontfix" — MEDIUM confidence (confirms competitive landscape)
- `.planning/research/PITFALLS.md` — pitfalls already researched for this milestone (HIGH confidence, first-party)

---

*Feature research for: Linux/Proton FOMOD mod installer compatibility*
*Researched: 2026-04-09*
