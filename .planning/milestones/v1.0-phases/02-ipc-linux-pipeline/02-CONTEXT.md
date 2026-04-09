# Phase 2: IPC Linux Pipeline - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship a self-contained Linux ELF binary in the `@nexusmods/fomod-installer-ipc` npm package and make the TypeScript launcher resolve the correct binary on each platform without Mono. Three deliverables:

1. **IPC-01** — CI matrix expansion: `build-ipc` becomes a matrix job (`ubuntu-22.04` for linux-x64, `windows-latest` for win32-x64). Linux ELF is self-contained (`--self-contained true -p:PublishSingleFile=true`), placed at `dist/linux-x64/ModInstallerIPC`, and has execute permissions set via `chmod +x` before `npm pack`.
2. **IPC-02** — TypeScript launcher: `BaseIPCConnection.findExecutable()` resolves `dist/linux-x64/ModInstallerIPC` on Linux, `dist/ModInstallerIPC.exe` on Windows. `RegularProcessLauncher.ts` Mono detection removed — no longer wraps `.exe` with `mono` on non-Windows.
3. **IPC-03** — Cross-platform cleanup: `cleanup-processes.ts` replaces `tasklist`/`taskkill` with platform-aware equivalents (`pgrep`/`kill` on Linux) so it completes without `ENOENT` on Linux.

No C# logic changes. All changes upstream-eligible to `Nexus-Mods/fomod-installer`.

</domain>

<decisions>
## Implementation Decisions

### IPC-01: Dist layout and binary placement

- **D-01:** Windows binary stays at `dist/ModInstallerIPC.exe` (root, no migration). Backward compatible for existing Vortex consumers who reference the old path. No `dist/win32-x64/` subdirectory for Windows.
- **D-02:** Linux binary goes to `dist/linux-x64/ModInstallerIPC` (new platform subdir). This is the only new path added.
- **D-03:** `chmod +x` runs as a CI step before `npm pack` on the Linux runner only. No `postinstall` npm script — published tarballs always have correct permissions; local developers running `dotnet publish` manually are responsible for their own execute bit.
- **D-04:** `build-ipc` becomes a matrix job: `ubuntu-22.04` (linux-x64 ELF) + `windows-latest` (win32-x64 EXE). Windows EXE output path: `dist/ModInstallerIPC.exe` (unchanged). Linux ELF output path: `dist/linux-x64/ModInstallerIPC`.
- **D-05:** Pin the `build-native` linux-x64 runner from `ubuntu-latest` to `ubuntu-22.04` in the same PR as the IPC changes. Consistent GLIBC baseline across all Linux artifacts in one commit.

### IPC-02: TypeScript resolver

- **D-06:** Platform-explicit resolution, no fallback chain. On Linux: `dist/linux-x64/ModInstallerIPC` only. On Windows: `dist/ModInstallerIPC.exe` only. If the binary isn't at the expected path, fail fast with a clear error — no silent fallback to a potentially wrong binary.
- **D-07:** `RegularProcessLauncher.ts` Mono detection block (lines 21–32: `if (process.platform !== 'win32' && exePath.toLowerCase().endsWith('.exe'))`) is removed entirely. .NET 9 self-contained ELF binaries do not need Mono. The launcher should receive the correct platform-specific path from `findExecutable()` and spawn it directly.
- **D-08:** `BaseIPCConnection.findExecutable()` currently hardcodes `getExecutablePaths('ModInstallerIPC.exe')`. This call must become platform-aware — pass `'ModInstallerIPC'` on Linux, `'ModInstallerIPC.exe'` on Windows. The `getExecutablePaths()` override must also inject the platform subdir into its path construction for Linux.

### IPC-03: Cleanup utility

- **D-09:** `cleanup-processes.ts` is made cross-platform using the same `process.platform !== 'win32'` guard pattern used elsewhere in the codebase. On Linux: `pgrep ModInstallerIPC` to find PIDs, `kill -9 <pid>` to terminate. On Windows: existing `tasklist`/`taskkill` logic unchanged.

