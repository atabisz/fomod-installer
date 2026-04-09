---
phase: 03-ux-hardening
reviewed: 2026-04-09T10:37:23Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/FomodInstaller.Interface/ModInstaller/Instruction.cs
  - src/ModInstaller.Adaptor.Dynamic/Installer.cs
  - src/ModInstaller.IPC.TypeScript/test/verify-warning.spec.ts
  - test/Utils.Tests/FileSystemTests.cs
  - README.md
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-04-09T10:37:23Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Five files were reviewed covering the UX hardening work: the `Instruction` type, the dynamic adaptor `Installer`, the IPC verification test, the `FileSystem` utility tests, and README documentation.

The C# code is generally well-structured with no critical security issues. Three correctness issues were found: a missing `forceRelative` guard on `CreateIniEdit`, a single-separator directory-detection bug in `BasicModInstall`, and a path construction bug in the TypeScript test that causes the constructed file paths to not exist on disk on Linux. A fourth warning covers the missing platform guard on the Linux-specific `FileSystemTests`, which will produce false failures when run on Windows.

No critical (security/crash) issues were found.

---

## Warnings

### WR-01: `CreateIniEdit` skips `forceRelative` — path traversal possible on malicious input

**File:** `src/FomodInstaller.Interface/ModInstaller/Instruction.cs:86-95`
**Issue:** Every other factory method that accepts a `destination` path calls `forceRelative(destination)` before storing it. `CreateIniEdit` passes `fileName` raw into `destination` without stripping leading separators. A malicious or malformed FOMOD script could supply a rooted path (e.g., `/etc/somefile.ini` on Linux or `C:\Windows\file.ini` on Windows) that escapes the install directory. `IsSafeFilePath` is the downstream guard but this is defence-in-depth that every other factory already applies.

**Fix:**
```csharp
public static Instruction CreateIniEdit(string fileName, string section, string key, string value)
{
    return new Instruction
    {
        type = "iniedit",
        destination = forceRelative(fileName),   // was: destination = fileName
        section = section,
        key = key,
        value = value,
    };
}
```

---

### WR-02: `BasicModInstall` directory-entry filter misses `AltDirectorySeparatorChar`

**File:** `src/ModInstaller.Adaptor.Dynamic/Installer.cs:222`
**Issue:** Archive entries that represent directories are skipped by checking for a trailing `Path.DirectorySeparatorChar`. On Linux this is `/`; on Windows this is `\`. However, ZIP archives commonly use `/` as the separator regardless of platform, so on Windows a directory entry ending in `/` would pass the filter and be handed to `Instruction.CreateCopy`, producing a spurious "copy" instruction for a directory path. The same check exists symmetrically in the Typed adaptor.

**Fix:**
```csharp
if (ArchiveFile.EndsWith("" + Path.DirectorySeparatorChar)
    || ArchiveFile.EndsWith("" + Path.AltDirectorySeparatorChar))
{
    // don't include directories, only files
    continue;
}
```

---

### WR-03: Test file path construction produces non-existent paths on Linux

**File:** `src/ModInstaller.IPC.TypeScript/test/verify-warning.spec.ts:86-95`
**Issue:** The `scan` function builds relative paths using backslash as a separator (`${prefix}\\${entry.name}`) to mimic IPC convention, then calls `path.join(tempDir, rel)` to form the absolute path pushed into `files[]`. On Linux, `path.join` does not interpret `\` as a directory separator, so `path.join('/tmp/foo', 'fomod\\script.cs')` yields `/tmp/foo/fomod\script.cs` — a path with a literal backslash in the filename that does not exist on disk. The actual extracted file lives at `/tmp/foo/fomod/script.cs`.

While the C# CSharpScript detection normalises backslashes before inspection (`f.Replace('\\', '/')`), any IPC-side code that tries to open these paths (e.g., to read the script file) will get a `FileNotFoundException`.

**Fix:** Separate the IPC-convention relative path from the absolute filesystem path:
```typescript
const files: string[] = [];
function scan(dir: string, prefix: string = ''): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // IPC convention: backslash-joined relative path
    const rel = prefix ? `${prefix}\\${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      scan(path.join(dir, entry.name), rel);
    } else {
      // Push the IPC-convention relative path, not the absolute OS path
      files.push(rel);
    }
  }
}
scan(tempDir);
```
If the IPC server requires absolute paths for file reading, pass `tempDir` as the `scriptPath` and keep `files` as relative paths. If it requires absolute paths, join using `path.join(dir, entry.name)` (not `path.join(tempDir, rel)`).

