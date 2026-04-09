# Codebase Concerns

**Analysis Date:** 2026-04-09

## Technical Debt

### IPC Connection Strategy Complexity

**Issue:** Multi-layer fallback strategy adds complexity for transport/launcher combinations

**Files:** `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts` (lines 88-225)

**Impact:** 
- Connection initialization attempts multiple strategies sequentially (Named Pipe → TCP, Regular → Sandbox). Each failed attempt requires cleanup (`cleanupFailedStrategy()`), creating potential for resource leaks if cleanup fails.
- Error messages aggregate across all strategies; debugging is difficult when all strategies fail.
- The code maintains significant state for tracking current strategy index and managing transitions.

**Fix Approach:**
- Introduce a dedicated ConnectionManager class to separate strategy lifecycle from core IPC logic
- Implement retry budget limits per strategy to prevent cascade failures
- Add explicit strategy selection logging to reduce debugging burden

---

### Timeout Dialog Management

**Issue:** Timeout dialog state is tracked within AwaitingPromise, coupling business logic with UI concerns

**Files:** `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts` (lines 37-43, 543-593)

**Impact:**
- Dialog dismissal is manual (`onDismissDialog()`); if the promise resolves before the dialog callback executes, the dialog ID becomes stale and orphaned dialogs may remain visible
- The `dialogId` field in AwaitingPromise mixes timeout infrastructure with UI lifecycle concerns
- No guarantee that dialogs are cleaned up in all code paths

**Fix Approach:**
- Extract timeout dialog state into a separate DialogManager class
- Implement automatic dialog teardown when operations complete
- Add integration tests verifying dialog cleanup across all exit paths

---

### Unhandled Process Output Patterns

**Issue:** Heuristic-based process error detection on stderr is fragile

**Files:** `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts` (lines 290-303)

**Impact:**
- stderr parsing uses substring checks for 'Exception', 'Error:', 'Failed to' to decide log severity (lines 298-302)
- Process may output these strings in non-error contexts (e.g., documentation, debug output), triggering false error logs
- No structured logging format means logs from the C# process are unvalidated

**Fix Approach:**
- Define a structured output format (JSON or delimited) that C# process must follow
- Parse output format first; fall back to heuristic only if format validation fails
- Add test cases for C# process outputting error-like strings in non-error contexts

---

### Empty Error Catch Block

**Issue:** Overly broad exception suppression in grantFileSystemAccess

**Files:** `src/ModInstaller.IPC.TypeScript/src/launchers/SandboxProcessLauncher.ts` (line 184)

**Impact:**
- `catch { }` on line 184 silently swallows all errors from file access grant, including:
  - Permission denied (expected, recoverable)
  - Actual bugs in winapi-bindings (unexpected, should fail)
  - Out-of-memory or system errors (should not be swallowed)

**Fix Approach:**
- Parse error message and only suppress permission-denied errors
- Log and re-throw unexpected errors
- Add unit tests verifying each error type is handled correctly

---

## Known Issues

### Typo in Process Cleanup Utility

**Issue:** Typo "kill ed" in success message

**Files:** `src/ModInstaller.IPC.TypeScript/src/cleanup-processes.ts` (line 41)

**Impact:** 
- Minor: console output displays "Successfully kill ed process {pid}" instead of "Successfully killed process {pid}"
- No functional impact, but reduces professionalism in logs

**Fix Approach:**
- Change line 41 from `console.log(`Successfully kill ed process ${pid}`)` to `console.log(`Successfully killed process ${pid}`)`

---

### Incomplete Callback Pattern in SandboxProcessLauncher

**Issue:** Wrapping createServers modifies transport state without formal callback interface

**Files:** `src/ModInstaller.IPC.TypeScript/src/launchers/SandboxProcessLauncher.ts` (lines 48-65)

**Impact:**
- SandboxProcessLauncher wraps transport.createServers by mutating the function reference directly
- If multiple launchers are created for the same transport instance, later wrappers overwrite earlier ones
- No validation that wrapped function signature matches original

**Fix Approach:**
- Implement a formal callback interface in ITransport for security setup
- Pass launcher instance to createServers instead of wrapping the function
- Add integration tests with multiple concurrent launcher instances

---

