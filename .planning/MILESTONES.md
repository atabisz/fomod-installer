# Milestones

## v1.0 Linux Compatibility (Shipped: 2026-04-09)

**Phases completed:** 3 phases, 5 plans, 11 tasks

**Key accomplishments:**

- Three additive C# fixes enabling correct FOMOD installation on Linux: parse-time backslash normalization via TextUtil.NormalizePath, archive-case path emission via matchedFiles[0], and Windows-only CSharpScript registration guard via RuntimeInformation.IsOSPlatform
- GitHub Actions build-ipc expanded to matrix job producing Windows EXE and self-contained Linux ELF, assembled into single npm tarball by new package-ipc job
- Platform-aware binary resolution and Mono removal in TypeScript IPC launcher; cross-platform pgrep/kill process cleanup utility
- UnsupportedFunctionalityWarning now carries reason="CSharpScript not supported on Linux" and platform="linux" fields so Vortex can build OS-specific user messages without hardcoding platform knowledge
- TUnit traversal tests document Linux path-correctness for IsSafeFilePath; README Linux notes cover C# limitation, native AOT path, IPC ELF availability, and removable Vortex workarounds

---
