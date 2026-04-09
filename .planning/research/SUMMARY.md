# Project Research Summary

**Project:** fomod-installer Linux/Proton compatibility fork
**Domain:** .NET library Linux porting + Node.js npm binary packaging + GitHub Actions cross-platform CI
**Researched:** 2026-04-09
**Confidence:** HIGH

## Executive Summary

This project is a targeted compatibility fork of the `@nexusmods/fomod-installer` packages to enable correct FOMOD mod installation on Linux under Vortex/Proton. The codebase already has the bones of cross-platform support — a conditional `net9.0` TFM, `TCPTransport`, and partially working path utilities — but six concrete gaps remain that collectively make Linux FOMOD installation either silently wrong or completely non-functional. Research confirms all gaps are well-understood, all fixes are low-risk, and the required technologies are already in use elsewhere in the repo.

The recommended approach is a strict two-phase delivery. Phase 1 fixes correctness at the C# level: parse-time path normalization across all versioned XML parsers, case-correct source path emission in `Mod.cs`, and a C# script OS guard in `ModFormatManager.cs`. These changes make XML-script FOMOD installation produce correct results on Linux without touching the build pipeline at all. Phase 2 builds and ships the self-contained Linux IPC binary: CI matrix expansion, `dotnet publish --self-contained -r linux-x64`, `chmod +x` handling, and TypeScript platform binary resolution. Together, the two phases make both the native package path and the IPC package path fully functional on Linux.

The primary risks are CI-specific: the GitHub Actions artifact round-trip strips execute permissions from ELF binaries (fix: `chmod +x` before `npm pack`), `ubuntu-latest` resolves to Ubuntu 24.04 (GLIBC 2.39) which breaks on older distros (fix: pin to `ubuntu-22.04`), and the path normalization fix must cover all versioned Parser*.cs files — not just the two named in `PROTON-VORTEX.md` — or mods using newer FOMOD format versions will still silently fail. None of these risks require novel solutions; they are known patterns with established mitigations.

---

## Key Findings

### Recommended Stack

The entire stack is already present in the repository. No new npm packages or toolchain installs are required. The change is entirely additive: CI workflow expansion, `dotnet publish` flag additions, and targeted TypeScript/C# edits.

**Core technologies:**
- **.NET 9 SDK + `dotnet publish -r linux-x64 --self-contained true`** — produces a self-contained ELF binary (~30-45 MB with compression); eliminates the Mono dependency that is the root cause of Gap #4
- **`PublishSingleFile=true` + `PublishTrimmed=true` + `EnableCompressionInSingleFile=true`** — bundles all .NET runtime deps into one ELF file; these flags are already present (but commented out) in `ModInstaller.IPC.csproj`
- **`ubuntu-22.04` GitHub Actions runner** — GLIBC 2.35 floor; binaries run on Ubuntu 22.04+, Arch/SteamOS, and Fedora; avoids the GLIBC mismatch pitfall triggered by `ubuntu-latest` (currently Ubuntu 24.04 / GLIBC 2.39)
- **`process.platform` + `process.arch` binary resolution in `BaseIPCConnection`** — single-package, runtime-selection pattern; matches the `prebuilds/{platform}/` convention already used by the native package; no `optionalDependencies` split required (controlled Vortex consumer, not a general npm package)
- **Existing `actions/upload-artifact@v4` / `actions/download-artifact@v4`** — same artifact round-trip pattern already used by `build-native`; just needs a `chmod +x` step added before `npm pack`

**What NOT to use:**
- `PublishAot=true` — the IPC project uses `ModInstaller.Adaptor.Dynamic` which has reflection-heavy code; AOT will emit trimming warnings and may produce a broken binary
- `ubuntu-latest` for the Linux binary runner — silently breaks on a GLIBC version bump
- Mono fallback — must become unreachable dead code, not a happy path

### Expected Features

**Must have (table stakes — Phase 1):**
- Forward-slash path output in all Parser*.cs — without this, any mod with Windows-authored FOMOD XML installs files with wrong paths on ext4
- Case-correct source path emission in `Mod.cs` — without this, case-mismatch mods silently fail to copy on Linux
- C# script OS guard in `ModFormatManager.cs` — prevents crash when IPC is built with `USE_CSHARP_SCRIPT` on Linux
- Self-contained ELF binary in IPC npm package — without this, the IPC code path is completely broken on Linux regardless of other fixes
- Platform-aware IPC binary resolution (no `.exe` on Linux) — prerequisite for any Linux IPC use
- `chmod +x` in CI before `npm pack` — binary is `EACCES` without it

