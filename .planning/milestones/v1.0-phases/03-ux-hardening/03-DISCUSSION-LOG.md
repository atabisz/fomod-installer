# Phase 3: UX Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 03-ux-hardening
**Areas discussed:** Warning payload design, IsSafeFilePath test scope, README structure

---

## Warning payload design

| Option | Description | Selected |
|--------|-------------|----------|
| New fields on Instruction record | Add nullable string reason and platform properties to Instruction. Callers read i.reason and i.platform directly. | ✓ |
| Repurpose existing fields | Store reason in destination and platform in value for unsupported type. No schema change but semantic mismatch. | |
| You decide | Leave to researcher/planner. | |

**User's choice:** New fields on Instruction record

---

| Option | Description | Selected |
|--------|-------------|----------|
| "linux" / "win32" | Matches process.platform in Node.js. Vortex can do `instruction.platform === process.platform`. | ✓ |
| RuntimeInformation.OSDescription | Full runtime string like "Linux 5.15.0-generic". Harder to match in callers. | |
| null on Windows, string on Linux | Only set when restriction applies. Asymmetric. | |

**User's choice:** "linux" / "win32"

---

| Option | Description | Selected |
|--------|-------------|----------|
| New overload: Warning(function, reason, platform) | Installer.cs calls with explicit values. No magic. | ✓ (with question about Proton) |
| Populate inside factory method | Auto-detects platform via RuntimeInformation. Simpler call site. | |

**User's choice:** New overload — with follow-up: "can we tell the difference between linux native and linux proton?"

**Notes:** fomod-installer runs natively on Linux in both cases. Proton is a Wine layer for the game; Vortex is a native Linux Electron app. `RuntimeInformation` only sees "Linux". Proton differentiation (STEAM-01) is deferred to v2. Vortex adds Proton context from its own environment detection.

---

| Option | Description | Selected |
|--------|-------------|----------|
| platform = "linux", Vortex adds Proton context | Clean separation of concerns. | ✓ |
| Note as deferred to v2 (STEAM-01) | Already tracked in REQUIREMENTS.md v2. | |

**User's choice:** platform = "linux", Vortex adds Proton context

---

## IsSafeFilePath test scope

| Option | Description | Selected |
|--------|-------------|----------|
| Tests only — document current behavior | ../: false, ..\\: true on Linux. On ext4, \\ is valid filename char, not separator. Implementation correct as-is. | ✓ |
| Tests + code fix for ..\\ on Linux | Add explicit check for backslash traversal regardless of OS. Defense-in-depth. | |
| Tests asserting ..\\ returns false | Write failing tests then fix code. More restrictive. | |

**User's choice:** Tests only — document current behavior

---

| Option | Description | Selected |
|--------|-------------|----------|
| test/Utils.Tests/ | New FileSystemTests.cs in existing project alongside FileTreeTests.cs. | ✓ |

**User's choice:** test/Utils.Tests/

---

## README structure

| Option | Description | Selected |
|--------|-------------|----------|
| New 'Linux notes' section | Dedicated ## Linux notes after ## How it works. | ✓ |
| Expand 'What this fork fixes' | Add Limitations sub-list. | |
| Top-of-file callout block | Prominent blockquote at top. | |

**User's choice:** New 'Linux notes' section

---

**Content selected (multi-select):**
- ✓ C# scripts Windows-only restriction
- ✓ Recommended path: native over IPC for Linux
- ✓ IPC Linux support version (v0.13.0+)
- ✓ Vortex workarounds that can be removed

---

## Claude's Discretion

- Whether to keep old `UnsupportedFunctionalityWarning(string function)` one-param overload or replace it
- Exact TUnit test attribute style for FileSystemTests.cs
- Exact README Linux notes prose wording

## Deferred Ideas

- STEAM-01: Steam Deck / Proton differentiation in platform field — v2
- Proton context enrichment in Vortex user messages — out of scope for this fork
