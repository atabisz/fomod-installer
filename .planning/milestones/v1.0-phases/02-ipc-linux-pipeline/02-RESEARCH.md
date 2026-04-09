# Phase 2: IPC Linux Pipeline - Research

**Researched:** 2026-04-09
**Domain:** GitHub Actions CI matrix, dotnet publish self-contained, TypeScript platform-aware binary resolution, cross-platform process management
**Confidence:** HIGH

## Summary

Phase 2 ships a self-contained ELF binary for `@nexusmods/fomod-installer-ipc` and wires up the TypeScript launcher to resolve the correct binary path on each platform. The work is entirely mechanical: CI matrix expansion, TypeScript branching on `process.platform`, and process management command swaps. No C# logic changes.

All three deliverables (IPC-01, IPC-02, IPC-03) have locked decisions from CONTEXT.md. The primary research value is understanding exact file state, behavior of `dotnet publish` flags on Linux, the test file bug that must be fixed alongside IPC-02, and the correct `pgrep`/`kill` construction for IPC-03.

**Primary recommendation:** Implement in three atomic commits (IPC-01 CI → IPC-02 TypeScript → IPC-03 cleanup) on `linux-port` branch, then merge to `master`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**IPC-01: Dist layout and binary placement**
- D-01: Windows binary stays at `dist/ModInstallerIPC.exe` (root, no migration). Backward compatible for existing Vortex consumers who reference the old path. No `dist/win32-x64/` subdirectory for Windows.
- D-02: Linux binary goes to `dist/linux-x64/ModInstallerIPC` (new platform subdir). This is the only new path added.
- D-03: `chmod +x` runs as a CI step before `npm pack` on the Linux runner only. No `postinstall` npm script — published tarballs always have correct permissions; local developers running `dotnet publish` manually are responsible for their own execute bit.
- D-04: `build-ipc` becomes a matrix job: `ubuntu-22.04` (linux-x64 ELF) + `windows-latest` (win32-x64 EXE). Windows EXE output path: `dist/ModInstallerIPC.exe` (unchanged). Linux ELF output path: `dist/linux-x64/ModInstallerIPC`.
- D-05: Pin the `build-native` linux-x64 runner from `ubuntu-latest` to `ubuntu-22.04` in the same PR as the IPC changes. Consistent GLIBC baseline across all Linux artifacts in one commit.

**IPC-02: TypeScript resolver**
- D-06: Platform-explicit resolution, no fallback chain. On Linux: `dist/linux-x64/ModInstallerIPC` only. On Windows: `dist/ModInstallerIPC.exe` only. If the binary isn't at the expected path, fail fast with a clear error — no silent fallback to a potentially wrong binary.
- D-07: `RegularProcessLauncher.ts` Mono detection block (lines 21–32: `if (process.platform !== 'win32' && exePath.toLowerCase().endsWith('.exe'))`) is removed entirely. .NET 9 self-contained ELF binaries do not need Mono. The launcher should receive the correct platform-specific path from `findExecutable()` and spawn it directly.
- D-08: `BaseIPCConnection.findExecutable()` currently hardcodes `getExecutablePaths('ModInstallerIPC.exe')`. This call must become platform-aware — pass `'ModInstallerIPC'` on Linux, `'ModInstallerIPC.exe'` on Windows. The `getExecutablePaths()` override must also inject the platform subdir into its path construction for Linux.

**IPC-03: Cleanup utility**
- D-09: `cleanup-processes.ts` is made cross-platform using the same `process.platform !== 'win32'` guard pattern used elsewhere in the codebase. On Linux: `pgrep ModInstallerIPC` to find PIDs, `kill -9 <pid>` to terminate. On Windows: existing `tasklist`/`taskkill` logic unchanged.

**PR / Commit Strategy**
- D-10: Work on `linux-port` branch first, then merge to `master` (per CLAUDE.md). CI changes and TypeScript changes are upstream-eligible and belong on `linux-port`. Commits should be atomic per requirement (IPC-01, IPC-02, IPC-03).