**Must have (table stakes — Phase 2):**
- CI Linux runner for IPC binary build
- Cross-platform `cleanup-processes.ts` (replace `tasklist`/`taskkill` with `pgrep`/`kill`) — currently throws `ENOENT` on Linux; re-exported from the public API so all callers are affected

**Should have (competitive differentiators — v1.x):**
- Richer `UnsupportedFunctionalityWarning` payload (add `reason` + `platform` fields) — allows Vortex to construct actionable user-facing messages for C# script mods
- User-facing C# script warning surfaced through Vortex UI — converts silent partial installs into explicit, informative failures
- Path traversal safety unit tests on Linux — validates that `FileSystem.IsSafeFilePath()` handles `../` on ext4

**Defer (v2+):**
- SteamOS/Proton-specific notification hook (`rejectWithSteamOSNotification`) — requires cross-repo Vortex PR coordination
- README documentation of Linux limitations — documentation polish; ship alongside a versioned release
- TCP as explicit first strategy for Linux callers — architecture already works; configuration improvement only

### Architecture Approach

The system uses two independent npm packages: `@nexusmods/fomod-installer-ipc` (Node.js TypeScript wrapper that spawns a self-contained .NET IPC process over TCP) and `@nexusmods/fomod-installer-native` (Node-API addon backed by a Native AOT `.so`). Both packages already ship platform-specific prebuilds using a `{platform}-{arch}` subdirectory convention. The IPC package needs to adopt the same subdirectory layout (`dist/linux-x64/ModInstallerIPC`) that the native package already uses (`prebuilds/linux-x64/modinstaller.napi.node`). The TypeScript changes required are minimal: `BaseIPCConnection.getExecutablePaths()` needs platform detection, and `cleanup-processes.ts` needs cross-platform process commands.

**Major components:**
1. **`BaseIPCConnection.getExecutablePaths()`** — derives binary path from `process.platform` + `process.arch`; returns `dist/linux-x64/ModInstallerIPC` on Linux, `dist/win32-x64/ModInstallerIPC.exe` on Windows; legacy flat path kept as fallback for one release cycle
2. **`RegularProcessLauncher`** — already conditionally branches on `process.platform`; the existing `.endsWith('.exe')` guard correctly skips Mono wrapping when the ELF path is passed; no code change needed here — the fix lives in `getExecutablePaths()`
3. **GitHub Actions `build-ipc` matrix** — expands to two runners (`windows-latest`, `ubuntu-22.04`); each produces a self-contained single-file binary; `package-ipc` job downloads both artifacts, adds `chmod +x`, then runs `npm pack`
4. **Parser*.cs files (all versions)** — add `TextUtil.NormalizePath()` call at every `source` and `destination` attribute extraction; must cover all versioned parsers, not just Parser10.cs and Parser20.cs
5. **`Mod.cs` case emit** — emit archive-matched case rather than XML-verbatim case for source paths; fixes the second class of silent path-based install failure

### Critical Pitfalls

1. **Hardcoded `.exe` in `BaseIPCConnection.findExecutable()`** — even with a correctly built ELF binary in `dist/`, `findExecutable()` will always throw "Executable not found" on Linux because it passes the literal `'ModInstallerIPC.exe'` to `getExecutablePaths()`. Fix: derive filename from `process.platform` before constructing paths. Also fix the same hardcoding in `ModInstaller.ipc.spec.ts`.

2. **ELF binary loses execute permission through CI artifact round-trip** — `actions/upload-artifact` / `actions/download-artifact` does not preserve POSIX permissions. A binary uploaded with `0755` is downloaded with `0644`. Spawning it produces `EACCES`. Fix: add `chmod +x dist/linux-x64/ModInstallerIPC` in the `package-ipc` job after `download-artifact`, before `npm pack`. Optionally add a postinstall script as belt-and-suspenders.

3. **`ubuntu-latest` runner causes GLIBC mismatch** — `ubuntu-latest` currently resolves to Ubuntu 24.04 (GLIBC 2.39). Binaries built there fail on Ubuntu 22.04 (GLIBC 2.35) and possibly on some SteamOS versions. Fix: pin to `ubuntu-22.04` explicitly. The existing `build-native` job may have the same exposure and should be audited.

4. **Partial parser fix (only Parser10.cs and Parser20.cs)** — fixing only the two parsers named in `PROTON-VORTEX.md` leaves Parser 3.x–5.x emitting raw backslashes; Nexus-uploaded mods using newer FOMOD format versions will continue to produce broken paths on Linux silently. Fix: audit the full `src/InstallScripting/XmlScript/Parsers/` directory and apply `NormalizePath()` to all Parser*.cs files in one commit.

