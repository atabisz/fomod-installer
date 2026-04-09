---
phase: 02-ipc-linux-pipeline
reviewed: 2026-04-09T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - .github/workflows/build-packages.yml
  - src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts
  - src/ModInstaller.IPC.TypeScript/src/launchers/RegularProcessLauncher.ts
  - src/ModInstaller.IPC.TypeScript/src/cleanup-processes.ts
  - src/ModInstaller.IPC.TypeScript/test/verify-warning.spec.ts
  - src/ModInstaller.IPC.TypeScript/test/ModInstaller.ipc.spec.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-09
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Six files from the IPC Linux pipeline phase were reviewed: the CI workflow, the core IPC connection class, the regular process launcher, a process cleanup utility, and two integration test files.

The implementation is structurally sound and correctly platform-gated throughout. The primary concerns are: a silent data loss bug in `BaseIPCConnection.tryInitialize` where post-handshake data is logged but never processed; a `kill -9` command injection surface in `cleanup-processes.ts` that is safe at runtime but relies on implicit numeric coercion of an unvalidated string; a missing `parseInt` radix on the Windows path; and a test file that builds file paths with hardcoded backslash separators on a non-Windows platform, which will produce invalid paths on Linux.

No critical security vulnerabilities were found.

---

## Warnings

### WR-01: Post-handshake data silently discarded in `tryInitialize`

**File:** `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts:366`
**Issue:** `afterHandshake` is populated from `readHandshake()` and the guard on line 366 checks its length, but the body only logs the length — it never calls `processMessage(afterHandshake)`. Any IPC message that arrives in the same TCP read buffer as the handshake will be silently dropped. This is a logic error: the comment on lines 365–369 says "inject it as the first message" but the code does not do that.
**Fix:**
```typescript
// After startReceiving() call, replace the logging-only block:
if (afterHandshake.length > 0) {
  log('debug', 'Processing data that came after handshake', {
    length: afterHandshake.length
  });
  this.processMessage(afterHandshake).catch(err => {
    log('error', 'Error processing post-handshake message', { error: err.message });
  });
}
```

---

### WR-02: `kill` receives an unvalidated string interpolated from `tasklist` CSV output

**File:** `src/ModInstaller.IPC.TypeScript/src/cleanup-processes.ts:42`
**Issue:** On the Windows path, `parseInt(pid)` on line 42 is called without a radix argument. A CSV column like `" 0755"` would be parsed as octal in environments where the ES5 legacy behaviour applies (older engines). The `parseInt` on line 19 (Linux path) correctly passes radix `10`. This is inconsistent and a latent correctness bug, even if current V8 behaviour ignores the leading zero for non-`0x` strings.

Additionally on the Linux path (line 57), although `pid` is typed as `number`, the `kill -9 ${pid}` shell interpolation relies on the TypeScript type system to guarantee the value is numeric. There is no runtime guard. If `parseInt` ever produces `NaN` (e.g., malformed pgrep output that slips past the `.filter(pid => !isNaN(pid))`), the shell receives `kill -9 NaN`, which is a harmless no-op, but the intent should be explicitly enforced.
**Fix:**
```typescript
// Line 42 — add radix:
processes.push(parseInt(pid, 10));

// Line 57 — add explicit numeric guard before shelling out:
if (!Number.isInteger(pid) || pid <= 0) {
  console.error(`Refusing to kill invalid PID: ${pid}`);
  return false;
}
await exec(`kill -9 ${pid}`);
```

---

### WR-03: `main()` is never called — cleanup-processes.ts silently does nothing as a script