### PR / Commit Strategy

- **D-10:** Work on `linux-port` branch first, then merge to `master` (per CLAUDE.md). CI changes and TypeScript changes are upstream-eligible and belong on `linux-port`. Commits should be atomic per requirement (IPC-01, IPC-02, IPC-03).

### Claude's Discretion

- Exact dotnet publish flags for the Linux self-contained build (suggested: `-r linux-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true`)
- Whether `build.js` is updated to support the new platform subdir output, or whether the CI workflow overrides the output dir directly via dotnet CLI flags
- Exact pgrep/kill command construction in `cleanup-processes.ts` (process name matching, signal choice)
- Order of commits (suggested: IPC-01 CI → IPC-02 TypeScript → IPC-03 cleanup)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §IPC-01, §IPC-02, §IPC-03 — Acceptance criteria, exact binary paths, and CI runner specifications

### Key Source Files (fix targets)
- `src/ModInstaller.IPC.TypeScript/src/launchers/RegularProcessLauncher.ts` — IPC-02: Mono detection removal (lines 20–32)
- `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts` — IPC-02: `findExecutable()` hardcodes `'ModInstallerIPC.exe'` (line 453); `getExecutablePaths()` default impl (lines 155–163)
- `src/ModInstaller.IPC.TypeScript/src/cleanup-processes.ts` — IPC-03: Windows-only `tasklist`/`taskkill` calls
- `.github/workflows/build-packages.yml` — IPC-01: `build-ipc` job (line 125+) and `build-native` linux-x64 runner (line 18)
- `src/ModInstaller.IPC.TypeScript/build.js` — IPC-01: `dotnet publish` command and output path construction (lines 281–302)

### Package Layout
- `src/ModInstaller.IPC.TypeScript/package.json` — `"files": ["dist/"]` includes all of `dist/`; new `dist/linux-x64/` subdir is automatically included

### Phase 1 Context (prior decisions)
- `.planning/phases/01-c-correctness/01-CONTEXT.md` — Branch strategy, commit style, and upstream PR approach established in Phase 1

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `process.platform !== 'win32'` guard — already used in `BaseIPCConnection.ts` and `RegularProcessLauncher.ts`; same pattern for IPC-02 and IPC-03
- `build-native` matrix pattern in `build-packages.yml` (lines 14–21) — reuse for `build-ipc` matrix expansion
- `actions/upload-artifact@v4` / `actions/download-artifact@v4` — already used for native; same pattern for IPC cross-platform artifact assembly

### Established Patterns
- Platform matrix with `include:` entries in `build-packages.yml` — existing pattern (build-native job); replicate for build-ipc
- `process.platform === 'win32'` for platform branching in TypeScript — used throughout IPC module
- `path.join(__dirname, exeName)` for executable path construction in `getExecutablePaths()`

### Integration Points
- `BaseIPCConnection.findExecutable()` (line 452–473) calls `getExecutablePaths('ModInstallerIPC.exe')` — the exe name AND the path must both change for Linux
- `RegularProcessLauncher.launch()` receives `exePath` from `findExecutable()` — once `findExecutable()` returns the correct ELF path on Linux, the Mono block is dead code and can be removed
- `package.json` `"files": ["dist/"]` — new `dist/linux-x64/` subdir is included automatically; no manifest change needed

</code_context>

<specifics>
## Specific Ideas

- The REQUIREMENTS.md dotnet publish flags for IPC-01: `dotnet publish -r linux-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true`
- Windows IPC EXE stays at `dist/ModInstallerIPC.exe` — the Windows CI runner's `dotnet publish` output dir should remain `dist/` (unchanged from current `build.js` behavior)
- Linux IPC ELF goes to `dist/linux-x64/ModInstallerIPC` — the Linux CI runner's `dotnet publish` needs `-o dist/linux-x64` plus `-r linux-x64`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-ipc-linux-pipeline*
*Context gathered: 2026-04-09*
