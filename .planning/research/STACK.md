# Stack Research

**Domain:** Linux/Proton FOMOD installer — .NET 9 self-contained binary publishing in Node.js npm packages
**Researched:** 2026-04-09
**Confidence:** HIGH (all three areas verified against official documentation)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| .NET 9 SDK | 9.x | IPC executable build on Linux runner | Already in use; `net9.0` TFM on Linux confirmed cross-platform in `.csproj` |
| `dotnet publish` with `-r linux-x64 --self-contained` | .NET 9 CLI | Produce self-contained ELF binary | Eliminates Mono dependency; binary runs without .NET runtime installed |
| `PublishSingleFile=true` | MSBuild property | Bundle all deps into one ELF file | Simplifies packaging — single file in `dist/linux-x64/` instead of directory tree |
| `PublishTrimmed=true` | MSBuild property | Reduce binary size | Works with `PublishSingleFile`; removes unused assemblies |
| `ubuntu-22.04` runner | GitHub Actions | Build environment for Linux binary | GLIBC 2.35 — ships .NET 9 SDK natively; binaries run on Ubuntu 22.04+ and Arch/SteamOS |
| `optionalDependencies` + `os`/`cpu` fields | npm/pnpm | Platform binary selection | Industry-standard pattern (esbuild, Vite, Rollup); zero install-script risk |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node-gyp-build` | 4.8.4 | Already used for native bindings | Not needed for IPC binary selection — `process.platform` check is sufficient |
| `clang`, `zlib1g-dev` | system | AOT compilation prerequisites on Ubuntu | Only if switching IPC to Native AOT (`PublishAot=true`); not needed for `PublishSingleFile` |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `actions/setup-dotnet@v5` | Install .NET SDK on CI runner | Pin to `dotnet-version: '9.x'`; already in use in `build-packages.yml` |
| `actions/upload-artifact@v4` | Share binary between CI jobs | Already in use for native prebuilds; same pattern for IPC |
| `actions/download-artifact@v4` | Collect platform binaries in packaging job | Same pattern already implemented for native matrix |

---

## dotnet publish Flags for Self-Contained linux-x64 Binary

The IPC project (`ModInstaller.IPC.csproj`) already has the `PublishSingleFile` / `PublishTrimmed` / `SelfContained` properties in the file but commented out. Use them on the command line for the Linux CI step — don't uncomment in the `.csproj` because the Windows build should continue using its own publish profile.

**Recommended command for Linux CI step:**

```bash
dotnet publish src/ModInstaller.IPC/ModInstaller.IPC.csproj \
  -c Release \
  -r linux-x64 \
  --self-contained true \
  -p:PublishSingleFile=true \
  -p:PublishTrimmed=true \
  -p:EnableCompressionInSingleFile=true \
  -p:DebugType=none \
  -p:DebugSymbols=false \
  -o src/ModInstaller.IPC.TypeScript/dist/linux-x64/
```

**Flag rationale:**
- `-r linux-x64`: Sets the Runtime Identifier; required for self-contained publish. The IPC `.csproj` already sets `TargetFramework=net9.0` (not `net9.0-windows`) when `$(OS) != Windows_NT`, so this works.
- `--self-contained true`: Bundles the .NET runtime into the output. No .NET runtime required on the target machine. This is the constraint from `PROJECT.md`.
- `-p:PublishSingleFile=true`: Merges all outputs into one ELF file (`ModInstallerIPC`, no `.exe` extension on Linux). Simplifies the `files` manifest in `package.json`.
- `-p:PublishTrimmed=true`: Required by `PublishSingleFile=true` for self-contained apps; removes unused assemblies.
- `-p:EnableCompressionInSingleFile=true`: Compresses embedded assemblies; reduces binary from ~70MB to ~30-40MB typical for .NET 9 apps.
- `-p:DebugType=none -p:DebugSymbols=false`: Mirrors the existing `<PropertyGroup Condition="$(Configuration) == 'Release'">` block that already does this — explicit on CLI to ensure it applies even if project file conditions differ.
- `-o src/ModInstaller.IPC.TypeScript/dist/linux-x64/`: Outputs directly into the IPC TypeScript package's `dist/` directory under a platform subdirectory.

**What NOT to use:**
- `-p:PublishAot=true` for the IPC project — see "What NOT to Use" section below.

**Windows equivalent for parity (in `build.js` or CI):**

```bash
dotnet publish src/ModInstaller.IPC/ModInstaller.IPC.csproj \
  -c Release \
  -r win-x64 \
  --self-contained true \
  -p:PublishSingleFile=true \
  -p:PublishTrimmed=true \
  -p:EnableCompressionInSingleFile=true \
  -o src/ModInstaller.IPC.TypeScript/dist/win32-x64/