### Claude's Discretion
- Exact dotnet publish flags for the Linux self-contained build (suggested: `-r linux-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true`)
- Whether `build.js` is updated to support the new platform subdir output, or whether the CI workflow overrides the output dir directly via dotnet CLI flags
- Exact pgrep/kill command construction in `cleanup-processes.ts` (process name matching, signal choice)
- Order of commits (suggested: IPC-01 CI → IPC-02 TypeScript → IPC-03 cleanup)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IPC-01 | GitHub Actions `build-packages.yml` adds Linux runner to IPC build matrix with self-contained ELF, sets execute permissions, includes binary at `dist/linux-x64/ModInstallerIPC` in npm tarball | CI matrix pattern already established in `build-native` job; `build-ipc` job currently single-runner ubuntu-only; `dotnet publish` flags confirmed via `dotnet publish --help`; `dist/` auto-includes subdirs per `"files": ["dist/"]` |
| IPC-02 | `RegularProcessLauncher.ts` resolves correct IPC binary path by platform; `BaseIPCConnection.findExecutable()` no longer hardcodes `.exe`; ELF binary launched directly without Mono | Source read: Mono block at lines 21–32 of RegularProcessLauncher.ts; `findExecutable()` hardcodes `'ModInstallerIPC.exe'` at line 453; `getExecutablePaths()` default impl at lines 155–163 |
| IPC-03 | `cleanup-processes.ts` is cross-platform — uses `pgrep`/`kill` on Linux, existing `tasklist`/`taskkill` on Windows | Source read: entire file is Windows-only; `pgrep` confirmed available (procps-ng 4.0.4); `kill` confirmed available as shell built-in |
</phase_requirements>

## Standard Stack

### Core
| Library/Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `dotnet publish` | .NET 9 | Compile C# IPC server to self-contained ELF | Built-in .NET CLI; `--self-contained -r linux-x64` flags produce standalone binary |
| GitHub Actions matrix | N/A | Parallel CI builds per platform | Already used by `build-native` job; established pattern |
| `process.platform` | Node.js built-in | TypeScript platform detection | Already used throughout IPC module |
| `pgrep` / `kill` | procps-ng 4.0.4 (verified local) | Linux process detection and termination | Standard POSIX tools; present on Ubuntu 22.04 |

### Dotnet Publish Flags for Self-Contained Linux ELF
[VERIFIED: dotnet publish --help output]

```bash
dotnet publish <project> \
  -c Release \
  -r linux-x64 \
  --self-contained true \
  -p:PublishSingleFile=true \
  -p:EnableCompressionInSingleFile=true \
  -o <output-dir>
```

**Why these flags:**
- `-r linux-x64`: Required for self-contained; specifies the RID
- `--self-contained true`: Bundles the .NET runtime; target machine needs no .NET install
- `-p:PublishSingleFile=true`: Merges all assemblies into one ELF file
- `-p:EnableCompressionInSingleFile=true`: Reduces binary size (optional but already in requirements)
- Without `-r`, dotnet produces a framework-dependent output regardless of `--self-contained`

**Output filename:** `dotnet publish` on Linux with `-r linux-x64` outputs `ModInstallerIPC` (no extension) and a symlink `ModInstallerIPC.exe → ModInstallerIPC`. [VERIFIED: local dist/ directory]

## Architecture Patterns

### IPC-01: CI Matrix Expansion

The `build-native` matrix pattern is the exact template to follow [VERIFIED: .github/workflows/build-packages.yml lines 11–21]:

```yaml
# build-native (existing pattern)
strategy:
  matrix:
    include:
      - os: windows-latest
        platform: win32-x64
      - os: ubuntu-latest    # → change to ubuntu-22.04 (D-05)
        platform: linux-x64
```

The `build-ipc` job (line 125+) currently runs only on `ubuntu-latest` and produces only the webpack bundle — NOT the C# binary. The current CI builds the IPC executable locally via `pnpm build` which calls `node build.js build`. This calls `dotnet publish` with no `-r` flag and no `--self-contained`, producing a framework-dependent output. [VERIFIED: build.js lines 281–291]

