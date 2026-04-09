# fomod-installer: Linux + Steam Proton Fork Analysis

Analysis of gaps and required work to make fomod-installer reliable for Linux mod installations targeting games run through Steam Proton. Authored against upstream `581d5a8`.

---

## Architecture Under Proton

```
Vortex (native Linux Electron)
  └── fomod-installer (native Linux: .NET AOT or IPC .NET process)
        └── reads/writes: Linux ext4 filesystem (case-sensitive)
              └── Game dir:   ~/.steam/steamapps/common/GameName/Data/
              └── Plugin dir: ~/.steam/steamapps/compatdata/<id>/pfx/drive_c/
                                users/steamuser/AppData/Local/...
```

Proton only provides case-insensitive filesystem access to **the game process**. Vortex and fomod-installer are native and see raw ext4 (case-sensitive).

---

## Gap Analysis

### 1. C# Script Silent Failure — CRITICAL

**Problem:** The Native AOT package (`@nexusmods/fomod-installer-native`) cannot execute C# scripts. When a mod contains a C# script, fomod-installer emits `type: "unsupported"` instructions. Vortex filters them out and the install continues with no error.

**Why critical under Proton:** Bethesda-game mods (Skyrim, Fallout) — almost exclusively Proton games on Linux — commonly use C# FOMOD scripts for conditional install logic:
- Registry reads (`HKLM\Software\Bethesda Softworks\...`)
- SKSE/F4SE DLL presence checks
- Game version detection from executable metadata
- Installed mod detection

All these checks produce wrong results or are skipped entirely on Linux. The mod installs but conditional branches never execute — a partial install with no user feedback.

**Root cause:** C# FOMOD scripts reference `System.Windows.Forms`, `System.Drawing.Common`, Windows registry APIs. These cannot run on Linux even via Mono.

**Fix scope:** Two parts:
- **fomod-installer (this repo):** No code fix possible for script execution. Document the limitation explicitly.
- **Vortex:** Surface a warning when `unsupported` instructions are encountered: "This mod uses a C# installer script that cannot run on Linux. Some components may not have been installed."

**Files relevant:**
- `src/InstallScripting/CSharpScript/` — the Windows-only script engine
- `src/ModInstaller.Adaptor.Dynamic/` — includes CSharpScript support
- `src/ModInstaller.Adaptor.Typed/` — XML-only, used by Native AOT
- `src/FomodInstaller.Interface/ModInstaller/Instruction.cs` — `UnsupportedFunctionalityWarning()`

---

### 2. Path Normalization at Parse Time — MEDIUM

**Problem:** XML parsers (`Parser10.cs`, `Parser20.cs`, etc.) extract `source` and `destination` path strings **verbatim** from FOMOD XML, without normalization. Normalization via `TextUtil.NormalizePath()` happens inconsistently further down the call chain. Some paths reach instruction emission with raw Windows backslashes.

**Root cause:** `TextUtil.NormalizePath()` exists and is correct, but is not called at the XML parse boundary.

```csharp
// Parser10.cs — verbatim extraction, no normalization:
string strSource = xelFile.Attribute("source").Value;
string strDest = xelFile.Attribute("destination").Value;
```

`NormalizePath()` with `alternateSeparators: true` correctly converts both `\` and `/` to `Path.DirectorySeparatorChar` on the current platform.

**Fix:** Call `TextUtil.NormalizePath(value, false, true)` on every `source` and `destination` extracted from XML in all parser classes.

**Files to change:**
- `src/InstallScripting/XmlScript/Parsers/Parser10.cs`
- `src/InstallScripting/XmlScript/Parsers/Parser20.cs`
- *(and any other versioned parsers)*

**Vortex workaround (currently in place):** `InstallManager.ts` calls `replaceAll("\\", "/")` on every instruction path. This workaround can be removed once this fix ships.

---

### 3. Case Normalization in Instruction Emit — MEDIUM

**Problem:** `GetFileList()` in `Mod.cs` matches archive contents against XML paths using `StringComparison.OrdinalIgnoreCase` (correct), but returns and emits the **archive's original case** in copy instructions. On a case-sensitive Linux filesystem, the emitted source path may not match the actual file on disk.

**Root cause:**
```csharp
// Mod.cs — case-insensitive match, but archive-case emit:
if (!NormalizedModFile.Any(x => x.Contains(file, StringComparison.InvariantCultureIgnoreCase)))
    return TransparentPng1x1;
