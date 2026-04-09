# Roadmap: fomod-installer Linux/Proton Compatibility Fork

## Overview

Three focused phases that take this fork from broken Linux installs to a fully validated, PR-ready compatibility layer. Phase 1 fixes C# correctness (pure code, zero CI risk). Phase 2 ships the Linux IPC binary (CI pipeline + TypeScript launcher). Phase 3 hardens UX and validates safety properties. Each phase is independently PR-splittable back to Nexus-Mods/fomod-installer.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: C# Correctness** - Path normalization, case-correct emit, and C# script OS guard
- [ ] **Phase 2: IPC Linux Pipeline** - CI matrix expansion, self-contained ELF binary, and TypeScript platform launcher
- [ ] **Phase 3: UX Hardening** - Warning payload enrichment, README documentation, and path traversal tests

## Phase Details

### Phase 1: C# Correctness
**Goal**: XML-script FOMOD installation produces correct file paths on Linux, case-mismatch mods install without silent failures, and C# script mods emit a clean warning instead of crashing
**Depends on**: Nothing (first phase)
**Requirements**: PATH-01, PATH-02, GUARD-01
**Success Criteria** (what must be TRUE):
  1. A FOMOD XML with Windows-style backslash paths (`source="Data\Textures\foo.dds"`) installs files at the correct Linux path after path normalization runs across all versioned Parser*.cs files
  2. A FOMOD mod whose XML lists a file as `Foo.esp` but the archive contains `foo.esp` installs the file with the archive's real case, not the XML-verbatim spelling
  3. Building or running the IPC process on Linux with a C# script FOMOD emits an `UnsupportedFunctionalityWarning` instruction instead of throwing a Windows-assembly load exception
**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md -- Path normalization, archive-case emission, and CSharpScript OS guard (PATH-01, PATH-02, GUARD-01)

### Phase 2: IPC Linux Pipeline
**Goal**: `@nexusmods/fomod-installer-ipc` ships a self-contained ELF binary with correct execute permissions, and the TypeScript launcher resolves the correct binary on both Linux and Windows
**Depends on**: Phase 1
**Requirements**: IPC-01, IPC-02, IPC-03
**Success Criteria** (what must be TRUE):
  1. `npm pack` of the IPC package includes `dist/linux-x64/ModInstallerIPC` (ELF, executable bit set) produced by the `ubuntu-22.04` CI runner without manual intervention
  2. On Linux, `BaseIPCConnection` resolves and spawns `dist/linux-x64/ModInstallerIPC` without hitting `ENOENT` or `EACCES`; on Windows the existing `dist/win32-x64/ModInstallerIPC.exe` path still resolves
  3. `cleanup-processes.ts` completes without throwing `ENOENT` on Linux — orphaned IPC processes are detected via `pgrep` and terminated via `kill`
**Plans:** 2 plans

Plans:
- [x] 02-01-PLAN.md -- CI matrix expansion and build-native ubuntu-22.04 pin (IPC-01)
- [x] 02-02-PLAN.md -- TypeScript platform-aware launcher, Mono removal, and cross-platform cleanup (IPC-02, IPC-03)

### Phase 3: UX Hardening
**Goal**: Callers receive actionable, OS-specific context when C# script mods are encountered, path traversal safety is validated on Linux, and Linux limitations are documented for downstream consumers
**Depends on**: Phase 2
**Requirements**: UX-01, UX-02, UX-03
**Success Criteria** (what must be TRUE):
  1. An `UnsupportedFunctionalityWarning` instruction for a C# script FOMOD carries a `reason` string (e.g. `"CSharpScript not supported on Linux"`) and a `platform` field that callers can use to build OS-specific user messages
  2. `FileSystem.IsSafeFilePath()` unit tests pass on Linux for both `../` and `..\` traversal sequences, confirming path traversal protection works against the Linux `Path.GetInvalidPathChars()` set
  3. `README.md` documents: C# script Windows-only restriction, native package as recommended Linux path, IPC package Linux support version, and which Vortex workarounds can be removed after these fixes land
**Plans:** 2 plans

Plans:
- [ ] 03-01-PLAN.md -- Warning payload enrichment: reason and platform fields on Instruction record (UX-01)
- [ ] 03-02-PLAN.md -- IsSafeFilePath traversal tests and README Linux notes (UX-02, UX-03)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. C# Correctness | 0/1 | Planned | - |
| 2. IPC Linux Pipeline | 0/2 | Planned | - |
| 3. UX Hardening | 0/2 | Planned | - |