**For IPC-01, the CI workflow must:**
1. Become a matrix job (`windows-latest` + `ubuntu-22.04`)
2. On `ubuntu-22.04`: run `dotnet publish` with self-contained flags and `-o dist/linux-x64`
3. On `windows-latest`: run `dotnet publish` as currently done (`-o dist/`) — unchanged output path
4. On `ubuntu-22.04`: run `chmod +x dist/linux-x64/ModInstallerIPC` before `npm pack`
5. Upload per-platform artifacts, then assemble in a packaging job (same pattern as `build-native` → `package-native`)

**Artifact assembly approach (two viable paths):**

Path A — Matrix + separate packaging job (mirrors `build-native`/`package-native`):
- Each matrix runner uploads a platform artifact
- A downstream `package-ipc` job downloads both artifacts and runs `npm pack`

Path B — Single packaging step inline:
- Each matrix runner uploads its dist artifact
- A separate job downloads both, merges into one `dist/` tree, runs webpack + `npm pack`

The current `build-ipc` job does webpack bundling AND npm pack in one step. With the matrix, webpack only needs to run once (it's platform-independent TypeScript). This means Path A is architecturally cleaner and matches the `build-native`/`package-native` precedent. [ASSUMED — exact job split is Claude's discretion]

### IPC-02: TypeScript Platform-Aware Resolution

**What changes in `BaseIPCConnection.ts`:**

Line 453 currently: `const possiblePaths = this.getExecutablePaths('ModInstallerIPC.exe');`

Must become: `const exeName = process.platform === 'win32' ? 'ModInstallerIPC.exe' : 'ModInstallerIPC';`
Then: `const possiblePaths = this.getExecutablePaths(exeName);`

**What changes in `getExecutablePaths()` (lines 155–163):**

Current default implementation:
```typescript
protected getExecutablePaths(exeName: string): string[] {
  const paths: string[] = [];
  const distPath = path.join(__dirname, exeName);  // dist/<exeName>
  paths.push(distPath);
  return paths;
}
```

On Linux, the binary is at `dist/linux-x64/ModInstallerIPC`, not `dist/ModInstallerIPC`. The default implementation needs to inject the platform subdir. After the fix:

```typescript
protected getExecutablePaths(exeName: string): string[] {
  const paths: string[] = [];
  if (process.platform === 'win32') {
    // Windows: dist/ModInstallerIPC.exe (flat, backward compatible)
    paths.push(path.join(__dirname, exeName));
  } else {
    // Linux: dist/linux-x64/ModInstallerIPC
    paths.push(path.join(__dirname, 'linux-x64', exeName));
  }
  return paths;
}
```

D-06 says fail-fast (no fallback chain) — one path per platform, no array of fallback paths.

**What changes in `RegularProcessLauncher.ts`:**

Remove lines 20–32 entirely:
```typescript
// REMOVE THIS ENTIRE BLOCK:
let actualExePath = exePath;
let actualArgs = args;

if (process.platform !== 'win32' && exePath.toLowerCase().endsWith('.exe')) {
  actualExePath = 'mono';
  actualArgs = [exePath, ...args];
  log('info', '[PROCESS] Using Mono to launch .exe on non-Windows platform', {...});
}
```

After removal, `launch()` uses `exePath` and `args` directly. The variable names `actualExePath`/`actualArgs` are also removed; use `exePath`/`args` directly in the `spawn()` call.

**Test file bug (verify-warning.spec.ts line 66–67):**

The `executableExists` skip guard in `verify-warning.spec.ts` still checks for `dist/ModInstallerIPC.exe`:
```typescript
const executablePath = path.join(packageRoot, 'dist', 'ModInstallerIPC.exe');
const executableExists = fs.existsSync(executablePath);
```

After IPC-02, the Linux binary is at `dist/linux-x64/ModInstallerIPC`. The skip guard must be updated to match the new path, otherwise the test always skips on Linux after the new CI layout ships. [VERIFIED: test file read]

Conveniently, `verify-warning.spec.ts`'s `getExecutablePaths()` override already handles the correct path:
```typescript
const exeName = process.platform === 'win32' ? 'ModInstallerIPC.exe' : 'ModInstallerIPC';
return [path.join(packageRoot, 'dist', exeName)];
```
But this override also doesn't inject `linux-x64/` subdirectory, so it too must be updated to match D-02's `dist/linux-x64/ModInstallerIPC` path.