### Process Kill Signal Ordering

**Issue:** Inconsistent kill signal sequences between BaseIPCConnection and SandboxProcessLauncher

**Files:** 
- `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts` (lines 829-846)
- `src/ModInstaller.IPC.TypeScript/src/launchers/SandboxProcessLauncher.ts` (lines 380-384)

**Impact:**
- BaseIPCConnection sends SIGTERM then waits 2 seconds before SIGKILL
- SandboxProcessLauncher has no kill mechanism (line 382: "winapi-bindings doesn't provide a kill mechanism")
- Processes may not terminate cleanly if killed while holding locks or with open transactions

**Fix Approach:**
- Implement a graceful shutdown sequence: send Quit command → wait for exit → SIGTERM → wait → SIGKILL
- Add timeout telemetry to track how many processes require SIGKILL vs. clean exit
- Document minimum timeout requirements per operation type

---

## Security Considerations

### Named Pipe vs. TCP Security Trade-off

**Issue:** Fallback from Named Pipe to TCP reduces security posture

**Files:** 
- `src/ModInstaller.IPC.TypeScript/src/transport/NamedPipeTransport.ts` (lines 5-24)
- `src/ModInstaller.IPC.TypeScript/src/transport/TCPTransport.ts` (lines 7-18)
- `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts` (lines 113-117)

**Risk:** 
- Default fallback order tries Named Pipe first, then TCP (localhost only)
- If Named Pipe fails due to transient filesystem state, process falls back to TCP, which is less secure (exposed to network layer)
- Antivirus or security software that blocks Named Pipes forces downgrade to TCP
- TCP comment warns: "Slower than named pipes (TCP/IP stack overhead)" and "Less secure (exposed to network layer)"

**Current Mitigation:** TCP only binds to 127.0.0.1, not exposed to network

**Recommendations:**
- Add security level selection: require Named Pipe for sensitive operations, allow TCP fallback only on explicit user approval
- Log security level downgrade as warning
- Consider adding timeout-based auto-recovery (retry Named Pipe after TCP timeout)

---

### App Container Deletion Permission Error Handling

**Issue:** Suppresses permission-denied errors during App Container cleanup

**Files:** `src/ModInstaller.IPC.TypeScript/src/launchers/SandboxProcessLauncher.ts` (lines 158-166, 235-252)

**Risk:**
- DeleteAppContainer fails silently due to insufficient permissions (expected on non-elevated contexts)
- Comment (lines 243-245) explains this is known limitation: "We most probably do not have permissions to delete the container as the file system permissions were created by an elevated process"
- Orphaned App Containers accumulate over time if cleanup repeatedly fails
- No mechanism to detect or report container accumulation to the user

**Current Mitigation:** Deletes existing container at launch time (line 160: DeleteAppContainer before CreateAppContainer)

**Recommendations:**
- Implement periodic container cleanup task in elevated context (NSIS installer or scheduled task)
- Add telemetry to log container creation/deletion success rates
- Document manual cleanup steps for users if containers accumulate

---

### Executable Path Resolution No Fallback

**Issue:** Executable lookup fails if distributed executable not present

**Files:** `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts` (lines 452-472)

**Risk:**
- Only checks paths from getExecutablePaths() (default: dist/ relative to __dirname)
- No fallback to system PATH, environment variables, or development build directories
- If npm package is malformed (missing dist/ModInstallerIPC.exe), initialization fails with unclear error

**Current Mitigation:** Error message lists all attempted paths (line 470)

**Recommendations:**
- Add environment variable fallback: check $FOMOD_INSTALLER_EXEC_PATH if set
- Add development-time fallback: check project root ../../../ModInstaller.IPC/ for unbuilt development
- Improve error message to suggest troubleshooting steps

---

## Performance Bottlenecks

### File System Access Grant Duration

**Issue:** Granting App Container access to filesystem is slow (lines 300-301 comment: "takes 12+ seconds due to large number of files")

**Files:** `src/ModInstaller.IPC.TypeScript/src/launchers/SandboxProcessLauncher.ts` (lines 257-333)

**Problem:**
- TEMP directory access grant is commented out (lines 300-322) because it takes 12+ seconds
- No caching or batching of permission grants
- Each grantAdditionalAccess() call iterates and grants individually (lines 340-365)

