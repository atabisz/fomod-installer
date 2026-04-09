# Pitfalls Research

**Domain:** .NET Linux porting / Node.js binary packaging / GitHub Actions cross-platform CI
**Researched:** 2026-04-09
**Confidence:** HIGH (all pitfalls grounded in the actual codebase — not generic advice)

---

## Critical Pitfalls

### Pitfall 1: Hardcoded `.exe` Extension in Executable Lookup

**What goes wrong:**
`BaseIPCConnection.findExecutable()` calls `getExecutablePaths('ModInstallerIPC.exe')` unconditionally on all platforms. On Linux, the ELF binary will not have a `.exe` extension, so `findExecutable()` will always throw "Executable not found" — the IPC path will be completely broken regardless of whether the Linux binary was correctly built and packaged.

**Why it happens:**
The codebase was originally Windows-only. The `.exe` literal is hardcoded in `BaseIPCConnection.ts:453`. The current `RegularProcessLauncher.ts` already branches on `process.platform !== 'win32'` for the Mono fallback, but the lookup itself was never updated.

**How to avoid:**
In `BaseIPCConnection.findExecutable()`, derive the binary name from `process.platform`:
```typescript
const exeName = process.platform === 'win32' ? 'ModInstallerIPC.exe' : 'ModInstallerIPC';
const possiblePaths = this.getExecutablePaths(exeName);
```
Any caller that overrides `getExecutablePaths()` (including the test in `ModInstaller.ipc.spec.ts:31` which also hardcodes `.exe`) must be updated in the same pass.

**Warning signs:**
- "Executable not found. Tried paths: …/ModInstallerIPC.exe" error on Linux, even after a correct ELF binary is built.
- `RegularProcessLauncher` falls through to the Mono branch for every Linux launch despite Mono not being installed.

**Phase to address:**
Phase 2 (Build pipeline + platform binary selection). This is the first thing to verify once the CI artifact is in place.

---

### Pitfall 2: ELF Binary Loses Execute Permission Through CI Artifact Round-Trip

**What goes wrong:**
GitHub Actions `upload-artifact` / `download-artifact` does not preserve POSIX file permissions. A self-contained ELF binary uploaded from a Linux runner will be downloaded with `0644` permissions. When the `package-native` job (or a future `package-ipc` job) downloads it and calls `npm pack`, the tarball contains the binary without the execute bit. Consumers who `npm install` the package and try to spawn the binary get `EACCES: permission denied` at runtime.

**Why it happens:**
The current `build-native` workflow already handles this correctly for `.napi.node` files because Node.js addons are `require()`'d (not spawned), so execute permissions are irrelevant there. But a self-contained IPC binary is spawned via `child_process.spawn()` — the execute bit is mandatory. The existing workflow provides no `chmod` step, making this an invisible gap when adding the IPC Linux artifact.

**How to avoid:**
In the packaging job, after `download-artifact` and before `npm pack`, add:
```bash
chmod +x dist/linux-x64/ModInstallerIPC
```
Alternatively, add a postinstall script to the npm package that sets the execute bit:
```js
// postinstall.js
const { chmodSync } = require('fs');
const { join } = require('path');
if (process.platform !== 'win32') {
  chmodSync(join(__dirname, 'dist/linux-x64/ModInstallerIPC'), 0o755);
}
```
The postinstall approach is more robust because it fixes permissions even if someone extracts the tarball manually without going through npm.

**Warning signs:**
- `spawn EACCES` or `Error: spawn … EACCES` in Vortex logs when launching the IPC process on Linux.
- `ls -l` on the installed binary shows `-rw-r--r--` instead of `-rwxr-xr-x`.
- CI "pack tarball" step succeeds, but a quick `tar tf *.tgz | xargs stat` shows no execute bits on the ELF.

**Phase to address:**
Phase 2 (CI build pipeline). Must be checked immediately after the first Linux IPC artifact is produced, before any integration test.

---

### Pitfall 3: `dotnet publish` Without `--self-contained -r linux-x64` Produces Framework-Dependent Output

