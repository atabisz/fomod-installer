---
phase: 01-c-correctness
reviewed: 2026-04-09T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - src/InstallScripting/XmlScript/Parsers/Parser10.cs
  - src/InstallScripting/XmlScript/XmlScriptInstaller.cs
  - src/ModInstaller.Adaptor.Dynamic/ModFormatManager.cs
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-09
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

These three files contain the Phase 1 C# correctness fixes (PATH-01, PATH-02, GUARD-01). All three planned fixes are correctly applied:

- `Parser10.cs` — `ReadFileInfo()` now wraps both `source` and `destination` with `TextUtil.NormalizePath(value, false, true)`. The `using Utils;` directive is present.
- `XmlScriptInstaller.cs` — `InstallFile()` now captures `GetFileList()` return value and uses `matchedFiles[0]` (archive-case path) as the source for `InstallFileFromMod`. Variable renamed `strSourceXml` correctly.
- `ModFormatManager.cs` — Both CSharpScript registration sites are guarded with `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)`. `using System.Runtime.InteropServices;` is present.

The planned fixes are correct. The review found four warnings and three info items, all pre-existing in the original code rather than introduced by the Phase 1 changes. None block the Phase 1 goals, but two warnings are correctness hazards worth tracking.

---

## Warnings

### WR-01: Null dereference on `GetSchemaInfo()` chain in `LoadCondition()`

**File:** `src/InstallScripting/XmlScript/Parsers/Parser10.cs:179`
**Issue:** `p_xelCondition.GetSchemaInfo().SchemaType.Name` dereferences a two-step chain where either `GetSchemaInfo()` or `.SchemaType` can return null. `IXmlSchemaInfo.SchemaType` is documented as nullable and returns null when the element was not validated against a schema. If a FOMOD XML file is loaded without schema validation (or schema validation is skipped/failed), this line will throw `NullReferenceException` without any diagnostic context, crashing the whole install rather than producing a useful error instruction.

**Fix:**
```csharp
var schemaInfo = p_xelCondition.GetSchemaInfo();
if (schemaInfo?.SchemaType?.Name == null)
    throw new ParserException(
        "Condition node has no schema type — was the XML validated? Node: " + p_xelCondition.Name);
switch (schemaInfo.SchemaType.Name)
{
    // ... existing cases unchanged
```

---

### WR-02: `.Value` on null `XElement` crashes in `GetHeaderInfo()`

**File:** `src/InstallScripting/XmlScript/Parsers/Parser10.cs:102`
**Issue:** `Script.Element("moduleName")` returns null when the element is absent from the XML. Calling `.Value` on null throws `NullReferenceException`. While schema validation should guarantee the element's presence, the same argument applies as WR-01: if schema validation is bypassed or schema enforcement is loose, this crashes with no context.

**Fix:**
```csharp
var moduleNameEl = Script.Element("moduleName")
    ?? throw new ParserException("Required 'moduleName' element is missing from FOMOD XML.");
return new HeaderInfo(moduleNameEl.Value, Color.FromKnownColor(KnownColor.ControlText), TextPosition.Left, null, true, true, -1);
```

---

### WR-03: `condition` path stored as `.ToLower()` in `LoadCondition()` — inconsistent with PATH-01 normalization

**File:** `src/InstallScripting/XmlScript/Parsers/Parser10.cs:188,192`
**Issue:** Plugin dependency file paths (`"dependancy"` case, line 188, and `"moduleFileDependancy"` case, line 192) are stored via `.ToLower()` alone:
```csharp
string strCondition = p_xelCondition.Attribute("file").Value.ToLower();
```
This only lowercases — it does not normalize path separators. On Linux, if a condition path contains backslashes (e.g., `file="Data\plugin.esp"`), the comparison will fail silently: the condition evaluates as unfulfilled, so an entire required dependency check is skipped. PATH-01 normalizes paths in `ReadFileInfo()` but this separate code path in `LoadCondition()` is not covered.

