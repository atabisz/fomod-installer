# Architecture Research

**Domain:** Node.js npm package with platform-specific prebuilt .NET binaries + IPC process launching
**Researched:** 2026-04-09
**Confidence:** HIGH — based on direct codebase inspection, official .NET CLI docs, and established npm ecosystem patterns

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Vortex (Linux Electron)                        │
│   extends BaseIPCConnection, instantiates NativeModInstaller     │
├─────────────────────────────────────────────────────────────────┤
│              @nexusmods/fomod-installer-ipc (npm pkg)            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │               BaseIPCConnection (TS)                     │    │
│  │   findExecutable() → dist/{platform}/ModInstallerIPC    │    │
│  │   RegularProcessLauncher.launch() → spawn ELF/EXE       │    │
│  │   TCPTransport (Linux) / NamedPipeTransport (Windows)   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          ↕ IPC (TCP/JSON)                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │    ModInstallerIPC (self-contained .NET 9 process)       │    │
│  │    Linux: ELF binary    Windows: .exe                    │    │
│  │    ModInstaller.Adaptor.Dynamic → XmlScript + CSharp     │    │
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│             @nexusmods/fomod-installer-native (npm pkg)          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │   NativeModInstaller (TS) → node-gyp-build              │    │
│  │   prebuilds/{platform}/modinstaller.napi.node           │    │
│  │   prebuilds/{platform}/ModInstaller.Native.{dll,so}     │    │
│  │   ModInstaller.Adaptor.Typed → XmlScript only           │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `BaseIPCConnection` | Orchestrates IPC lifecycle, message routing, strategy fallback | RegularProcessLauncher, TCPTransport |
| `RegularProcessLauncher` | Spawns platform-specific IPC binary via `child_process.spawn` | OS process subsystem |
| `findExecutable()` | Resolves binary path from `dist/{platform}/ModInstallerIPC[.exe]` | Filesystem |
| `TCPTransport` | JSON-over-TCP on Linux (Named Pipes not available) | .NET IPC process |
| `ModInstallerIPC` (ELF/EXE) | Self-contained .NET process, full FOMOD execution | TCPTransport over loopback |
| `node-gyp-build` | Selects `prebuilds/{platform}-{arch}/modinstaller.napi.node` | Native AOT .so/.dll |
| GitHub Actions matrix | Builds platform binaries in parallel, uploads as artifacts | npm tarball assembly job |

## Recommended dist/ Structure for IPC Package

The current build drops `ModInstallerIPC.exe` and all its DLL dependencies flat into `dist/`. This works on Windows but has no Linux equivalent. The fix introduces a platform subdirectory convention that mirrors what the native package already does with `prebuilds/`.

```
src/ModInstaller.IPC.TypeScript/
├── dist/
│   ├── index.js                    # webpack bundle (platform-agnostic TS)
│   ├── index.d.ts                  # type declarations
│   ├── win32-x64/
│   │   ├── ModInstallerIPC.exe     # Windows self-contained single-file EXE
│   │   └── (no DLL deps: single-file publish)
│   └── linux-x64/
│       └── ModInstallerIPC         # Linux self-contained single-file ELF (no .exe)
└── package.json
    └── "files": ["dist/"]          # ships both platform dirs
```

**Why single-file publish for IPC:** The IPC project's `.csproj` already has the single-file flags commented out but present. Enabling `PublishSingleFile=true` + `SelfContained=true` + `EnableCompressionInSingleFile=true` produces one binary with no side DLL deps. This collapses the current flat-DLL-dump in `dist/` to a single file per platform — simpler to ship, simpler to path-resolve, avoids the `cwd` dependency that currently comes from `path.dirname(exePath)`.

**Contrast with esbuild/sharp patterns:** esbuild uses separate scoped npm packages per platform (`@esbuild/linux-x64`), loaded as optional dependencies. This is the ideal for packages with many platforms and large consumers. For fomod-installer, the audience is narrow (Nexus Mods internal) and the platforms are exactly two (win32-x64, linux-x64). A single package with `dist/{platform}/` subdirectories is the simpler approach that matches the existing native package's `prebuilds/{platform}/` pattern and avoids managing multiple npm packages.

**Contrast with node-gyp-build:** The native package uses `node-gyp-build` which auto-selects from `prebuilds/{platform}-{arch}/` by inspecting `process.platform` and `process.arch` at `require()` time. The IPC package cannot use node-gyp-build (no `.node` file) but should mirror the same naming pattern for consistency. Platform selection happens in `findExecutable()` / `getExecutablePaths()` at process-launch time.

## Architectural Patterns

### Pattern 1: Platform Binary Selection at Launch Time