**What goes wrong:**
`build.js` runs `dotnet publish` with only `-c Release -o dist` — no `-r` (runtime identifier) and no `--self-contained`. On a Linux CI runner this produces a framework-dependent binary that requires a .NET runtime to be installed on the end-user machine. The stated design goal is "no .NET runtime dependency."

**Why it happens:**
`ModInstaller.IPC.csproj` has the self-contained and single-file properties commented out. The Windows workflow for the IPC package works coincidentally because Windows users typically have the framework installed, but the Linux use case requires a fully self-contained binary.

**How to avoid:**
Pass the required flags explicitly to the publish command when building the Linux IPC binary:
```bash
dotnet publish -c Release -r linux-x64 --self-contained true -p:PublishSingleFile=true -o dist/linux-x64/
```
Do not uncomment the `.csproj` properties — keep them as CI command-line overrides so the project still builds framework-dependent for development.

**Warning signs:**
- Published output contains `ModInstallerIPC` plus many `.dll` files alongside it, rather than a single fat binary.
- Binary crashes with "A suitable version of the .NET runtime was not found" on a machine without .NET installed.
- `file dist/linux-x64/ModInstallerIPC` reports `ELF 64-bit LSB pie executable` but `ldd` shows a dependency on `libicui18n.so`, `libdotnetrt.so`, or similar .NET-supplied libraries that aren't present on minimal systems.

**Phase to address:**
Phase 2 (CI build pipeline). The publish flags must be correct on the first CI attempt or the artifact is useless.

---

### Pitfall 4: glibc Version Mismatch — Binary Built on Ubuntu 24 Fails on Ubuntu 20 / Older Distros

**What goes wrong:**
A self-contained .NET AOT or single-file binary compiled on a modern Ubuntu runner (e.g., `ubuntu-latest` = 24.04) is linked against a newer glibc than what ships on older distros (Ubuntu 20.04 uses glibc 2.31; Ubuntu 22.04 uses glibc 2.35; Ubuntu 24.04 uses glibc 2.39). Steam and Vortex on Linux are disproportionately run on long-term-support distros. A binary built on 24.04 may refuse to start on 20.04 with: `version 'GLIBC_2.38' not found`.

**Why it happens:**
The GitHub Actions `ubuntu-latest` image advances over time. The existing `build-native` job already uses `ubuntu-latest` for the Linux native build — and the `.so` produced may already have this issue for users on older distros. For AOT binaries the compiler links statically against some libraries but dynamically against glibc itself (glibc cannot be statically linked safely).

**How to avoid:**
Pin the Linux runner to the oldest supported Ubuntu LTS:
```yaml
- os: ubuntu-20.04
  platform: linux-x64
```
Alternatively, use a Docker container for the publish step to control the glibc floor. For .NET AOT specifically, `InvariantGlobalization: true` (already set in `ModInstaller.Native.csproj`) reduces ICU dependencies but does not eliminate the glibc constraint.

**Warning signs:**
- Binary works on the CI runner but crashes on user machines with `GLIBC_2.X not found`.
- `objdump -p ModInstallerIPC | grep GLIBC` shows a GLIBC version requirement newer than 2.31.
- User reports of "works for me on Fedora 39" but "crashes immediately on Steam Deck (SteamOS, glibc 2.33)".

**Phase to address:**
Phase 2 (CI build pipeline). Pin the runner version before the first artifact is published. The existing `build-native` job may have the same exposure and should be audited.

---

### Pitfall 5: `cleanup-processes.ts` Uses Windows-Only `tasklist` / `taskkill`

**What goes wrong:**
`cleanup-processes.ts` is exported from the package's public API (`index.ts` re-exports it via `export * from './cleanup-processes'`). On Linux, `exec('tasklist ...')` throws `ENOENT`, and `exec('taskkill ...')` also fails. Any consumer (including Vortex) that calls `findStuckProcesses()` or `killProcess()` on Linux gets an unhandled rejection or a caught-but-swallowed error, potentially leaving orphaned IPC processes.

**Why it happens:**
The module was written for Windows only and never guarded. The public re-export makes it easy to call without noticing the platform constraint.

