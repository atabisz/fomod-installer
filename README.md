> **Community Fork — Linux / Steam Proton**
>
> This is an unofficial community fork of [Nexus-Mods/fomod-installer](https://github.com/Nexus-Mods/fomod-installer).
> Its sole purpose is to make Vortex work correctly on Linux under Steam Proton.
> It is not affiliated with or endorsed by Nexus Mods.
>
> If you are looking for the official library, go here: https://github.com/Nexus-Mods/fomod-installer
>
> This fork is intended to be paired with the companion Vortex fork: [atabisz/Vortex](https://github.com/atabisz/Vortex)

---

# FOMOD Installer

A library for processing [FOMOD](https://fomod-docs.readthedocs.io/) mod archives, the standard format used by game modding communities to package and install mods with user-configurable options. Built primarily for [Vortex](https://www.nexusmods.com/about/vortex/), the Nexus Mods mod manager.

## What this fork fixes

The upstream library was written for Windows. On Linux with Steam Proton, FOMOD installations silently produce wrong results due to path case-sensitivity bugs, missing backslash normalization, and an IPC build pipeline that only ships a Windows executable. This fork addresses those gaps:

- **Path normalization at parse time** — `source`/`destination` paths from FOMOD XML are normalized to the platform separator before they reach instruction emit
- **Case-correct instruction emit** — emitted source paths use the real case from the archive, not the XML-verbatim string, so copies succeed on ext4
- **CSharpScript runtime guard** — prevents Windows-only script assemblies from loading on Linux
- **IPC Linux build pipeline** — CI now builds and packages a self-contained Linux ELF binary so the IPC path works without Mono

## How it works

The installer reads a FOMOD archive, parses its install script (XML-based or C#-based), walks the user through any configuration steps the mod author defined, and produces a list of files to install.

There are two ways to consume it from Node.js:

- **IPC** (`@nexusmods/fomod-installer-ipc`) — spawns a .NET process and communicates over stdin/stdout. Supports the full feature set including C# scripts (Windows only; Linux uses an ELF binary without C# support).
- **Native** (`@nexusmods/fomod-installer-native`) — loads a Native AOT compiled shared library via N-API. Lighter weight, no .NET runtime required, limited to XML scripts.

## Linux notes

**C# script FOMADs are not supported on Linux.** The .NET C# script engine depends on Windows-only assemblies (`System.Windows.Forms`, `System.Drawing.Common`, Windows registry APIs). On Linux, the installer emits an `UnsupportedFunctionalityWarning` instruction with `reason` and `platform` fields instead of crashing. Callers should display this warning to the user. XML-based FOMADs (the vast majority) work normally on all platforms.

**Recommended Linux path:** Use the native AOT package (`@nexusmods/fomod-installer-native`). It loads a precompiled shared library via N-API with no .NET runtime dependency. It supports XML scripts only, which covers the vast majority of FOMOD mods.

**IPC on Linux:** The IPC package (`@nexusmods/fomod-installer-ipc`) ships a self-contained Linux ELF binary from v0.13.0+. The IPC path works on Linux for XML script FOMADs, but C# scripts still do not execute (the warning is emitted instead).

**Vortex workarounds that can be removed** after this fork's fixes land:

- `replaceAll("\\", "/")` at `InstallManager.ts:7923-7924` — path normalization is now handled at parse time in the installer (PATH-01)
- `resolvePathCase()` at `InstallManager.ts:7929` — can remain as a safety net, but the installer now emits archive-case paths directly (PATH-02)

## Project structure

```
src/
  FomodInstaller.Interface/   Core interfaces and data types
  Utils/                      Shared utilities
  AntlrUtil/                  ANTLR 3 parser helpers

  InstallScripting/
    Scripting/                Base scripting abstractions
    XmlScript/                XML-based FOMOD script interpreter (versions 1.0-5.0)
    CSharpScript/             C# script execution (Windows only)

  ModInstaller.Adaptor.Dynamic/   Full adapter with all script types
  ModInstaller.Adaptor.Typed/     Lightweight adapter (XML scripts only)

  ModInstaller.IPC/               .NET executable for IPC-based integration
  ModInstaller.IPC.TypeScript/    npm package wrapping the IPC executable

  ModInstaller.Native/            Native AOT shared library (win-x64, linux-x64)
  ModInstaller.Native.TypeScript/ npm package with N-API bindings to the native library

test/                         Test projects and shared test data
```

## Requirements

- .NET 9 SDK
- Node.js 22+
- pnpm

## Local development with Vortex

This fork is intended to be consumed by a local [Vortex](https://github.com/atabisz/Vortex) clone via pnpm `link:`. No publishing step required.

### First-time setup

**1. Build this repo:**

```bash
cd /path/to/fomod-installer
pnpm install
pnpm --filter @nexusmods/fomod-installer-ipc build
pnpm --filter @nexusmods/fomod-installer-native build
```

**2. Add overrides to Vortex's root `package.json`** (adjust the path to match your clone location):

```json
"pnpm": {
  "overrides": {
    "@nexusmods/fomod-installer-ipc": "link:../fomod-installer/src/ModInstaller.IPC.TypeScript",
    "@nexusmods/fomod-installer-native": "link:../fomod-installer/src/ModInstaller.Native.TypeScript"
  }
}
```

**3. Reinstall Vortex dependencies:**

```bash
cd /path/to/Vortex
pnpm install
```

### After making changes

No `pnpm install` in Vortex needed — the symlink picks up changes immediately.

If you changed the IPC TypeScript layer (the common case for Linux port work):

```bash
pnpm --filter @nexusmods/fomod-installer-ipc build
```

If you changed both packages:

```bash
pnpm --filter @nexusmods/fomod-installer-ipc build
pnpm --filter @nexusmods/fomod-installer-native build
```

If you changed the native C++ bindings (`src/ModInstaller.Native/`), electron-rebuild must also be re-run in Vortex:

```bash
pnpm --filter @nexusmods/fomod-installer-native build
cd /path/to/Vortex && pnpm install   # triggers electron-rebuild
```

### Teardown

Remove the `pnpm.overrides` block from Vortex's `package.json` and run `pnpm install` to revert to the published npm packages.

## License

[GPL-3.0](LICENSE.md)