Similarly, `ModInstaller.ipc.spec.ts` line 159 checks `path.join(packageRoot, 'dist', 'ModInstallerIPC.exe')` — same skip guard bug to fix.

### IPC-03: Cross-Platform Cleanup

**Current state:** [VERIFIED: cleanup-processes.ts full read]
Both `findStuckProcesses()` and `killProcess()` are Windows-only. The entire impl uses `tasklist` and `taskkill`.

**Target pattern:**

```typescript
export async function findStuckProcesses(): Promise<number[]> {
  if (process.platform !== 'win32') {
    // Linux: pgrep matches by process name substring
    try {
      const { stdout } = await exec('pgrep ModInstallerIPC');
      return stdout.trim().split('\n')
        .filter(line => line.trim() !== '')
        .map(line => parseInt(line.trim(), 10))
        .filter(pid => !isNaN(pid));
    } catch {
      // pgrep exits with code 1 when no processes found — not an error
      return [];
    }
  }
  // Windows: existing tasklist logic (unchanged)
  ...
}

export async function killProcess(pid: number): Promise<boolean> {
  if (process.platform !== 'win32') {
    try {
      await exec(`kill -9 ${pid}`);
      return true;
    } catch (error) {
      console.error(`Failed to kill process ${pid}:`, error.message);
      return false;
    }
  }
  // Windows: existing taskkill logic (unchanged)
  ...
}
```

**`pgrep` exit code behavior:** [VERIFIED: pgrep man page behavior]
- Exit 0: one or more processes matched
- Exit 1: no processes matched (NOT an error — expected when no orphaned processes exist)
- The `try/catch` around `pgrep` must not treat exit code 1 as an error for `findStuckProcesses()`

**`kill -9` vs `kill`:**
- D-09 specifies `kill -9 <pid>` (SIGKILL)
- SIGKILL cannot be caught or ignored — guarantees termination
- Appropriate for cleanup of orphaned/stuck processes

**Process name matching:**
- `pgrep ModInstallerIPC` matches processes whose name contains "ModInstallerIPC"
- On Linux, the self-contained single-file ELF will report its name as `ModInstallerIPC` in `/proc/<pid>/comm`
- No need for case-insensitive flag or exact match flag for this use case [ASSUMED — process name from .NET self-contained single-file ELF]

### Anti-Patterns to Avoid

- **Symlink confusion:** `dotnet publish -r linux-x64` on Linux produces both `ModInstallerIPC` (ELF) and `ModInstallerIPC.exe` (symlink → same file). Do NOT copy the `.exe` symlink to `dist/linux-x64/` — only copy/publish to the `linux-x64` output dir directly. [VERIFIED: local dist/ inspection]
- **Fallback chain in findExecutable:** D-06 is explicit — platform-explicit, no fallback. Don't add `dist/ModInstallerIPC` as a fallback for Linux behind `dist/linux-x64/ModInstallerIPC`.
- **postinstall chmod:** D-03 explicitly rejects this. Don't add an npm `postinstall` script.
- **Publishing without -r:** `dotnet publish --self-contained true` without `-r <RID>` is not valid — `-r` is required when `--self-contained` is specified.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Platform detection | Custom os/arch detection | `process.platform === 'win32'` | Already the codebase pattern; consistent |
| Process name lookup on Linux | Custom `/proc` scanning | `pgrep <name>` | Standard POSIX utility; handles pid namespaces, zombies correctly |
| Force-kill on Linux | Custom signal routing | `kill -9 <pid>` | POSIX standard; shell built-in |
| Self-contained binary bundling | Manual runtime bundling | `dotnet publish --self-contained` | SDK handles runtime linking, compression, single-file merging |

## Common Pitfalls