**How to avoid:**
Gate both functions behind `process.platform === 'win32'` checks, or replace `tasklist`/`taskkill` with cross-platform equivalents:
```typescript
// Linux/macOS: pgrep ModInstallerIPC
// Windows:     tasklist /FI "IMAGENAME eq ModInstallerIPC.exe" /FO CSV
const isWindows = process.platform === 'win32';
const findCmd = isWindows
  ? 'tasklist /FI "IMAGENAME eq ModInstallerIPC.exe" /FO CSV'
  : 'pgrep -x ModInstallerIPC';
```
`pgrep` is available on all mainstream Linux distros.

**Warning signs:**
- `Error: spawn tasklist ENOENT` in Vortex logs on Linux.
- Zombie `ModInstallerIPC` processes accumulate after Vortex restarts on Linux.

**Phase to address:**
Phase 2 (Platform binary selection / TypeScript launcher work). Fix in the same pass as `RegularProcessLauncher.ts`.

---

### Pitfall 6: `NativeOutputDir` Uses Windows Backslash Path Separator in MSBuild Target

**What goes wrong:**
In `ModInstaller.Native.csproj`, the `CopyNativeContent` target defines:
```xml
<NativeOutputDir>$(MSBuildProjectDirectory)\bin\$(Configuration)\...</NativeOutputDir>
```
This uses a hardcoded backslash as a path separator. MSBuild on Linux/macOS handles this in most cases because .NET's MSBuild normalizes paths, but it is a latent fragility — some MSBuild path operations are case-sensitive on Linux and backslash-literal in certain property expressions. If a future SDK update changes the normalization behavior, this will silently produce wrong paths and the `Copy` task will copy nothing.

**Why it happens:**
The `.csproj` was authored on Windows. Forward slashes are the safe cross-platform choice in MSBuild properties.

**How to avoid:**
Change the path separator to forward slash:
```xml
<NativeOutputDir>$(MSBuildProjectDirectory)/bin/$(Configuration)/$(TargetFramework)/$(RuntimeIdentifier)/native/</NativeOutputDir>
```

**Warning signs:**
- `CopyNativeContent: Files=` shows an empty file list in the build log on Linux.
- The native `.so` is produced under `native/` but not copied to the publish output directory.