**Current Workaround:** ModInstallerIPC.exe self-contained, temp directory access not required

**Improvement Path:**
- Batch multiple directory grants into single winapi call if API supports it
- Cache successful grant decisions to avoid redundant calls
- Measure and log grant operation duration to track performance regressions
- Consider pre-granting common directories at install time

---

### Pending Promise Timeout Overhead

**Issue:** Every IPC command maintains a timeout even when operation is fast

**Files:** `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts` (lines 539-599)

**Impact:**
- Default timeout is connectionTimeout (10 seconds) per line 597
- Fast operations (e.g., query callbacks) still pay full timeout scheduling cost
- Timeout dialogs add event loop overhead if user interactions occur

**Current Mitigation:** Caller can specify custom timeout; critical operations use 60s (line 66 in test)

**Improvement Path:**
- Implement adaptive timeouts based on operation type (e.g., short for queries, long for installs)
- Add performance histogram telemetry: track operation duration vs. timeout
- Alert if slow operations are common (may indicate process hang)

---

## Fragile Areas

### BaseIPCConnection Error Path Management

**Issue:** Complex error path logic may leave resources in inconsistent state

**Files:** `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts` (lines 530-628)

**Why Fragile:**
- sendAndReceive creates a pending promise and schedules timeout
- If sendMessage fails, cleanup happens at lines 619-624, but timeout may already be scheduled
- If timeout fires after sendMessage fails, it tries to reject a pending reply that may be partially cleaned up
- Multiple code paths can trigger timeout dismissal (lines 743-750); order of operations matters

**Safe Modification:**
- Add FSM (Finite State Machine) for pending promise state: pending → sent → responded → cleaned up
- Verify state before any operation that mutates pending
- Add assertions to catch state machine violations

**Test Coverage Gaps:**
- No tests for: sendMessage fails → timeout fires race condition
- No tests for: timeout fires → response arrives race condition
- No tests for: dialog dismiss races with promise resolution

---

### Transport Layer Initialization Fragility

**Issue:** Transport state must transition correctly across three phases (initialize → createServers → waitForConnection)

**Files:** `src/ModInstaller.IPC.TypeScript/src/transport/NamedPipeTransport.ts` (lines 76-150)

**Why Fragile:**
- createServers cannot be called before initialize (lines 118-123 check pipePathOut/pipePathIn are null)
- waitForConnection assumes servers already exist (lines 94-113 check serverOut/serverIn)
- If waitForConnection times out, sockets remain in listening state; no cleanup until dispose()
- No validation that transitions occur in correct order

**Safe Modification:**
- Add explicit state enum: Uninitialized → Initialized → ServersCreated → Connected → Disposed
- Throw if called in wrong state
- Add timeout handling in waitForConnection that cleans up servers if connection fails

**Test Coverage Gaps:**
- No tests for: calling createServers before initialize
- No tests for: timeout in waitForConnection leaves servers listening
- No tests for: concurrent calls to waitForConnection

---

### JSON Parsing with No Validation

**Issue:** IPC messages parsed as JSON with no schema validation

**Files:** `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts` (lines 652-674)

**Why Fragile:**
- JSON.parse at line 654 throws if message is invalid JSON
- No validation of message structure; assumes callback/response/error fields are present
- If C# process sends malformed message, error is logged but pending promise is not rejected
- Message buffer can accumulate if delimiter parsing fails

**Safe Modification:**
- Implement strict schema validation: define IPCMessage interface, validate with library like zod
- If validation fails, log error details and disconnect
- Add metrics: track validation failures and correlation with process version

---

## Missing Critical Features

### No Message Rate Limiting

**Issue:** No protection against IPC message flooding

**Files:** `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts`

**Problem:**
- Process can send unlimited IPC messages
- receiveBuffer accumulates unbounded if delimiter not found
- No rate limit on callback invocations from C# process

**Impact:**
- Memory exhaustion if process buggy and sends garbage
- DOS attack surface if process compromised

**Recommendation:**
- Implement message queue with max size
- Reject messages if queue exceeds threshold
- Add backpressure signaling to C# process (e.g., close socket if queue full)

---

### No Connection Pooling or Reuse