This is not an omission from PATH-01 (PATH-01's scope is `ReadFileInfo()`), but it is a latent bug on the same axis: backslash paths in condition elements will not compare correctly against the normalized file list on Linux.

**Fix:**
```csharp
// Line 188
string strCondition = TextUtil.NormalizePath(p_xelCondition.Attribute("file").Value, false, true);

// Line 192
string strFileCondition = TextUtil.NormalizePath(p_xelCondition.Attribute("file").Value, false, true);
```
`using Utils;` is already present after PATH-01.

---

### WR-04: `extractedFilePath` null dereference in `GetScriptType()`

**File:** `src/ModInstaller.Adaptor.Dynamic/ModFormatManager.cs:146`
**Issue:** `extractedFilePath` has a default value of `null` (line 119). Inside the task lambda, line 146 calls:
```csharp
byte[] scriptData = FileSystem.ReadAllBytes(Path.Combine(extractedFilePath, omodMatch));
```
This is only reached when `omodMatch` is non-empty (line 144 guards `if (!string.IsNullOrEmpty(omodMatch))`). However, `extractedFilePath` is never null-checked before being passed to `Path.Combine()`. `Path.Combine(null, omodMatch)` throws `ArgumentNullException` at runtime. Any caller that passes an omod-style archive (`script` or `script.txt` present in `modFiles`) without providing `extractedFilePath` will crash with an unhandled `ArgumentNullException` propagated through the `Task`.

**Fix:**
```csharp
if (!string.IsNullOrEmpty(omodMatch))
{
    if (extractedFilePath == null)
        throw new ArgumentNullException(nameof(extractedFilePath),
            "extractedFilePath must be provided when the archive contains an omod script file.");
    byte[] scriptData = FileSystem.ReadAllBytes(Path.Combine(extractedFilePath, omodMatch));
    scriptDataString = TextUtil.ByteToStringWithoutBOM(scriptData);
}
```

---

## Info

### IN-01: `InstallFileFromMod()` — dead `booSuccess` variable

**File:** `src/InstallScripting/XmlScript/XmlScriptInstaller.cs:197-223`
**Issue:** `booSuccess` is initialized to `false`, set unconditionally to `true` at line 221, and returned. The initial `false` value is never observable — there is no early return on the false path. The variable adds noise and implies conditional failure that does not exist.

**Fix:**
```csharp
// Remove the booSuccess variable entirely; replace the return:
return true;
```

---

### IN-02: `omodMatch` recomputed on every `scriptFile` iteration in `GetRequirements()`

**File:** `src/ModInstaller.Adaptor.Dynamic/ModFormatManager.cs:75`
**Issue:** `omodMatch` is computed via `modFiles.Where(...).FirstOrDefault()` inside the inner `foreach (string scriptFile in scriptType.FileNames)` loop. The result is invariant with respect to `scriptFile` — it depends only on `modFiles` — so it is recomputed identically on every loop iteration. For mods with many script file names this is wasted work.

**Fix:** Hoist `omodMatch` to just inside the `if (scriptType.FileNames != null)` block, before the inner loop:
```csharp
if (scriptType.FileNames != null)
{
    string omodMatch = modFiles.Where(x => x.Equals("script") || x.Equals("script.txt")).FirstOrDefault();
    bool isOmod = false;
    // ... rest of loop
```

Note: This is not a correctness issue for typical FOMOD usage (script type registries have small `FileNames` lists), hence Info rather than Warning.

---

### IN-03: Silent exception swallow in `GetRequirements()` omod validation

**File:** `src/ModInstaller.Adaptor.Dynamic/ModFormatManager.cs:77-82`
**Issue:** The try/catch block catches `Exception` and discards it with a `// don't care` comment. If `ValidateScript` or `LoadScript` throws for an unexpected reason (not just invalid-omod), the failure is silently treated as "not an omod" and execution continues. This can mask real errors and makes the behavior non-deterministic under fault conditions.

**Fix:** Log the exception before swallowing it, or at minimum scope the catch to expected types:
```csharp
try
{
    isOmod = (!string.IsNullOrEmpty(omodMatch) && scriptType.ValidateScript(scriptType.LoadScript(omodMatch, true)));
}
catch (InvalidOperationException)
{
    // omodMatch content is not a valid script — not an omod, continue
}
```
If the logging infrastructure is not available in this context, at minimum add a structured comment explaining what exceptions are expected and why they are safe to swallow.

---

## Phase 1 Fix Verification

All three Phase 1 fixes are confirmed present in the reviewed files:

| Fix | File | Evidence |
|-----|------|----------|
| PATH-01 | `Parser10.cs:221,224` | `TextUtil.NormalizePath(xelFile.Attribute("source").Value, false, true)` and `TextUtil.NormalizePath(xelFile.Attribute("destination").Value, false, true)` |
| PATH-02 | `XmlScriptInstaller.cs:135,139` | `IList<string> matchedFiles = ModArchive.GetFileList(strSourceXml, true, false);` and `string strSource = matchedFiles[0];` |
| GUARD-01 | `ModFormatManager.cs:48,123` | Two occurrences of `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)`, `using System.Runtime.InteropServices;` present |

WR-03 identifies a related gap (path separator normalization in condition nodes) that PATH-01's scope intentionally excludes. It is a candidate for a follow-on fix on `linux-port`.

---

_Reviewed: 2026-04-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