```

Note: The Windows build uses `net9.0-windows` TFM (set by `$(OS) == Windows_NT` condition in `.csproj`), which is correct — it includes WinForms/Registry APIs needed for C# script support.

---

## GitHub Actions Matrix Pattern

The existing `build-native` job already uses a matrix with `windows-latest` and `ubuntu-latest`. The `build-ipc` job currently runs only on `ubuntu-latest` and does not build a platform-specific binary.

**Recommended matrix for `build-ipc`:**

```yaml
build-ipc:
  strategy:
    matrix:
      include:
        - os: windows-latest
          rid: win-x64
          platform: win32-x64
          binary: ModInstallerIPC.exe
        - os: ubuntu-22.04
          rid: linux-x64
          platform: linux-x64
          binary: ModInstallerIPC

  runs-on: ${{ matrix.os }}

  steps:
    - uses: actions/checkout@v6

    - uses: actions/setup-dotnet@v5
      with:
        dotnet-version: '9.x'

    - name: Publish IPC binary
      run: |
        dotnet publish src/ModInstaller.IPC/ModInstaller.IPC.csproj \
          -c Release \
          -r ${{ matrix.rid }} \
          --self-contained true \
          -p:PublishSingleFile=true \
          -p:PublishTrimmed=true \
          -p:EnableCompressionInSingleFile=true \
          -p:DebugType=none \
          -p:DebugSymbols=false \
          -o ipc-publish/${{ matrix.platform }}/

    - name: Sign Windows binary
      if: matrix.os == 'windows-latest'
      shell: bash
      run: |
        if [ -n "$SIGN_TOOL" ]; then
          "$SIGN_TOOL" sign /sha1 "$SIGN_THUMBPRINT" /td sha256 /fd sha256 \
            /tr http://timestamp.comodoca.com \
            ipc-publish/${{ matrix.platform }}/${{ matrix.binary }}
        fi
      env:
        SIGN_TOOL: ${{ secrets.SIGN_TOOL }}
        SIGN_THUMBPRINT: ${{ secrets.SIGN_THUMBPRINT }}

    - name: Upload IPC binary artifact
      uses: actions/upload-artifact@v4
      with:
        name: ipc-${{ matrix.platform }}
        path: ipc-publish/${{ matrix.platform }}/${{ matrix.binary }}