**What:** `getExecutablePaths()` in `BaseIPCConnection` currently returns only `path.join(__dirname, 'ModInstallerIPC.exe')` — a hardcoded Windows-only path. The fix adds platform detection before constructing the binary name.

**When to use:** Any time an npm package ships OS-specific prebuilt executables. The selection must happen at runtime (not install time) because the package ships all platform binaries and the caller's OS determines which to use.

**Recommended implementation:**

```typescript
protected getExecutablePaths(exeName: string): string[] {
  // Determine the platform-specific binary name and subdirectory.
  // On Linux: dist/linux-x64/ModInstallerIPC (no extension, ELF)
  // On Windows: dist/win32-x64/ModInstallerIPC.exe
  const platform = `${process.platform}-${process.arch}`;
  const binaryName = process.platform === 'win32'
    ? 'ModInstallerIPC.exe'
    : 'ModInstallerIPC';

  // Primary: platform subdirectory (packaged distribution)
  const platformPath = path.join(__dirname, '..', 'dist', platform, binaryName);
  // Fallback: flat dist/ for backward compat with existing Windows installs
  const legacyPath = path.join(__dirname, 'ModInstallerIPC.exe');

  return [platformPath, legacyPath];
}
```

**Trade-offs:** The legacy flat path keeps backward compatibility for existing Vortex installs that already have the old package format. Callers overriding `getExecutablePaths()` can drop the legacy fallback once the new format has shipped for one release.

### Pattern 2: Self-Contained Single-File .NET Publish

**What:** `dotnet publish` with `--self-contained --runtime {RID} -p:PublishSingleFile=true` bundles the .NET runtime and all assemblies into one executable. No .NET runtime install required on the target machine.

**When to use:** Any .NET executable shipped inside an npm package that will run on machines where users have not installed .NET — which is the default assumption for Vortex users.

**Recommended CI command for IPC Linux build:**

```bash
dotnet publish src/ModInstaller.IPC/ModInstaller.IPC.csproj \
  --configuration Release \
  --runtime linux-x64 \
  --self-contained \
  -p:PublishSingleFile=true \
  -p:EnableCompressionInSingleFile=true \
  -p:IncludeNativeLibrariesForSelfExtract=true \
  --output dist/linux-x64
```

**Windows equivalent (same flags, different RID):**

```bash
dotnet publish src/ModInstaller.IPC/ModInstaller.IPC.csproj \
  --configuration Release \
  --runtime win-x64 \
  --self-contained \
  -p:PublishSingleFile=true \
  -p:EnableCompressionInSingleFile=true \
  --output dist/win32-x64
```

**Trade-offs:** Single-file bundles are larger (~50-80 MB with .NET runtime included) vs the current flat publish which requires .NET runtime already installed. Size is acceptable for the use case. Startup is slightly slower on first run (extraction to temp on non-AOT path) but negligible for a long-lived IPC server process.

