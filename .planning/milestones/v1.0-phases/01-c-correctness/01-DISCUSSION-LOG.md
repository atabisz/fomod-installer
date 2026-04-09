# Phase 1: C# Correctness - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 01-c-correctness
**Areas discussed:** Destination toLower, Upstream PR split

---

## Destination toLower

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, lowercase both | toLower=true for source AND destination. Consistent behavior. Game mods deploy through Vortex's case-insensitive overlay — destination casing doesn't affect gameplay. resolvePathCase() stays as safety net. | ✓ |
| Preserve destination casing | Call NormalizePath(value, false, true, false) for destination. Keeps original XML casing for install paths. More conservative. | |
| Same call, different toLower | NormalizePath with toLower=true for source, toLower=false for destination. Separator normalization only for destinations. | |

**User's choice:** Yes, lowercase both
**Notes:** Vortex's overlay layer handles case-insensitive game file access. Destination casing not a concern.

---

## Upstream PR Split

| Option | Description | Selected |
|--------|-------------|----------|
| 3 separate PRs | One PR per fix (PATH-01, PATH-02, GUARD-01). Isolated review. Easy cherry-pick or rejection per fix. Standard upstream contribution. | ✓ |
| 1 combined PR | All 3 fixes in one 'Linux compatibility' PR. Simpler but risk of one fix blocking others. | |
| 2 PRs: path fixes + guard | PATH-01 + PATH-02 together, GUARD-01 separate. | |

**User's choice:** 3 separate PRs

Follow-up: Commit granularity

| Option | Description | Selected |
|--------|-------------|----------|
| 3 atomic commits | One commit per fix on linux-port. Clean history, trivially PR-splittable. Commit messages reference requirement IDs. | ✓ |
| Flexible granularity | Commit as makes sense, split for PRs manually later. | |

**User's choice:** 3 atomic commits

---

## Claude's Discretion

- Exact location in Mod.cs for PATH-02 fix — researcher determines
- `IsOSPlatform(Windows)` vs. `!IsOSPlatform(Linux)` phrasing for GUARD-01
- Commit ordering (suggested: PATH-01 → GUARD-01 → PATH-02)

## Deferred Ideas

None.