package-ipc:
  needs: build-ipc
  runs-on: ubuntu-latest

  steps:
    - uses: actions/checkout@v6

    - name: Install Node.js via Volta
      uses: volta-cli/action@v4

    - name: Setup pnpm
      uses: pnpm/action-setup@v4

    - name: Install dependencies
      run: pnpm install

    - name: Build webpack bundle and declarations
      run: pnpm --filter @nexusmods/fomod-installer-ipc build-webpack

    - name: Download all IPC binaries
      uses: actions/download-artifact@v4
      with:
        path: src/ModInstaller.IPC.TypeScript/dist/
        pattern: ipc-*
        merge-multiple: false

    - name: Move binaries into dist structure
      working-directory: src/ModInstaller.IPC.TypeScript
      shell: bash
      run: |
        for dir in dist/ipc-*/; do
          platform=$(basename "$dir" | sed 's/^ipc-//')
          mkdir -p "dist/$platform"
          mv "$dir"* "dist/$platform/"
          rmdir "$dir"
        done
        find dist/ -type f

    - name: Pack tarball
      working-directory: src/ModInstaller.IPC.TypeScript
      run: npm pack

    - name: Upload IPC package tarball
      uses: actions/upload-artifact@v4
      with:
        name: ipc-package
        path: src/ModInstaller.IPC.TypeScript/*.tgz
```

**Why `ubuntu-22.04` not `ubuntu-latest`:**
- `ubuntu-latest` currently resolves to `ubuntu-24.04` (GLIBC 2.39). Binaries built on GLIBC 2.39 will not run on Ubuntu 22.04 systems (GLIBC 2.35). The .NET docs explicitly warn: "A Native AOT binary produced on Linux machine is only going to work on same or newer Linux version."
- While this fork targets Vortex/Steam Deck (Arch, GLIBC >= 2.38), pinning to `ubuntu-22.04` (GLIBC 2.35) provides maximum compatibility with all supported Linux distros. This is the same strategy used by esbuild, Vite, and similar tools.
- SteamOS 3 (Arch-based) ships GLIBC >= 2.38 — a `ubuntu-22.04`-built binary runs fine on Steam Deck.
- Pin the runner explicitly (`ubuntu-22.04`) rather than `ubuntu-latest` to prevent silent breakage when GitHub bumps the `latest` alias.

---

## Node.js Platform Binary Selection

### Recommended Pattern: `process.platform` check in `RegularProcessLauncher.ts`

The existing `RegularProcessLauncher.ts` already has a `process.platform !== 'win32'` guard for the Mono fallback. Replace that block with a platform binary resolver.

**Recommended implementation:**

```typescript
import path from 'path';
import os from 'os';

/**
 * Resolves the IPC executable path for the current platform.
 * Binaries are co-located in dist/ under platform subdirectories:
 *   dist/win32-x64/ModInstallerIPC.exe  (Windows)
 *   dist/linux-x64/ModInstallerIPC      (Linux)
 */
function resolveIPCBinaryPath(distDir: string): string {
  const platform = process.platform; // 'win32' | 'linux' | 'darwin'
  const arch = process.arch;         // 'x64' | 'arm64'

  // Map Node.js platform/arch to the directory layout used by CI
  const platformKey = `${platform}-${arch}`; // e.g. 'linux-x64', 'win32-x64'

  const binaryName = platform === 'win32' ? 'ModInstallerIPC.exe' : 'ModInstallerIPC';
  const binaryPath = path.join(distDir, platformKey, binaryName);

  if (!require('fs').existsSync(binaryPath)) {
    throw new Error(
      `IPC binary not found for platform '${platformKey}' at: ${binaryPath}. ` +
      `This platform may not be supported.`
    );
  }

  return binaryPath;
}
```

**Usage in `RegularProcessLauncher.ts` — replace the Mono block:**

```typescript
// Replace this existing block:
if (process.platform !== 'win32' && exePath.toLowerCase().endsWith('.exe')) {
  actualExePath = 'mono';
  actualArgs = [exePath, ...args];
}