**File:** `src/ModInstaller.IPC.TypeScript/src/cleanup-processes.ts:77`
**Issue:** The `main()` function is defined but never invoked. The `package.json` scripts `"cleanup"` and `"list-processes"` reference `node cleanup-processes.js`, which will exit immediately without scanning or killing anything. The file is also re-exported from `src/index.ts`, making `main()` part of the public API, which is almost certainly unintentional for a CLI-only helper.
**Fix:**
```typescript
// At the end of the file, add a CLI entry guard:
if (require.main === module) {
  main().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
}
```
Also consider removing the `export * from './cleanup-processes'` re-export from `src/index.ts` if `main` is not intended as a public API.

---

### WR-04: Test `scan()` builds paths with hardcoded backslash on Linux — produces invalid absolute paths

**File:** `src/ModInstaller.IPC.TypeScript/test/verify-warning.spec.ts:88`
**Issue:** The `scan` function builds a `rel` string by joining with `\\` (hardcoded Windows separator). On line 92 the file path is assembled as `path.join(tempDir, rel)`. On Linux, `path.join('/tmp/abc', 'foo\\bar\\baz.txt')` treats the entire backslash-joined string as a single path component, producing `/tmp/abc/foo\bar\baz.txt` (a literal filename containing backslashes), not a valid multi-level path. `fs.existsSync` would then fail for nested files. The comment on line 84 says "IPC convention" — this works only if the IPC layer expects backslashes in the payload, not in the on-disk paths passed to `path.join`.
**Fix:**
```typescript
// Use path.join for on-disk paths; keep backslash only in the IPC payload strings:
function scan(dir: string, prefix: string = ''): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fsRelPath = prefix
      ? path.join(prefix, entry.name)   // platform-correct separator for disk
      : entry.name;
    const ipcRelPath = prefix
      ? `${prefix}\\${entry.name}`      // backslash convention for IPC payload
      : entry.name;
    if (entry.isDirectory()) {
      scan(path.join(dir, entry.name), ipcRelPath);
    } else {
      files.push(path.join(dir, fsRelPath));  // valid on-disk absolute path
    }
  }
}
```

---

## Info

### IN-01: `process` PID logged before stdout/stderr listeners are attached

**File:** `src/ModInstaller.IPC.TypeScript/src/launchers/RegularProcessLauncher.ts:29`
**Issue:** The pid is logged on line 29 immediately after spawn. The stdout/stderr `data` listeners are not attached until lines 34–57. For very fast processes, early output could be emitted and lost before the listeners register. This is a minor timing window. The larger concern is that `BaseIPCConnection.tryInitialize` also attaches `stdout` and `stderr` listeners (lines 289–303), creating double-listener registrations on the same streams — output will be logged twice.
**Fix:** Remove the duplicate stdout/stderr listeners in `RegularProcessLauncher` or make them conditional on a debug flag. `BaseIPCConnection` already handles stdout/stderr. Keep logging in one place only.

---

### IN-02: `generateId()` uses `Math.random()` — not cryptographically unique

**File:** `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts:888`
**Issue:** Message IDs are generated with two `Math.random()` calls. The collision probability over thousands of concurrent in-flight messages is not zero. This is not a security issue (IPC is local), but a correctness risk for long-running sessions with high message rates.
**Fix:** Use `crypto.randomUUID()` (available in Node 22+) or `crypto.randomBytes(8).toString('hex')` for guaranteed uniqueness:
```typescript
import { randomBytes } from 'crypto';
private generateId(): string {
  return randomBytes(8).toString('hex');
}
```

---

### IN-03: `actions/checkout` version pinned without SHA — supply chain best practice

**File:** `.github/workflows/build-packages.yml:24`
**Issue:** All four `actions/checkout@v6` usages are pinned to a floating major-version tag rather than a specific commit SHA. A compromised tag update could inject malicious code into the build. This is a well-known supply chain pattern for GitHub Actions.
**Fix:** Pin to a full commit SHA, for example:
```yaml
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v6.0.2
```
Apply the same pattern to `actions/setup-dotnet`, `volta-cli/action`, `pnpm/action-setup`, `actions/upload-artifact`, and `actions/download-artifact`.

---

_Reviewed: 2026-04-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