**Phase to address:**
Phase 1 (C# code changes). Low risk but fix in the first pass over the `.csproj` files.

---

### Pitfall 7: Path Normalization Fix Applied to Only Some Parsers

**What goes wrong:**
PROTON-VORTEX.md identifies `Parser10.cs` and `Parser20.cs` explicitly, but the repo contains multiple versioned parsers. If only the explicitly named parsers receive the `TextUtil.NormalizePath()` call, parsers for FOMOD format versions 3.x, 4.x, and 5.x will continue to emit raw backslashes. Mods authored for newer FOMOD versions (common in Nexus uploads) will still produce broken paths on Linux.

**Why it happens:**
The natural temptation is to fix only the files named in the gap analysis. A pattern like "fix what's documented, ship it" misses sibling classes.

**How to avoid:**
Before writing any parser fix, audit all parser classes:
```bash
find src/InstallScripting/XmlScript/Parsers/ -name 'Parser*.cs' | sort
```
Apply the `NormalizePath()` call to every `source` and `destination` attribute extraction across all versioned parsers in a single commit. Write a unit test that exercises a FOMOD with backslash paths against each parser version.

**Warning signs:**
- Path normalization tests pass for v1.0/v2.0 FOMOD mods but fail for a v4.0 or v5.0 mod.
- Vortex still shows the `replaceAll("\\", "/")` workaround being exercised after the "fix" ships.

**Phase to address:**
Phase 1 (Parse-time path normalization). Enumerate all parsers before writing the fix.

---

### Pitfall 8: `InvariantGlobalization: true` Silently Breaks String Comparisons on Some Inputs

**What goes wrong:**
`ModInstaller.Native.csproj` sets `<InvariantGlobalization>true</InvariantGlobalization>` for release builds. This makes `StringComparer.CurrentCulture` and `String.Compare` with culture-sensitive options behave as ordinal. For FOMOD path matching this is almost always correct, but if any code uses `StringComparison.CurrentCultureIgnoreCase` or Turkish-locale-sensitive comparisons for mod or file names, results will silently differ from Windows behavior. The `Mod.cs` case-insensitive match uses `StringComparison.InvariantCultureIgnoreCase` which is safe, but newly written code that follows the pattern of existing code could accidentally use `CurrentCultureIgnoreCase`.

**Why it happens:**
`InvariantGlobalization` is a performance and size optimization that's correct for most use cases but not universally safe.

**How to avoid:**
Explicitly use `StringComparison.OrdinalIgnoreCase` for all path and filename comparisons in this codebase — never `CurrentCulture*`. Add a Roslyn analyzer rule (or a comment in the coding guidelines) prohibiting `CurrentCulture` comparisons on path strings.

**Warning signs:**
- Case-insensitive path match that works on Windows fails on Linux for filenames containing characters like `İ` (dotted capital I) or other non-ASCII characters — less common but present in some mod archives.

**Phase to address:**
Phase 1 (C# code changes). Audit new code for `CurrentCulture` usage before it lands.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Leaving Mono fallback in `RegularProcessLauncher.ts` after Linux ELF lands | No code deletion needed | Mono path is dead code; may confuse future maintainers; ENOENT error if Mono not installed and ELF lookup fails | Never — remove the Mono branch once Linux ELF is confirmed working |
| `dotnet publish` without `-r linux-x64 --self-contained` in build.js | Simpler build script | Framework-dependent output; breaks on user machines without .NET | Never for the IPC binary |
| Fixing only Parser10.cs and Parser20.cs | Faster | Silent failures on v3.0–v5.0 FOMOD mods | Never |
| `ubuntu-latest` runner without pinning | Always gets "latest improvements" | Breaks on glibc version bump when ubuntu-latest advances | Acceptable for PR validation; not acceptable for release artifact builds |
| Keeping `cleanup-processes.ts` Windows-only behind a thrown exception | No work needed | Public API throws ENOENT on Linux; zombie processes accumulate | Never — it's re-exported from the public index |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `dotnet publish` + `npm pack` | Packing immediately after `publish` without `chmod +x` on the ELF binary | `chmod +x` in CI before `npm pack`, or add a postinstall script that sets 0o755 |
| `actions/download-artifact@v4` with ELF binaries | Assuming downloaded files have the same permissions as uploaded files | Always `chmod +x` ELF files after download in CI |
| `node-gyp-build` in `install.js` for the native package | Assuming the `.so` companion file is found at package root without `install.js` running | The `install.js` postinstall script copies `.so` from `prebuilds/linux-x64/` to the package root so the `rpath` in the `.node` file resolves — if postinstall is skipped, the addon fails to load |
| `BaseIPCConnection.findExecutable()` | Passing the literal `'ModInstallerIPC.exe'` to `getExecutablePaths()` on all platforms | Derive filename from `process.platform` before calling `getExecutablePaths()` |
| Named pipe transport on Linux | Assuming named pipe transport will work (it's the preferred transport on Windows) | Named pipes are unavailable on Linux; the TCP fallback is mandatory and must be the first strategy in the `ConnectionStrategy[]` array for Linux callers |

---

## Performance Traps

Not applicable at the scale of a local mod installer. There are no meaningful scale thresholds for this domain.

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Distributing the IPC ELF binary with world-write permissions | Any process on the machine could replace the binary with a malicious one | Set permissions to `0o755` (owner write, group/other read+execute only) in postinstall |
| Path traversal via FOMOD `source`/`destination` attributes using `../` sequences | Mod archive could write files outside the intended install directory | `FileSystem.IsSafeFilePath()` check exists; add Linux-specific unit tests for `../` and `..\` traversal as documented in gap #6 |

---

## "Looks Done But Isn't" Checklist

- [ ] **Linux IPC CI build:** The workflow produces an artifact AND the binary has execute permission AND the binary is self-contained (verify with `ldd ModInstallerIPC` — should show minimal system libs only)
- [ ] **Platform binary selection:** `RegularProcessLauncher.ts` resolves to the ELF binary on Linux AND the `.exe` binary on Windows (test both branches explicitly)
- [ ] **Path normalization:** Fix applied to ALL versioned parsers (Parser10.cs, Parser20.cs, and every other Parser*.cs in the directory) — not just the two named in PROTON-VORTEX.md
- [ ] **`cleanup-processes.ts`:** Works (or gracefully no-ops) on Linux — `pgrep` replaces `tasklist`, `kill()` replaces `taskkill`
- [ ] **Windows regression:** After Linux changes, the Windows IPC path still resolves `.exe` correctly and the sandbox launcher still works
- [ ] **npm tarball contents:** `tar tf *.tgz` for the IPC package shows the Linux binary at the expected path AND with the execute bit (some `tar` implementations preserve this in the listing)

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| ELF binary missing execute bit in shipped package | MEDIUM | Publish a patch version with postinstall `chmod +x`; existing installs require `npm rebuild` or manual `chmod` |
| Framework-dependent binary shipped instead of self-contained | HIGH | Publish patch version with correct publish flags; users without .NET installed cannot run the installer at all until updated |
| glibc mismatch (binary built on ubuntu-24 fails on ubuntu-20) | HIGH | Must rebuild on an older runner and republish; users on affected distros cannot use IPC path |
| Partial parser fix (only Parser10/20) | MEDIUM | Follow-up PR to fix remaining parsers; users with v3.0–v5.0 FOMOD mods still see broken paths |
| `cleanup-processes.ts` throws ENOENT on Linux | LOW | Patch version with platform guard; if uncaught, it logs an error but doesn't block installation |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Hardcoded `.exe` in executable lookup | Phase 2 — Platform binary selection | `process.platform === 'linux'` integration test spawns ELF successfully |
| ELF loses execute permission in CI round-trip | Phase 2 — CI build pipeline | `stat dist/linux-x64/ModInstallerIPC` shows mode `0755` after `npm pack`/`npm install` |
| `dotnet publish` without self-contained flags | Phase 2 — CI build pipeline | `ldd dist/linux-x64/ModInstallerIPC` shows no .NET framework deps; binary runs on a clean Ubuntu VM |
| glibc version mismatch | Phase 2 — CI build pipeline | Pin runner to `ubuntu-20.04`; verify with `objdump -p … | grep GLIBC` |
| `cleanup-processes.ts` Windows-only | Phase 2 — Platform binary selection | Unit test: `findStuckProcesses()` returns `[]` on Linux without throwing |
| `NativeOutputDir` backslash in MSBuild | Phase 1 — C# code changes | Linux CI `.so` is present in the expected publish output directory |
| Partial parser fix across versioned parsers | Phase 1 — Parse-time normalization | Test matrix includes FOMOD v1.0, v2.0, v4.0, v5.0 mods with backslash source paths |
| `InvariantGlobalization` + CurrentCulture comparisons | Phase 1 — C# code changes | Code review gate: grep for `CurrentCulture` in all new/changed C# files |

---

## Sources

- Codebase analysis: `/home/alex/src/fomod-installer/PROTON-VORTEX.md` (gap analysis authored against `581d5a8`)
- Codebase analysis: `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts` (hardcoded `.exe`, `findExecutable()`)
- Codebase analysis: `src/ModInstaller.IPC.TypeScript/src/cleanup-processes.ts` (Windows-only process utilities)
- Codebase analysis: `src/ModInstaller.IPC.TypeScript/build.js` (publish flags, `.exe` sign check)
- Codebase analysis: `.github/workflows/build-packages.yml` (no chmod, no IPC Linux runner)
- Codebase analysis: `src/ModInstaller.IPC/ModInstaller.IPC.csproj` (self-contained options commented out)
- Codebase analysis: `src/ModInstaller.Native/ModInstaller.Native.csproj` (backslash NativeOutputDir, InvariantGlobalization)
- GitHub Actions documentation: upload-artifact/download-artifact do not preserve POSIX permissions (known limitation, documented in actions/upload-artifact README)
- .NET documentation: glibc dependency in self-contained Linux binaries is a known platform constraint (https://learn.microsoft.com/en-us/dotnet/core/deploying/native-aot/cross-compile)
- .NET documentation: InvariantGlobalization behavior (https://learn.microsoft.com/en-us/dotnet/core/runtime-config/globalization)

---
*Pitfalls research for: .NET Linux porting / Node.js binary packaging / GitHub Actions cross-platform CI*
*Researched: 2026-04-09*
