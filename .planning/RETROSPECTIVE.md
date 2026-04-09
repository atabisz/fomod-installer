# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Linux Compatibility

**Shipped:** 2026-04-09
**Phases:** 3 | **Plans:** 5 | **Sessions:** 1 (single-day execution)

### What Was Built

- **PATH-01/02**: Parse-time backslash normalization and archive-case path emission in C# parser — eliminates silent partial installs on ext4
- **GUARD-01**: `RuntimeInformation.IsOSPlatform(Windows)` guard on CSharpScript registration — graceful `UnsupportedFunctionalityWarning` instead of `TypeLoadException`
- **IPC-01**: GitHub Actions matrix build producing self-contained Linux ELF + Windows EXE assembled into single npm tarball
- **IPC-02/03**: Platform-aware binary resolution in TypeScript launcher (Mono removed); cross-platform `pgrep`/`kill` process cleanup
- **UX-01**: `reason` + `platform` nullable fields on `UnsupportedFunctionalityWarning` instruction for OS-specific caller UX
- **UX-02/03**: TUnit `IsSafeFilePath` traversal tests for Linux; README Linux notes section covering C# limitation, native AOT recommendation, and removable Vortex workarounds

### What Worked

- **Inheritance leverage**: Fixing only `Parser10.ReadFileInfo()` for PATH-01 propagated automatically to Parser20-50 via inheritance — zero duplicate edits
- **Phase decomposition**: C# correctness → IPC pipeline → UX polish was the right order; each phase had zero blockers from the prior
- **linux-port branch strategy**: Clean separation of upstream-eligible changes from fork artifacts made PR-splitting trivial from the start
- **Positive OS guard** (`IsOSPlatform.Windows` not `!IsOSPlatform.Linux`): Unknown platforms also skip CSharpScript safely — more robust than negative check
- **Quick task for verification gap**: The 260409-k57 quick task correctly caught and fixed the Installer.cs call site that Phase 1 planning missed

### What Was Inefficient

- **REQUIREMENTS.md checkboxes never updated during execution**: All 9 requirements completed but checkboxes stayed `[ ]` throughout — future phases should update them at plan completion
- **STATE.md stale**: `Current Position` section showed Phase 02 status even after Phase 03 completed — STATE.md `stopped_at` field was never updated by executors
- **MILESTONES.md "One-liner:" entries**: The `gsd-tools milestone complete` command extracted `One-liner:` as literal text from SUMMARY.md files that used it as a label — SUMMARY.md one-liner format should use `summary:` frontmatter not prose label

### Patterns Established

- **Platform guard convention**: Wrap Windows-only assembly calls in `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)` (positive check) — established in Phase 1, followed throughout
- **CI artifact split-then-assemble**: Platform build jobs upload artifacts independently; packaging job downloads and assembles — mirrors `build-native` pattern already in workflow
- **Instruction factory overloads**: New richer overload alongside existing one-param for backward compat — `UnsupportedFunctionalityWarning(string)` preserved, three-param additive
- **Archive-case emission**: Always use `GetFileList()` return value as copy source, never the XML-verbatim lookup path

### Key Lessons

1. **Read the inheritance tree before scoping C# fixes** — a single method fix can cover N parsers; check what inherits what before deciding scope
2. **State files need explicit "complete" updates from executors** — STATE.md and REQUIREMENTS.md don't self-update; executor agents should update them as a final task
3. **One-liner in SUMMARY.md should be frontmatter, not prose** — `gsd-tools` extracts it structurally; a prose "One-liner:" label becomes the value

### Cost Observations

- Model mix: primarily sonnet for execution, opus for planning/research
- Sessions: single-day execution across all 3 phases
- Notable: All 3 phases executed in one day — small, well-scoped fork with clear upstream baseline made execution fast

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | 1 day | 3 | Initial fork — establishing linux-port branch strategy |

### Cumulative Quality

| Milestone | Tests Added | Zero-Dep Additions |
|-----------|-------------|-------------------|
| v1.0 | 8 (6 TUnit + 2 IPC spec updates) | 0 new runtime deps |

### Top Lessons (Verified Across Milestones)

1. Scope C# fixes to the lowest method in the inheritance tree — let inheritance do the work
2. Keep upstream-eligible changes isolated on `linux-port` from day one — retrofitting is painful