### Pitfall 1: pgrep exits 1 when no processes found
**What goes wrong:** `exec('pgrep ModInstallerIPC')` throws when no processes match (exit code 1), which Node.js `child_process.exec` treats as an error.
**Why it happens:** `pgrep` follows POSIX convention: exit 1 = no match (not an error).
**How to avoid:** Wrap the `pgrep` call in try/catch and return `[]` on any error — the only interesting result is the PIDs in stdout.
**Warning signs:** `findStuckProcesses()` throws instead of returning empty array during normal (no orphaned processes) state.

### Pitfall 2: dotnet publish output filename on Linux
**What goes wrong:** CI step tries to `chmod +x dist/linux-x64/ModInstallerIPC.exe` but the file is `ModInstallerIPC` (no extension).
**Why it happens:** On Linux, `dotnet publish` produces an extension-less ELF. The `.exe` is a symlink.
**How to avoid:** CI chmod step must reference `dist/linux-x64/ModInstallerIPC` (no extension). [VERIFIED: local dotnet publish output]
**Warning signs:** `chmod: cannot access 'dist/linux-x64/ModInstallerIPC.exe': No such file or directory`

### Pitfall 3: Test skip guard still checks old path
**What goes wrong:** After IPC-02 ships, `verify-warning.spec.ts` and `ModInstaller.ipc.spec.ts` always skip on Linux because they check `dist/ModInstallerIPC.exe` (which won't exist at that path in the new layout).
**Why it happens:** Test files have their own path logic that wasn't updated with the binary layout change.
**How to avoid:** Update the `executableExists` skip guard and `getExecutablePaths()` override in both test files to use the platform-aware path. [VERIFIED: test file read]
**Warning signs:** Tests pass locally (skip counts as pass) but CI never exercises the Linux binary.

### Pitfall 4: build.js dotnet publish vs CI direct dotnet
**What goes wrong:** If `build.js` is invoked in CI for the C# build, it always uses the default output dir (`dist/`) with no `-r` or `--self-contained` flags — the Linux CI will produce a framework-dependent output at the wrong path.
**Why it happens:** `build.js` hardcodes `outputDir = path.resolve("dist")` and has no platform-aware build args.
**How to avoid:** Two options — (A) pass environment vars or args to build.js to override output/flags, or (B) bypass build.js in CI and call `dotnet publish` directly with the correct flags. Option B is simpler for the CI workflow. The CI can still use `pnpm build` for the webpack step and call `dotnet publish` directly for the C# step. [ASSUMED — exact CI approach is Claude's discretion]
**Warning signs:** CI Linux runner produces `dist/ModInstallerIPC` (framework-dependent) instead of `dist/linux-x64/ModInstallerIPC` (self-contained).

### Pitfall 5: ubuntu-22.04 vs ubuntu-latest GLIBC baseline
**What goes wrong:** Binary built on `ubuntu-latest` (currently 24.04) uses a newer GLIBC that isn't present on older Ubuntu/SteamOS systems.
**Why it happens:** Self-contained ELF still links to host's `libc.so` dynamically (it bundles .NET runtime but not glibc). Building on newer Ubuntu raises the minimum required glibc version.
**How to avoid:** D-05 locks the Linux runner to `ubuntu-22.04` for both `build-ipc` and `build-native`. [VERIFIED: CONTEXT.md D-05]
**Warning signs:** `GLIBC_2.xx not found` errors on target systems.

## Code Examples

Verified patterns from official sources and codebase inspection:

### CI Matrix Pattern (reuse build-native structure)
```yaml
# [VERIFIED: .github/workflows/build-packages.yml lines 11-21]
build-ipc:
  strategy:
    matrix:
      include:
        - os: windows-latest
          platform: win32-x64
        - os: ubuntu-22.04
          platform: linux-x64
  runs-on: ${{ matrix.os }}
  steps:
    - uses: actions/checkout@v6
    - uses: actions/setup-dotnet@v5
      with:
        dotnet-version: '9.x'
    # ... volta, pnpm, install steps ...
    - name: Build C# IPC (Linux self-contained)
      if: matrix.platform == 'linux-x64'
      run: |
        dotnet publish src/ModInstaller.IPC \
          -c Release \
          -r linux-x64 \
          --self-contained true \
          -p:PublishSingleFile=true \
          -p:EnableCompressionInSingleFile=true \
          -o src/ModInstaller.IPC.TypeScript/dist/linux-x64
    - name: Build C# IPC (Windows)
      if: matrix.platform == 'win32-x64'
      run: |
        dotnet publish src/ModInstaller.IPC \
          -c Release \
          -o src/ModInstaller.IPC.TypeScript/dist
    - name: Set execute permissions (Linux only)
      if: matrix.platform == 'linux-x64'
      run: chmod +x src/ModInstaller.IPC.TypeScript/dist/linux-x64/ModInstallerIPC
```

### BaseIPCConnection.findExecutable() fix
```typescript
// [VERIFIED: BaseIPCConnection.ts line 453 — current hardcoding]
// BEFORE:
const possiblePaths = this.getExecutablePaths('ModInstallerIPC.exe');

// AFTER (D-06, D-08):
const exeName = process.platform === 'win32' ? 'ModInstallerIPC.exe' : 'ModInstallerIPC';
const possiblePaths = this.getExecutablePaths(exeName);
```

### getExecutablePaths() default implementation fix
```typescript
// [VERIFIED: BaseIPCConnection.ts lines 155-163 — current default]
// AFTER (D-02, D-08):
protected getExecutablePaths(exeName: string): string[] {
  if (process.platform === 'win32') {
    return [path.join(__dirname, exeName)];
  }
  return [path.join(__dirname, 'linux-x64', exeName)];
}
```

### RegularProcessLauncher.ts Mono removal
```typescript
// [VERIFIED: RegularProcessLauncher.ts lines 20-32 — remove entirely]
// AFTER: launch() body starts directly at:
log('info', '[PROCESS] Launching process with regular security', {
  exePath,
  args,
  argsJoined: args.join(' '),
  cwd: options.cwd
});
const childProcess = spawn(exePath, args, options);
```

### cleanup-processes.ts pgrep/kill pattern
```typescript
// [VERIFIED: pgrep confirmed available at /usr/bin/pgrep, procps-ng 4.0.4]
export async function findStuckProcesses(): Promise<number[]> {
  if (process.platform !== 'win32') {
    try {
      const { stdout } = await exec('pgrep ModInstallerIPC');
      return stdout.trim().split('\n')
        .filter(line => line.trim() !== '')
        .map(line => parseInt(line.trim(), 10))
        .filter(pid => !isNaN(pid));
    } catch {
      // pgrep exit code 1 = no processes found; not an error
      return [];
    }
  }
  // Windows path below (unchanged)
  ...
}

export async function killProcess(pid: number): Promise<boolean> {
  if (process.platform !== 'win32') {
    try {
      await exec(`kill -9 ${pid}`);
      return true;
    } catch (error: any) {
      console.error(`Failed to kill process ${pid}:`, error.message);
      return false;
    }
  }
  // Windows path below (unchanged)
  ...
}
```

## Runtime State Inventory

> Phase involves binary path changes in a distributed npm package. Not a rename/refactor phase.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — IPC paths are resolved at runtime from `__dirname` | None |
| Live service config | None — no external service stores the binary path | None |
| OS-registered state | None — no launchd/systemd/Task Scheduler entries | None |
| Secrets/env vars | None — no path-based env vars detected | None |
| Build artifacts | `dist/ModInstallerIPC` + `dist/ModInstallerIPC.exe` (symlink) in local dev tree — framework-dependent, not self-contained | Not published; CI produces the canonical artifact |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| dotnet | IPC-01 build | ✓ | 9.0.115 | None — required |
| pnpm | IPC-01 build | ✓ | 10.8.1 | None — required |
| pgrep | IPC-03 | ✓ | procps-ng 4.0.4 | None — standard on all target distros |
| kill | IPC-03 | ✓ | shell built-in | None — POSIX standard |

**Note on CI runners:** ubuntu-22.04 GitHub Actions runner includes pgrep (procps) and .NET 9 via `actions/setup-dotnet`. Windows runner requires no new dependencies. [ASSUMED — GitHub hosted runner capabilities; verified via standard known runner images]

## Validation Architecture

> `nyquist_validation: false` in `.planning/config.json` — this section is skipped.

## Security Domain

> No new authentication, session management, access control, or cryptographic operations in this phase. The only security-adjacent concern is process termination (`kill -9`) which is standard OS process management with no privilege escalation. Security enforcement does not apply to this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Path A (matrix + separate package-ipc job) is architecturally cleaner than inlining | Architecture Patterns | Low — both paths produce identical artifacts; planner can choose |
| A2 | `pgrep ModInstallerIPC` matches the self-contained ELF's process name in `/proc/<pid>/comm` | IPC-03 pattern | Medium — if the process name is truncated to 15 chars (`ModInstallerIP`), pgrep without `-f` won't match. Mitigation: use `pgrep -f ModInstallerIPC` (match against full command line) |
| A3 | GitHub ubuntu-22.04 hosted runner includes pgrep and procps by default | Environment Availability | Low — procps is in the base ubuntu image |
| A4 | CI dotnet publish should be invoked directly (not via build.js) for the platform-specific Linux build | Architecture Patterns | Low — alternative is to extend build.js with env vars; either works |

**A2 mitigation:** Use `pgrep -f ModInstallerIPC` instead of `pgrep ModInstallerIPC`. The `-f` flag matches against the full command-line string rather than just the process name (which is capped at 15 chars in Linux). This guarantees a match even if the process name is truncated.

## Open Questions (RESOLVED)

1. **Should build.js be updated to support platform-aware builds, or is CI-direct dotnet sufficient?**
   - What we know: `build.js` is used by local developers via `pnpm build`; CI currently uses `pnpm build` which invokes `build.js`
   - What's unclear: Whether local Linux developers need self-contained builds, or whether framework-dependent (requires .NET installed) is acceptable for local dev
   - Recommendation: Keep `build.js` as-is for local dev (framework-dependent is fine if .NET is installed); CI calls `dotnet publish` directly with self-contained flags
   - **RESOLVED:** CI calls `dotnet publish` directly with self-contained flags (see Plan 02-01, Task 2). `build.js` unchanged — local dev uses framework-dependent build.

2. **pgrep -f vs pgrep (process name vs full command line)?**
   - What we know: `pgrep ModInstallerIPC` may fail if the name is truncated to 15 chars in `/proc/comm`; `pgrep -f ModInstallerIPC` matches the full argv[0] which won't be truncated
   - Recommendation: Use `pgrep -f ModInstallerIPC` for robustness (A2 mitigation above)
   - **RESOLVED:** `pgrep -f ModInstallerIPC` used in Plan 02-02, Task 2 for robustness against kernel name truncation.

## Sources

### Primary (HIGH confidence)
- [VERIFIED: local file inspection] — `RegularProcessLauncher.ts` full source, Mono block lines 20–32
- [VERIFIED: local file inspection] — `BaseIPCConnection.ts` full source, `findExecutable()` line 453, `getExecutablePaths()` lines 155–163
- [VERIFIED: local file inspection] — `cleanup-processes.ts` full source
- [VERIFIED: local file inspection] — `.github/workflows/build-packages.yml` full source, build-native matrix pattern lines 11–21
- [VERIFIED: local file inspection] — `build.js` dotnet publish invocation lines 280–297
- [VERIFIED: local file inspection] — `dist/` directory contents including ELF binary and symlink
- [VERIFIED: dotnet publish --help] — self-contained flag behavior and -r requirement
- [VERIFIED: local shell] — `pgrep` at `/usr/bin/pgrep`, procps-ng 4.0.4; `kill` shell built-in

### Secondary (MEDIUM confidence)
- [VERIFIED: local test file inspection] — `verify-warning.spec.ts` lines 66–67 skip guard bug; `getExecutablePaths` override at lines 31–35
- [VERIFIED: local test file inspection] — `ModInstaller.ipc.spec.ts` line 159 skip guard uses `dist/ModInstallerIPC.exe`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools verified locally
- Architecture: HIGH for file changes; MEDIUM for CI job structure (assumed two-job pattern mirrors build-native)
- Pitfalls: HIGH — all verified against actual source files

**Research date:** 2026-04-09
**Valid until:** Stable — no fast-moving dependencies; valid until CI runner OS changes