// ... then emits the path with archive-original case
```

**Fix:** After locating a file via case-insensitive match, emit the **matched path** (real case from archive), not the XML-specified path. Alternatively, normalize all emitted source paths to lowercase via `TextUtil.NormalizePath(..., toLower: true)`.

**Files to change:**
- `src/FomodInstaller.Interface/ModInstaller/Mod.cs`

**Vortex mitigation (currently in place):** `resolvePathCase()` in `InstallManager.ts` scans the temp directory to fix the source path case at copy time. This mitigation can remain as a safety net but should not be the primary fix.

---

### 4. IPC Executable Linux Build Pipeline — MEDIUM

**Problem:** The GitHub Actions workflow does not build and package the IPC executable for Linux. The npm package for `@nexusmods/fomod-installer-ipc` only ships a Windows `.exe`. On Linux, only the Native AOT path (`@nexusmods/fomod-installer-native`) is usable, which excludes C# script support.

**Root cause:** CI only runs `dotnet publish` on a Windows runner for the IPC project.

**Note:** The IPC `.csproj` already targets `net9.0` (not `net9.0-windows`) on Linux — the build would work, the CI just doesn't do it.

**Fix:** Add a Linux runner to the build matrix that:
1. Publishes the IPC executable as a self-contained Linux ELF binary
2. Packages it into the npm tarball under a platform-specific path (e.g., `dist/linux-x64/ModInstallerIPC`)
3. Updates the TypeScript launcher to select the correct binary based on `process.platform`

**Files to change:**
- `.github/workflows/build-packages.yml` — add linux runner
- `src/ModInstaller.IPC.TypeScript/src/launchers/RegularProcessLauncher.ts` — platform binary selection

**Current fallback:** `RegularProcessLauncher.ts` already handles non-Windows by prepending `mono`, but Mono may not be installed. A self-contained binary removes this dependency.

---

### 5. CSharpScript Runtime Guard — LOW

**Problem:** CSharpScript support is gated by `#if USE_CSHARP_SCRIPT` at compile time, but there is no runtime guard. If the IPC executable is built with `USE_CSHARP_SCRIPT` defined and run on Linux, it may attempt to load Windows-only assemblies and crash.

**Fix:** Add a `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)` check in `ScriptTypeRegistry.cs` or `ModFormatManager.cs` before registering the C# script type.

```csharp
#if USE_CSHARP_SCRIPT
if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
{
    registry.RegisterType(new CSharpScriptType());
}
#endif
```

---

### 6. Path Safety Validation for Linux — LOW

**Problem:** `FileSystem.IsSafeFilePath()` checks for `..` traversal using both separators, but the full check has not been validated on Linux where `Path.GetInvalidPathChars()` returns a different set.

**Fix:** Add Linux-specific unit tests for path traversal attempts using both `../` and `..\` sequences.

---

## What Is Already Working

| Area | Status | Notes |
|---|---|---|
| Backslash→forward-slash conversion | ✅ Works | `TextUtil.NormalizePath()` uses `Path.DirectorySeparatorChar` |
| TCP transport (Named Pipes unavailable) | ✅ Works | TCP is the automatic fallback on non-Windows |
| `AppContainer` sandbox | ✅ Gated | `osSupportsAppContainer()` returns false on non-Windows |
| Native AOT `linux-x64` build | ✅ Works | `ModInstaller.Native.csproj` targets `linux-x64` |
| `alternateSeparators` in `NormalizePath` | ✅ Works | Logic is correct; call sites are inconsistent |
| `enableplugin` instruction | ✅ Works | Emits instruction only; Vortex handles path construction |
| `generatefile` binary data | ✅ Works | Written as raw bytes; no encoding issues |

---

## Recommended Fix Sequence

**Phase 1 — Core correctness (1 week)**
1. Normalize source/destination at parse time in all XML parsers
2. Emit real-case matched paths (not XML-verbatim paths) from `Mod.cs`
3. Add CSharpScript runtime OS guard

**Phase 2 — Build pipeline (1-2 weeks)**
4. Add Linux runner to CI for IPC executable build
5. Update `RegularProcessLauncher.ts` for platform binary selection

**Phase 3 — Documentation**
6. Document C# script limitation for Linux in `README.md`
7. Add Linux path edge-case unit tests

---

## Vortex Workarounds That Can Be Removed Post-Fork

Once Phase 1 ships as a versioned release:

| Workaround | Location | Can remove when |
|---|---|---|
| `replaceAll("\\", "/")` on instructions | `InstallManager.ts:7923-7924` | Parser normalization fix ships |
| `resolvePathCase()` on source path | `InstallManager.ts:7929` | Case emit fix ships (keep as safety net) |