5. **`cleanup-processes.ts` throws `ENOENT` on Linux** — `tasklist` and `taskkill` are Windows-only binaries. This module is re-exported from the package's public API. Any Linux caller (including Vortex) that invokes `findStuckProcesses()` gets an unhandled rejection, and orphaned IPC processes accumulate across restarts. Fix: replace with `pgrep`/`kill` behind a `process.platform` guard.

---

## Implications for Roadmap

Based on the research, a two-phase delivery with a clear dependency boundary is the correct structure. Phase 1 has zero CI risk (pure C# + TypeScript edits, testable locally) and unblocks verification of the XML-script path on Linux before Phase 2 adds the IPC binary complexity.

### Phase 1: C# Correctness Fixes

**Rationale:** These changes require no CI pipeline changes, no binary packaging, and no .NET runtime on the test machine. They fix the two most common FOMOD installation failure modes on Linux (wrong path separator, wrong case) and add the OS guard that prevents crashes in edge-case IPC builds. They are pure code changes that can be reviewed, tested, and merged independently of the binary packaging work.

**Delivers:** XML-script FOMOD installation produces correct file paths on Linux. Case-mismatch mods install correctly. C# script mods emit a clean `UnsupportedFunctionalityWarning` rather than crashing the IPC process.

**Addresses (from FEATURES.md):**
- Forward-slash path output in all Parser*.cs (P1)
- Case-correct source path emission in `Mod.cs` (P1)
- C# script OS guard in `ModFormatManager.cs` (P1)

**Avoids (from PITFALLS.md):**
- Pitfall 7: partial parser fix — enumerate all Parser*.cs before writing
- Pitfall 6: `NativeOutputDir` backslash in MSBuild — fix in the same pass
- Pitfall 8: `InvariantGlobalization` + `CurrentCulture` — code review gate for new C# code

### Phase 2: IPC Build Pipeline + Platform Binary Selection

**Rationale:** The IPC binary must exist before any TypeScript platform-selection code is useful. The CI pipeline work (matrix expansion, self-contained publish, artifact handling) is the prerequisite for the TypeScript changes. Both are grouped here because they ship together in the same npm package version.

**Delivers:** A fully functional Linux IPC path. `@nexusmods/fomod-installer-ipc` contains a self-contained ELF at `dist/linux-x64/ModInstallerIPC` with correct execute permissions. `BaseIPCConnection` resolves the correct binary for the current platform. `cleanup-processes.ts` works on Linux without throwing.

**Uses (from STACK.md):**
- `dotnet publish -r linux-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true`
- `ubuntu-22.04` runner (pinned, not `ubuntu-latest`)
- `actions/upload-artifact@v4` + `actions/download-artifact@v4` with explicit `chmod +x`

**Implements (from ARCHITECTURE.md):**
- `dist/{platform}/` subdirectory layout in IPC package
- `getExecutablePaths()` platform detection
- GitHub Actions `build-ipc` matrix + `package-ipc` assembly job

**Avoids (from PITFALLS.md):**
- Pitfall 1: hardcoded `.exe` in `findExecutable()`
- Pitfall 2: ELF loses execute permission in CI artifact round-trip
- Pitfall 3: `dotnet publish` without `--self-contained -r linux-x64`
- Pitfall 4: GLIBC version mismatch from `ubuntu-latest`
- Pitfall 5: `cleanup-processes.ts` Windows-only commands

### Phase 3: UX Hardening + Documentation

**Rationale:** These improvements require Phase 1 and Phase 2 to be stable before they deliver value. The `UnsupportedFunctionalityWarning` enrichment requires coordination with Vortex-side PR work. Path traversal tests require path normalization to already be correct so the tests are meaningful.

**Delivers:** Actionable user-facing messages for C# script mods. Validated path traversal safety on Linux. Developer documentation of Linux limitations.

**Addresses (from FEATURES.md):**
- Richer `UnsupportedFunctionalityWarning` payload (P2)
- Path traversal safety unit tests on Linux (P2)
- README documentation of Linux limitations (P2)

### Phase Ordering Rationale

- Phase 1 before Phase 2: C# correctness bugs affect the native package path which already ships on Linux. They can be shipped and validated without any binary packaging work. Separating them reduces CI risk in Phase 2.
- Phase 2 self-contained: all IPC binary work ships atomically — CI changes, TypeScript launcher changes, and `cleanup-processes.ts` fix must land together because they collectively enable the Linux IPC code path.
- Phase 3 after both: warning enrichment requires Phase 1 OS guard to exist; traversal tests require Phase 1 normalization; documentation should describe the final shipped state.
- The dependency chain from FEATURES.md confirms this order: `Self-contained ELF → Platform binary resolution → Richer warning payload → User-facing warning`.

### Research Flags

Phases with standard patterns (skip additional research-phase):
- **Phase 1:** All C# changes are direct, well-scoped edits to existing utility call sites. `TextUtil.NormalizePath()` already exists; the work is identifying every call site. The MSBuild backslash fix is a single-line XML change.
- **Phase 2:** The `dotnet publish` flags, CI matrix pattern, and TypeScript platform resolution are all fully documented in STACK.md and ARCHITECTURE.md with exact code. No unknowns remain.
- **Phase 3:** `UnsupportedFunctionalityWarning` payload addition is a single field addition to `Instruction.cs`. Documentation and test additions need no research.

No phase requires deeper research during planning. All implementation decisions are resolved in the existing research files.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All flags verified against official .NET CLI docs; CI patterns verified against runner-images README; no novel toolchain required |
| Features | HIGH | All features traced directly to `PROTON-VORTEX.md` gaps and confirmed against codebase source files; competitor landscape (MO2, Vortex PRs) also verified |
| Architecture | HIGH | Based on direct codebase inspection of all affected files plus established npm binary packaging patterns; no assumptions about undocumented behavior |
| Pitfalls | HIGH | All pitfalls grounded in actual code paths (not generic advice); `upload-artifact` permission loss is a documented GitHub Actions known limitation |

**Overall confidence:** HIGH

### Gaps to Address

- **GLIBC floor for `build-native` job:** The existing Linux native package may already have a GLIBC mismatch if `build-native` also uses `ubuntu-latest`. Audit `build-packages.yml` for the `build-native` runner version before Phase 2 ships. If `ubuntu-latest`, pin it in the same PR.
- **`chmod +x` vs postinstall strategy:** Research recommends `chmod +x` in CI as primary + postinstall as belt-and-suspenders. The final decision (CI-only vs both) should be made during Phase 2 implementation based on whether Vortex's pnpm workspace configuration suppresses `postinstall` scripts.
- **Windows regression testing:** After Phase 2 TypeScript changes, the Windows IPC path must be explicitly verified. The legacy flat `dist/ModInstallerIPC.exe` fallback in `getExecutablePaths()` is the safety net for one release cycle; confirm it resolves correctly before removing it.

---

## Sources

### Primary (HIGH confidence)
- `PROTON-VORTEX.md` (commit `581d5a8`) — gap analysis for all 6 Linux compatibility gaps
- `PROJECT.md` — requirements and out-of-scope constraints
- `src/ModInstaller.IPC/ModInstaller.IPC.csproj` — OS-conditional TFM, commented-out publish properties
- `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts` — hardcoded `.exe`, `getExecutablePaths()`
- `src/ModInstaller.IPC.TypeScript/src/launchers/RegularProcessLauncher.ts` — Mono fallback branch
- `src/ModInstaller.IPC.TypeScript/src/cleanup-processes.ts` — Windows-only process utilities
- `.github/workflows/build-packages.yml` — existing CI matrix pattern
- [learn.microsoft.com/dotnet/core/tools/dotnet-publish](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-publish) — `--self-contained`, `-r`, MSBuild publish properties
- [learn.microsoft.com/dotnet/core/deploying/native-aot](https://learn.microsoft.com/en-us/dotnet/core/deploying/native-aot/) — AOT vs single-file tradeoffs, GLIBC constraints
- [actions/runner-images Ubuntu 22.04 README](https://raw.githubusercontent.com/actions/runner-images/main/images/ubuntu/Ubuntu2204-Readme.md) — GLIBC 2.35, .NET 9 SDK confirmed installed

### Secondary (MEDIUM confidence)
- GitHub PR #22282 `Nexus-Mods/Vortex` — `resolvePathCase`, backslash normalization, `rejectWithSteamOSNotification` implementation detail
- GitHub PR #18887 `Nexus-Mods/Vortex` — merged Linux FOMOD build support (Nov 2025)
- GitHub PR #26 `Nexus-Mods/fomod-installer` — merged Linux Support (Nov 2025, Aragas)
- MO2 GitHub issue #1844 — FOMOD Options Non-Functional on Linux, closed "wontfix"
- esbuild install docs — `optionalDependencies` + `os`/`cpu` pattern (considered and rejected for this use case)

---

*Research completed: 2026-04-09*
*Ready for roadmap: yes*