**Important:** `ModInstaller.IPC.csproj` already targets `net9.0` on non-Windows (not `net9.0-windows`). The CSharpScript dependency only gets pulled in on Windows via the `net9.0-windows` TFM. The Linux self-contained build will therefore not include Windows-only assemblies — no runtime guard needed for the binary itself (though the C# script OS guard in `ScriptTypeRegistry.cs` is still good defensive practice).

### Pattern 3: GitHub Actions Matrix for Multi-Platform Binary Builds

**What:** A CI matrix job runs on each target OS, builds the binary, uploads as a named artifact, and a downstream assembly job downloads all artifacts and packs the final npm tarball.

**When to use:** Any package that ships prebuilt binaries for more than one platform. The matrix pattern is already in use for the native package (`build-native` job). The IPC job should adopt the same pattern.

**Current state:** `build-ipc` runs only on `ubuntu-latest` and only builds the TypeScript bundle (webpack + tsc). It does not build any .NET binary.

**Required change to `build-packages.yml`:**

```yaml
build-ipc:
  strategy:
    matrix:
      include:
        - os: windows-latest
          platform: win32-x64
          runtime: win-x64
        - os: ubuntu-latest
          platform: linux-x64
          runtime: linux-x64
  runs-on: ${{ matrix.os }}
  steps:
    # ... checkout, setup-dotnet, node, pnpm ...
    - name: Publish IPC binary (self-contained)
      run: |
        dotnet publish src/ModInstaller.IPC/ModInstaller.IPC.csproj \
          -c Release \
          -r ${{ matrix.runtime }} \
          --self-contained \
          -p:PublishSingleFile=true \
          -p:EnableCompressionInSingleFile=true \
          -o src/ModInstaller.IPC.TypeScript/dist/${{ matrix.platform }}
    - name: Upload IPC binary artifact
      uses: actions/upload-artifact@v4
      with:
        name: ipc-${{ matrix.platform }}
        path: src/ModInstaller.IPC.TypeScript/dist/${{ matrix.platform }}/

package-ipc:
  needs: build-ipc
  runs-on: ubuntu-latest
  steps:
    # Download both platform artifacts into dist/
    # Build webpack bundle
    # npm pack
```

**Trade-offs:** The Windows binary must be built on a Windows runner because `net9.0-windows` TFM (needed for CSharpScript) is Windows-only. The Linux binary can be built on `ubuntu-latest`. Cross-compilation (building Linux binary on Windows runner with `--os linux`) is possible for the non-Windows TFM but avoided here because the Windows runner's TFM is `net9.0-windows` — a different csproj build.

## Data Flow

### IPC Installation Flow (Linux)

```
Vortex extends BaseIPCConnection
    ↓ initialize()
findExecutable()
    → dist/linux-x64/ModInstallerIPC   (ELF, self-contained)
    ↓
RegularProcessLauncher.launch(exePath, args)
    → process.platform === 'linux': exePath is ELF, no Mono wrapping needed
    → spawn(exePath, args, { cwd: dirname(exePath) })
    ↓
ModInstallerIPC (ELF process starts)
    → .NET 9 runtime embedded (no host install needed)
    → Listens on TCP loopback port
    → Sends "connected" handshake
    ↓
TCPTransport.waitForConnection()
    → receives handshake
    ↓
JSON install request over TCP
    ↓
ModInstaller.Adaptor.Dynamic → XmlScript execution
    → C# scripts: runtime guard returns UnsupportedFunctionalityWarning
    ↓
JSON response with instructions
    ↓
Vortex applies instructions
```

### RegularProcessLauncher Platform Branch

Current code wraps `.exe` with `mono` on non-Windows. After the fix, this branch must not trigger for an ELF binary:

```
RegularProcessLauncher.launch(exePath, args)
    if (process.platform !== 'win32' && exePath.endsWith('.exe'))
        → prepend 'mono'          [OLD behavior — Mono path, should become dead code]
    else
        → spawn(exePath, args)    [NEW path: ELF binary, no wrapping needed]
```

The fix in `RegularProcessLauncher` is minimal: because `findExecutable()` will now resolve to a path without `.exe` on Linux, the existing `endsWith('.exe')` guard already correctly skips the Mono prepend. No change needed to `RegularProcessLauncher` itself — the fix lives entirely in `getExecutablePaths()` / `findExecutable()`. The Mono code path becomes unreachable dead code once the Linux binary is in dist/.

## Build Order (What Must Ship Before What)

```
1. CI: build-ipc matrix (Windows + Linux) ──────────────────────────────┐
   ↳ produces: dist/win32-x64/ModInstallerIPC.exe                        │
   ↳ produces: dist/linux-x64/ModInstallerIPC                            │
                                                                          ↓
2. CI: package-ipc assembly ────────────────────────────────────────────→ npm pack
   ↳ downloads both binary artifacts                                       │
   ↳ runs webpack + tsc for JS bundle                                      │
   ↳ dist/ now has: index.js, win32-x64/, linux-x64/                      │
                                                                          ↓
3. TypeScript changes (findExecutable platform routing) ─────────────── included in step 2 webpack bundle
   ↳ must land before package-ipc step runs                               │

4. C# runtime OS guard (ScriptTypeRegistry) ─────────────────────────── included in step 1 IPC binary
   ↳ must land before build-ipc step runs
```

**Dependency constraint:** The TypeScript `getExecutablePaths()` fix and the .NET CSharpScript OS guard must both be merged into the branch before the CI matrix builds run. They are independent of each other but both feed into the final packaged binary.

## Anti-Patterns

### Anti-Pattern 1: Mono Wrapping as the Linux Solution

**What people do:** Keep the existing `RegularProcessLauncher` Mono fallback as the primary Linux path instead of shipping a self-contained binary.

**Why it's wrong:** Mono is not installed on a typical Linux desktop. It is a separate runtime with a different compatibility surface than .NET 9. Requiring Mono forces an undocumented user prerequisite, and Mono's Windows API compatibility layer does not cover all APIs used by the IPC process. The existing code already has this as a fallback — it should become unreachable dead code, not the happy path.

**Do this instead:** Ship a self-contained ELF via `dotnet publish --self-contained --runtime linux-x64`. The .NET runtime is embedded in the binary. No host runtime required.

### Anti-Pattern 2: Flat dist/ for Multi-Platform Binaries

**What people do:** Drop all platform binaries and DLLs into `dist/` without subdirectories, relying on filename suffixes (`.exe` vs no extension) to distinguish them.

**Why it's wrong:** Self-contained publish produces many support files (in non-single-file mode) that would collide between platforms. More importantly, a flat layout makes it ambiguous which binary belongs to which platform and breaks the symmetry with the native package's `prebuilds/{platform}/` convention. Tooling (artifact download, path resolution) becomes ad-hoc.

**Do this instead:** Use `dist/{platform}/` subdirectories where `platform` matches Node.js's `${process.platform}-${process.arch}` convention (e.g., `linux-x64`, `win32-x64`). This mirrors the `prebuilds/` convention from the native package and is what all major Node.js packages with native binaries use.

### Anti-Pattern 3: Hardcoding 'ModInstallerIPC.exe' in findExecutable

**What people do:** Leave `findExecutable()` searching for `'ModInstallerIPC.exe'` without a platform branch — because it currently works on Windows and the Linux case wasn't needed.

**Why it's wrong:** On Linux, no file named `ModInstallerIPC.exe` exists in `dist/`. The function throws "Executable not found" silently, the IPC path fails, and there is no fallback to the native path. The user gets a broken install with no useful error message.

**Do this instead:** Derive both the platform subdirectory and the binary filename from `process.platform` in `getExecutablePaths()`. Return the platform-specific path first, keep the legacy flat path as a fallback for one release cycle, then remove it.

### Anti-Pattern 4: Building Linux Binary on Windows Runner with Cross-Compilation

**What people do:** Use `--os linux` on the Windows CI runner to cross-compile the Linux IPC binary, avoiding a second CI runner.

**Why it's wrong:** The IPC project targets `net9.0-windows` on Windows (for CSharpScript support). Cross-compilation with `--os linux` would need `net9.0` (non-Windows TFM), which is a different build configuration that is not tested on the Windows runner. The path diverges here: Windows IPC binary must be built on a Windows runner using `net9.0-windows`; Linux IPC binary must be built on a Linux runner using `net9.0`. Using the matrix pattern (one runner per platform) is the correct solution.

**Do this instead:** Use a CI matrix with `os: windows-latest` for `win-x64` and `os: ubuntu-latest` for `linux-x64`, mirroring the existing `build-native` matrix pattern.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| TypeScript launcher ↔ IPC binary | `child_process.spawn` (exePath, args, { cwd }) | cwd must be `dirname(exePath)` so .NET finds side-by-side files in non-single-file publish; irrelevant for single-file |
| IPC binary ↔ TypeScript connection | TCP JSON over loopback | Linux: TCP only (no Named Pipes). Windows: Named Pipes preferred, TCP fallback |
| npm package ↔ CI artifacts | `actions/upload-artifact` + `actions/download-artifact` | Pattern established in `build-native` → `package-native` jobs |
| native package ↔ OS | `node-gyp-build` reads `prebuilds/{platform}-{arch}/` | Already works; no changes needed |

### Key Artifact Paths After Build

| Artifact | Path in npm tarball | Built on |
|----------|---------------------|----------|
| TS bundle | `dist/index.js` | ubuntu-latest (webpack) |
| Windows IPC | `dist/win32-x64/ModInstallerIPC.exe` | windows-latest |
| Linux IPC | `dist/linux-x64/ModInstallerIPC` | ubuntu-latest |
| Win native .node | `prebuilds/win32-x64/modinstaller.napi.node` | windows-latest (existing) |
| Linux native .node | `prebuilds/linux-x64/modinstaller.napi.node` | ubuntu-latest (existing) |

## Sources

- Direct codebase inspection: `RegularProcessLauncher.ts`, `BaseIPCConnection.ts`, `build.js`, `build-packages.yml`, `ModInstaller.IPC.csproj` (HIGH confidence — first-party)
- Microsoft .NET CLI docs: `dotnet publish` — `--self-contained`, `PublishSingleFile`, `EnableCompressionInSingleFile` flags (HIGH confidence — official docs, 2025-09)
- esbuild optional-dependency pattern: per-platform scoped packages under `@esbuild/{os}-{arch}` (MEDIUM confidence — WebFetch)
- node-gyp-build `prebuilds/{platform}-{arch}/` convention: observed in `@nexusmods/fomod-installer-native` package.json + resolve-native.ts (HIGH confidence — in-repo)
- GitHub Actions matrix pattern for multi-platform builds: established in `build-native` job in `build-packages.yml` (HIGH confidence — in-repo)

---
*Architecture research for: Node.js npm package with platform-specific prebuilt .NET IPC binaries*
*Researched: 2026-04-09*