---

### WR-04: `FileSystemTests` Linux-only tests will fail on Windows with no platform guard

**File:** `test/Utils.Tests/FileSystemTests.cs:17-35`
**Issue:** `BackslashIsNotTraversalOnLinux` and `EmbeddedBackslashIsNotTraversalOnLinux` assert that `IsSafeFilePath("..\\foo")` and `IsSafeFilePath("foo/..\\bar")` return `true`. These assertions are correct for Linux (where `\` is a valid filename character, not a path separator). However, on Windows `Path.DirectorySeparatorChar = '\'` so `IsSafeFilePath("..\\foo")` returns `false`, and these tests will fail. There are no `[Platform]` attributes, `[SkipOn]` attributes, or `RuntimeInformation` guards.

**Fix:** Add a platform condition so these tests are only asserted on Linux:
```csharp
[Test]
[SkipOnPlatform(TestPlatforms.Windows, "Backslash is a separator on Windows; traversal blocked there")]
public async Task BackslashIsNotTraversalOnLinux()
{
    await Assert.That(Utils.FileSystem.IsSafeFilePath("..\\foo")).IsEqualTo(true);
}

[Test]
[SkipOnPlatform(TestPlatforms.Windows, "Backslash is a separator on Windows; traversal blocked there")]
public async Task EmbeddedBackslashIsNotTraversalOnLinux()
{
    await Assert.That(Utils.FileSystem.IsSafeFilePath("foo/..\\bar")).IsEqualTo(true);
}
```
Alternatively, split each into two tests — one for each expected platform outcome — and gate with `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)`.

---

## Info

### IN-01: `GetHashCode` hashes `data` by length only — weak but valid

**File:** `src/FomodInstaller.Interface/ModInstaller/Instruction.cs:36`
**Issue:** The `GetHashCode` override hashes the `data` byte array by its length (`data?.Length ?? 0`) rather than its content. This is a legally correct hash — `Equals` fully compares content — but produces significant hash collisions for `generatefile` instructions when multiple files have the same byte count. If `Instruction` objects are ever stored in a `HashSet` or used as `Dictionary` keys at scale, lookup degrades from O(1) toward O(n).

**Fix:** Consider incorporating a sample of the byte content into the hash (first/last few bytes), or use `SequenceGetHashCode` if available:
```csharp
hash = hash * 31 + (data != null && data.Length > 0
    ? data[0] ^ (data[data.Length - 1] << 8) ^ data.Length
    : 0);
```
This is informational — the current code is correct and this only matters if `Instruction` is used as a hash key.

---

### IN-02: `Instructions.Insert(0, ...)` depends on `ScriptedModInstall` returning a mutable list

**File:** `src/ModInstaller.Adaptor.Dynamic/Installer.cs:141-143`
**Issue:** `Instructions` is typed as `IList<Instruction>`. After `ScriptedModInstall` or `BasicModInstall`, the code calls `Instructions.Insert(0, ...)` to prepend the CSharpScript warning. If either method ever returns a read-only `IList<T>` (e.g., `Array`, `List<T>.AsReadOnly()`, or `ImmutableList`), this throws `NotSupportedException` at runtime. Currently both callee methods return concrete `List<Instruction>`, so the bug is latent.

**Fix:** Cast to `List<Instruction>` explicitly (makes the contract clear and gives a compile-time or early-runtime signal), or collect the warning into a new list:
```csharp
var mutableInstructions = Instructions as List<Instruction>
    ?? new List<Instruction>(Instructions);
if (emitCSharpScriptWarning)
{
    mutableInstructions.Insert(0, Instruction.UnsupportedFunctionalityWarning(
        "CSharpScript", "CSharpScript not supported on Linux", "linux"));
}
return new Dictionary<string, object>
{
    { "message", "Installation successful" },
    { "instructions", mutableInstructions }
};
```

---

_Reviewed: 2026-04-09T10:37:23Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