**Issue:** New IPC connection spun up per operation, not reused

**Files:** Consumer code outside this library (e.g., Vortex plugin)

**Problem:**
- Each install operation requires full connection initialization (start process, connect transport)
- Connection teardown (graceful quit, process kill, cleanup)
- Overhead is 1-2 seconds per operation

**Impact:**
- If multiple mods installed sequentially, repeated overhead
- Slow installations on systems with many plugins

**Recommendation:**
- Implement connection pool (optional): reuse connections for batch operations
- Add configuration: connection TTL before auto-close
- Measure overhead impact on real Vortex installations

---

### No Heartbeat / Liveness Check

**Issue:** No periodic health check for IPC connection

**Files:** `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts`

**Problem:**
- If C# process hangs silently, pending operations wait for full timeout
- No way to detect dead connection without sending a command
- Timeout is reactive, not proactive

**Impact:**
- User waits full timeout duration (10-60s) before learning connection is dead

**Recommendation:**
- Add optional heartbeat command (e.g., `Ping`) sent periodically if no activity
- Detect dead connection and reconnect before user-facing timeout
- Add heartbeat interval configuration (default: 5s)

---

### Test Coverage Gaps

**Area: IPC Message Routing**

**What's Not Tested:**
- Unordered delivery: responses arrive out of order relative to requests
- Duplicate responses: C# process sends two responses for one request
- Partial messages: connection breaks mid-message, buffer contains incomplete JSON
- Message size limits: very large payloads (>10MB)

**Files:** `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts`

**Risk:** Production use may expose edge cases in message handling

---

**Area: Transport Fallback**

**What's Not Tested:**
- All fallback strategies (currently only TCP transport is easily testable)
- Recovery from transient connection failures
- Cleanup correctness when strategy fails mid-initialization
- Named Pipe availability detection on non-Windows

**Files:** `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts` (lines 169-225)

**Risk:** Fallback logic only exercised in production when something goes wrong

---

**Area: Process Lifecycle**

**What's Not Tested:**
- Process exit during active operation (pending promise is pending when exit fires)
- Process stderr/stdout parsing edge cases (empty lines, binary data, very long lines)
- Sandbox cleanup on permission denied (only caught in error log)
- Multiple concurrent connections (resource contention)

**Files:** 
- `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts` (lines 769-793)
- `src/ModInstaller.IPC.TypeScript/src/launchers/SandboxProcessLauncher.ts` (lines 235-252)

**Risk:** Resource leaks or hangs may only manifest under specific production conditions

---

## Scaling Limits

### Per-Process Memory Usage (Native Module)

**Concern:** Native AOT compiled library may have higher memory footprint than interpreted WASM

**Files:** `src/ModInstaller.Native.TypeScript/` (entire package)

**Limits:**
- Native library must be loaded for each Node.js process
- Memory shared across all users of the library within a process
- No lazy loading or unloading mechanism

**Scaling Path:**
- Profile memory usage with multiple concurrent mod installations
- Consider shared memory IPC if memory becomes bottleneck
- Implement library caching if memory is high relative to operation duration

---

### Process Pool Saturation

**Concern:** Unbounded creation of ModInstallerIPC.exe processes

**Files:** `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts` (lines 169-225)

**Limits:**
- Each install creates one IPC process
- No process pooling or reuse
- Batch install (20+ mods) spawns 20+ processes sequentially
- Windows process limits may be reached on systems with many concurrent operations

**Scaling Path:**
- Implement optional connection pool (see Missing Features)
- Add telemetry: track peak process count
- Document recommended max concurrent installs

---

### Named Pipe Accumulation

**Concern:** Named pipes created but not cleaned up persist until OS reboot

**Files:** `src/ModInstaller.IPC.TypeScript/src/transport/NamedPipeTransport.ts` (lines 117-150)

**Limits:**
- Each initialize creates new pipe ID (line 84)
- If dispose fails, pipes remain in system
- Windows limits number of named pipes per session
- No pipe cleanup on process crash

**Scaling Path:**
- Implement pipe cleanup on module unload
- Add detection of stale pipes (time-based expiration)
- Generate stable pipe names (hash of session ID) to allow recovery of existing pipes

---

*Concerns audit: 2026-04-09*
