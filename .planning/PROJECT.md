# fomod-installer: Linux/Proton Compatibility Fork

## What This Is

A fork of `Nexus-Mods/fomod-installer` targeting full Linux compatibility for Vortex mod management under Steam Proton. Fixes silent C# script failures, inconsistent path normalization, case-sensitivity bugs, and missing IPC build pipeline for Linux — enabling correct FOMOD installations without Vortex-side workarounds.

## Core Value

FOMOD mods install correctly on Linux/Vortex with no silent partial installs and no Vortex-side workarounds required.

## Requirements

### Validated

<!-- Capabilities confirmed working in the existing codebase -->

- ✓ XML FOMOD script parsing and execution (versions 1.0–5.0) — existing
- ✓ Dual-path architecture: Native AOT (XML-only) + IPC (.NET process, full C# support on Windows) — existing
- ✓ TCP transport fallback when Named Pipes unavailable (Linux default) — existing
- ✓ AppContainer sandbox gated to Windows via `osSupportsAppContainer()` — existing
- ✓ Native AOT `linux-x64` build via `ModInstaller.Native.csproj` — existing
- ✓ `TextUtil.NormalizePath()` utility with `alternateSeparators` support — existing
- ✓ `UnsupportedFunctionalityWarning()` instruction type for unsupported script types — existing

### Active

<!-- Fixes and additions being built in this fork -->

- [ ] Parse-time path normalization: call `TextUtil.NormalizePath()` on every `source`/`destination` extracted from XML in all parser classes
- [ ] Case-correct path emission: emit real matched path (archive case) instead of XML-verbatim path from `Mod.cs`
- [ ] CSharpScript runtime OS guard: gate C# script registration behind `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)` check
- ✓ Linux IPC CI build: matrix `build-ipc` job on ubuntu-22.04 producing self-contained ELF — Validated in Phase 2: IPC Linux Pipeline
- ✓ Platform binary selection in TypeScript launcher: `findExecutable()`/`getExecutablePaths()` resolve platform-specific path; Mono detection removed — Validated in Phase 2: IPC Linux Pipeline
- ✓ C# script limitation documented in `README.md` for Linux users — Validated in Phase 3: UX Hardening
- ✓ Linux path edge-case unit tests for `..` traversal via `../` and `..\` sequences — Validated in Phase 3: UX Hardening

### Out of Scope

- C# FOMOD script execution on Linux — Windows registry APIs and System.Windows.Forms cannot run on Linux; no fix possible
- Mono support — replaced by self-contained binary approach; Mono not a supported path
- Breaking changes to public TypeScript API — upstream PRs must be merge-compatible

## Context

This is a brownfield fork of `Nexus-Mods/fomod-installer` at `581d5a8`. The full gap analysis is documented in `PROTON-VORTEX.md` in the repo root.

Architecture under Proton: Vortex runs as native Linux Electron → spawns fomod-installer (native Linux, .NET AOT or IPC process) → operates on Linux ext4 filesystem (case-sensitive). The game process is under Proton's case-insensitive layer but fomod-installer is not.

**Vortex-side workarounds currently in place** (to be removed after fork PRs land):
- `replaceAll("\\", "/")` on instructions in `InstallManager.ts:7923-7924` — blocked on parse-time normalization fix
- `resolvePathCase()` in `InstallManager.ts:7929` — blocked on case emit fix (keep as safety net)

## Constraints

- **Upstream compatibility**: All changes must be PR-splittable into small focused diffs mergeable to `Nexus-Mods/fomod-installer`
- **No .NET runtime dependency**: Native AOT path must remain self-contained (no .NET runtime install required)
- **Node.js ≥22**: Enforced by both packages' `engines` field
- **Platform**: Linux x64 primary target; Windows behavior must not regress

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Self-contained IPC binary for Linux | Removes Mono dependency; CI already builds with `net9.0` (not `net9.0-windows`) | ✓ Delivered — Phase 2 |
| Parse-time normalization (not emit-time) | Fixes the problem at the earliest point; downstream code gets clean paths | — Pending |
| Emit real archive case from Mod.cs | Correct approach vs Vortex's `resolvePathCase()` workaround which scans disk | — Pending |
| Fork first, PR later | Allows iterative work and testing before splitting into upstream-ready diffs | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-09 — Phase 3 complete (UX Hardening). All 3 milestone phases done. UnsupportedFunctionalityWarning now carries reason/platform fields; path traversal tests added for Linux; README Linux notes section documented.*