// With this:
// exePath is now the platform-resolved path from resolveIPCBinaryPath()
// No Mono invocation needed — binary is self-contained for the current platform
// The caller (BaseIPCConnection or wherever launch() is called) resolves the path
// before passing it to launch().
```

**Where to call `resolveIPCBinaryPath`:** In the IPC connection setup, not inside `RegularProcessLauncher.launch()`. The launcher should accept any path — the resolution is a higher-level concern. Add a `getIPCBinaryPath(): string` function in a new `src/ipc-binary.ts` module alongside `RegularProcessLauncher.ts`.

**`process.platform` valid values (Node.js docs):**
- `'win32'` — Windows (32-bit or 64-bit)
- `'linux'` — Linux
- `'darwin'` — macOS
- `'freebsd'`, `'openbsd'`, `'sunos'`, `'aix'` — other

Note: `process.arch` returns `'x64'`, `'arm64'`, `'ia32'`, etc. Use both to construct the platform directory key, so future `linux-arm64` support is trivial to add.

### Why NOT optionalDependencies for this project

The `optionalDependencies` + separate platform packages pattern (esbuild-style) is the right choice when:
- You're distributing to unknown consumers who may be on any platform
- You want npm/pnpm to automatically skip downloading binaries for other platforms at install time
- The binaries are large (esbuild ~7MB per platform)

For this project, the IPC binary (self-contained .NET, ~30-50MB) is already inside `@nexusmods/fomod-installer-ipc`. The package is consumed only by Vortex — a controlled consumer on known platforms. Splitting into `@nexusmods/fomod-installer-ipc-win32-x64` and `@nexusmods/fomod-installer-ipc-linux-x64` adds publishing complexity for no real benefit (Vortex ships all platforms anyway and has its own update mechanism).

The `process.platform` + `process.arch` check inside a single package is the right call here. It is:
- Simpler — one package to publish and version
- Sufficient — Vortex does not download packages on-device; it bundles them
- Precedented — the existing `build-native` matrix already ships both `win32-x64` and `linux-x64` prebuilds in one tarball

### Why NOT install scripts (`postinstall`)

- `postinstall` scripts are blocked by `--ignore-scripts` (common in CI)
- pnpm workspaces suppress `postinstall` unless explicitly configured via `onlyBuiltDependencies` or `allowedDeprecatedVersions`
- The binary is already in `dist/` after `dotnet publish` — no download needed at install time
- Install scripts that compile or download are a security red flag for enterprise/audit environments

### Why NOT `pkg` or `nexe`

These tools bundle Node.js + the app into a single executable. Not applicable here — the IPC binary is a .NET process, not Node.js.

---

## `package.json` `files` Field Update

The IPC package's `package.json` currently only ships `dist/`. The platform binaries land in `dist/linux-x64/` and `dist/win32-x64/`, so no `files` change is needed — `dist/` already captures them.

However, the binaries are large. Consider verifying the tarball size after the change:

```bash
npm pack --dry-run
```

A `PublishSingleFile` + `PublishTrimmed` + `EnableCompressionInSingleFile` .NET 9 binary is typically 25-45MB. Including two platform binaries (~50-90MB total) in one tarball is within npm registry limits (1GB) but may be worth documenting.

---

## Installation

No new npm packages required. The change is entirely:
1. CI workflow changes (`.github/workflows/build-packages.yml`)
2. `build.js` updates to add `-r` and `--self-contained` flags
3. `RegularProcessLauncher.ts` + new `ipc-binary.ts` platform resolver

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `PublishSingleFile=true` self-contained | `PublishAot=true` (Native AOT) for IPC | Use AOT if the IPC project has no reflection-heavy code and you need sub-1s startup time. IPC uses Newtonsoft.Json and `ModInstaller.Adaptor.Dynamic` which likely uses reflection — AOT trim analysis will emit many warnings. Not worth the risk for an IPC process. |
| `ubuntu-22.04` runner | `ubuntu-latest` | Use `ubuntu-latest` only if you accept GLIBC >= 2.39 requirement (excludes Ubuntu 22.04 users) |
| `ubuntu-22.04` runner | Alpine/musl container | Use musl if you need to target Alpine-based systems (NixOS, some Arch users with musl). Adds complexity; not needed for standard distros or Steam Deck. |
| `process.platform` check in single package | esbuild-style `optionalDependencies` split | Use split packages when publishing to npm for general consumption and binary size matters at install time. Not appropriate for a Vortex-specific internal package. |
| `dist/linux-x64/ModInstallerIPC` path layout | Single `dist/` with platform suffix in filename | Subdirectory layout is cleaner and matches `prebuilds/` convention already used by the native package |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `PublishAot=true` for IPC project | The IPC project references `ModInstaller.Adaptor.Dynamic` which uses dynamic type loading; AOT will generate trimming warnings and may produce a broken binary. The commented-out `<PublishAot>true</PublishAot>` in the `.csproj` was likely abandoned for this reason. | `PublishSingleFile=true` + `PublishTrimmed=true` (non-AOT self-contained) |
| `mono` fallback in `RegularProcessLauncher.ts` | Mono may not be installed on target Linux system; this is the exact gap `PROTON-VORTEX.md` documents in Gap #4. Mono is explicitly ruled out in `PROJECT.md`. | Self-contained `ModInstallerIPC` ELF binary resolved via `process.platform` |
| `ubuntu-latest` for Linux binary builds | Currently resolves to `ubuntu-24.04` (GLIBC 2.39); binaries will not run on Ubuntu 22.04 or any system with GLIBC < 2.39. | `ubuntu-22.04` (GLIBC 2.35) pinned explicitly |
| `dotnet publish` without `-r linux-x64` | Produces a framework-dependent executable (requires .NET runtime on target) — exactly what the current `build-ipc` job does, which is why no Linux binary ships today | `dotnet publish -r linux-x64 --self-contained true` |
| `postinstall` download scripts | Blocked by `--ignore-scripts`; pnpm workspace suppresses them; security red flag in enterprise CI | Ship binaries directly in the tarball via `dist/` |
| `net9.0-windows` TFM for Linux build | The IPC `.csproj` already conditionally uses `net9.0` on non-Windows — this is correct. Do not force `net9.0-windows` on Linux runner; it would fail or exclude C#-script dependencies appropriately. | Let `.csproj` OS condition handle TFM selection |

---

## Stack Patterns by Variant

**If targeting linux-arm64 in the future (Steam Deck ARM, Raspberry Pi):**
- Add a third matrix entry: `os: ubuntu-22.04, rid: linux-arm64, platform: linux-arm64, binary: ModInstallerIPC`
- The `dotnet publish -r linux-arm64` cross-compile from `ubuntu-22.04` x64 requires additional toolchain: `sudo apt-get install -y clang gcc-aarch64-linux-gnu binutils-aarch64-linux-gnu zlib1g-dev`
- The `process.arch` check in `resolveIPCBinaryPath()` handles this automatically

**If switching IPC to Native AOT in the future:**
- Prerequisite: Audit `ModInstaller.Adaptor.Dynamic` for reflection usage (`Assembly.Load`, `Activator.CreateInstance`, etc.)
- Add `clang` and `zlib1g-dev` to the Linux runner install step
- Replace `PublishSingleFile=true` with `PublishAot=true` (AOT implies single file)
- Remove `PublishTrimmed=true` (AOT implies trimming)
- Note: Cross-OS AOT compilation is explicitly NOT supported by .NET — you must use a Linux runner to produce a Linux AOT binary

---

## Version Compatibility

| Component | Compatibility Note |
|-----------|-------------------|
| `.NET 9` + `PublishSingleFile=true` on Linux | GLIBC >= 2.17 minimum for .NET 9 runtime; binary compiled on Ubuntu 22.04 (GLIBC 2.35) requires GLIBC >= 2.35 on target |
| `ubuntu-22.04` GitHub runner | Ships .NET 9.x SDK natively (9.0.115, 9.0.205, 9.0.312 confirmed installed) — no manual SDK install step needed beyond `actions/setup-dotnet@v5` |
| `actions/checkout@v6` | Already in use; no change needed |
| `process.platform === 'linux'` | Node.js >=22 (already enforced by `engines` field); value is stable across all Node.js versions |

---

## Sources

- [learn.microsoft.com — dotnet publish](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-publish) — CLI flags, `--self-contained`, `-r`, MSBuild properties — HIGH confidence (official docs, updated 2026-02-04)
- [learn.microsoft.com — Native AOT deployment overview](https://learn.microsoft.com/en-us/dotnet/core/deploying/native-aot/) — `PublishAot`, platform restrictions, GLIBC warning — HIGH confidence (official docs, updated 2026-01-08)
- [learn.microsoft.com — Native AOT cross-compilation](https://learn.microsoft.com/en-us/dotnet/core/deploying/native-aot/cross-compile) — cross-OS limitation confirmed — HIGH confidence (official docs)
- [actions/runner-images Ubuntu 22.04 README](https://raw.githubusercontent.com/actions/runner-images/main/images/ubuntu/Ubuntu2204-Readme.md) — GLIBC 2.35 (`libc6-dev 2.35-0ubuntu3.13`), .NET 9.x SDK confirmed — HIGH confidence (source of truth for runner contents)
- [esbuild install docs](https://esbuild.github.io/getting-started/#install-esbuild) — `optionalDependencies` + `os`/`cpu` platform package pattern — HIGH confidence, but not recommended for this use case
- `src/ModInstaller.IPC/ModInstaller.IPC.csproj` — OS-conditional TFM, commented-out publish properties — direct codebase inspection
- `src/ModInstaller.IPC.TypeScript/src/launchers/RegularProcessLauncher.ts` — existing Mono fallback — direct codebase inspection
- `.github/workflows/build-packages.yml` — existing matrix pattern for native package — direct codebase inspection

---

*Stack research for: Linux IPC binary publishing in @nexusmods/fomod-installer-ipc*
*Researched: 2026-04-09*
