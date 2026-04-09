# fomod-installer: Linux/Proton Compatibility Fork

## What This Is

A fork of `Nexus-Mods/fomod-installer` targeting full Linux compatibility for Vortex mod management under Steam Proton. Fixes silent C# script failures, inconsistent path normalization, case-sensitivity bugs, and missing IPC build pipeline for Linux — enabling correct FOMOD installations without Vortex-side workarounds.

## Core Value

FOMOD mods install correctly on Linux/Vortex with no silent partial installs and no Vortex-side workarounds required.

## Requirements

### Validated

<!-- All v1.0 requirements shipped -->

- ✓ XML FOMOD script parsing and execution (versions 1.0–5.0) — existing
- ✓ Dual-path architecture: Native AOT (XML-only) + IPC (.NET process, full C# support on Windows) — existing
- ✓ TCP transport fallback when Named Pipes unavailable (Linux default) — existing
- ✓ AppContainer sandbox gated to Windows via `osSupportsAppContainer()` — existing
- ✓ Native AOT `linux-x64` build via `ModInstaller.Native.csproj` — existing
- ✓ `TextUtil.NormalizePath()` utility with `alternateSeparators` support — existing
- ✓ `UnsupportedFunctionalityWarning()` instruction type for unsupported script types — existing
- ✓ Parse-time path normalization: `TextUtil.NormalizePath()` on every `source`/`destination` in all parser classes — Validated in Phase 1: C# Correctness
- ✓ Case-correct path emission: `matchedFiles[0]` (archive case) used instead of XML-verbatim path in `XmlScriptInstaller.cs` — Validated in Phase 1: C# Correctness
- ✓ CSharpScript runtime OS guard: `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)` wraps both registration sites in `ModFormatManager.cs` — Validated in Phase 1: C# Correctness
- ✓ Linux IPC CI build: matrix `build-ipc` job on ubuntu-22.04 producing self-contained ELF — Validated in Phase 2: IPC Linux Pipeline
- ✓ Platform binary selection in TypeScript launcher: `findExecutable()`/`getExecutablePaths()` resolve platform-specific path; Mono detection removed — Validated in Phase 2: IPC Linux Pipeline
- ✓ Cross-platform process cleanup: `pgrep`/`kill` on Linux, `tasklist`/`taskkill` on Windows — Validated in Phase 2: IPC Linux Pipeline
- ✓ `UnsupportedFunctionalityWarning` carries `reason` and `platform` fields for OS-specific caller UX — Validated in Phase 3: UX Hardening
- ✓ `IsSafeFilePath()` traversal tests for `../` and `..\` on Linux — Validated in Phase 3: UX Hardening
- ✓ `README.md` Linux notes: C# limitation, native AOT recommendation, IPC ELF availability, removable Vortex workarounds — Validated in Phase 3: UX Hardening

### Active

<!-- Next milestone work — not yet planned -->

(None — v1.0 complete. Next milestone TBD via `/gsd-new-milestone`.)

### Out of Scope

- C# FOMOD script execution on Linux — Windows registry APIs and System.Windows.Forms cannot run on Linux; no fix possible
- Mono support — replaced by self-contained binary approach; Mono not a supported path
- Breaking changes to public TypeScript API — upstream PRs must be merge-compatible

## Context

This is a brownfield fork of `Nexus-Mods/fomod-installer` at `581d5a8`. The full gap analysis is documented in `PROTON-VORTEX.md` in the repo root.

Architecture under Proton: Vortex runs as native Linux Electron → spawns fomod-installer (native Linux, .NET AOT or IPC process) → operates on Linux ext4 filesystem (case-sensitive). The game process is under Proton's case-insensitive layer but fomod-installer is not.

**v1.0 shipped 2026-04-09.** All 9 v1 requirements delivered across 3 phases (5 plans, 11 tasks).

**Vortex-side workarounds that can now be removed** (after fork PRs land in upstream):
- `replaceAll("\\", "/")` at `InstallManager.ts:7923-7924` — unblocked by PATH-01 (parse-time normalization)
- `resolvePathCase()` at `InstallManager.ts:7929` — unblocked by PATH-02 (archive-case emission); keep as safety net per original analysis

**Known pre-existing test failures** (out of scope, present on upstream base `581d5a8`):
- `FileTreeTests`: 3 failing tests (`ParsesInputTree`, `CanSelectToplevel`, `CanSelectAnywhere`) — collection count mismatches in upstream code, not caused by fork changes

## Constraints

- **Upstream compatibility**: All changes must be PR-splittable into small focused diffs mergeable to `Nexus-Mods/fomod-installer`
- **No .NET runtime dependency**: Native AOT path must remain self-contained (no .NET runtime install required)
- **Node.js ≥22**: Enforced by both packages' `engines` field
- **Platform**: Linux x64 primary target; Windows behavior must not regress

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Self-contained IPC binary for Linux | Removes Mono dependency; CI already builds with `net9.0` (not `net9.0-windows`) | ✓ Delivered — Phase 2 |
| Parse-time normalization (not emit-time) | Fixes the problem at the earliest point; downstream code gets clean paths | ✓ Delivered — Phase 1 |
| Emit real archive case from Mod.cs | Correct approach vs Vortex's `resolvePathCase()` workaround which scans disk | ✓ Delivered — Phase 1 |
| Fork first, PR later | Allows iterative work and testing before splitting into upstream-ready diffs | ✓ Delivered — v1.0 complete |
| Positive Windows check (`IsOSPlatform.Windows`) not negative Linux check | Unknown platforms also skip CSharpScript safely | ✓ Delivered — Phase 1 |
| Windows IPC binary stays at `dist/ModInstallerIPC.exe` (flat path) | Backward compatibility with existing consumers | ✓ Delivered — Phase 2 |
| `chmod +x` as CI step, not postinstall script | Avoids pnpm workspace postinstall complexity on consumer side | ✓ Delivered — Phase 2 |
| `pgrep -f` (not `-x`) for process detection | Avoids 15-char `/proc/comm` truncation on Linux | ✓ Delivered — Phase 2 |
| `reason`/`platform` as nullable `string?` on Instruction | JSON backward-compat with existing consumers that omit these fields | ✓ Delivered — Phase 3 |

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
*Last updated: 2026-04-09 after v1.0 milestone — all requirements validated, all phases complete.*
