# Testing Patterns

**Analysis Date:** 2026-04-09

## Test Framework

**Runner:**
- Vitest — configured in `src/ModInstaller.Native.TypeScript/vitest.config.ts`
- Test timeout: 60,000ms (60 seconds) to allow long-running installation simulations
- Force exit: Enabled (`forceExit: true`) to terminate test suite cleanly

**Configuration Files:**
- `src/ModInstaller.Native.TypeScript/vitest.config.ts` (lines 1-9):
  ```typescript
  import { defineConfig } from 'vitest/config';
  
  export default defineConfig({
    test: {
      include: ['test/**/*.spec.ts'],
      testTimeout: 60_000,
      forceExit: true,
    },
  });
  ```

**Run Commands:**
```bash
npm run test              # Run all tests via build.js (handles native compilation)
npm run test-vitest      # Run vitest directly (requires pre-built native binaries)
npm run watch:build      # TypeScript watch mode (used during development)
```

**IPC Module:**
- `src/ModInstaller.IPC.TypeScript/package.json` (line 29): `"test": "vitest run"`
- Native module wraps tests with build process: `npm test` calls `node build.js test`

## Test File Organization

**Location:**
- Tests co-located in `test/` directory at same level as `src/`
- Native module: `src/ModInstaller.Native.TypeScript/test/`
- IPC module: `src/ModInstaller.IPC.TypeScript/test/`

**Naming:**
- `.spec.ts` suffix: `ModInstaller.shared.spec.ts`, `ModInstaller.ipc.spec.ts`
- Shared test data: `sharedTestData.ts` (non-test helper, imported by both Native and IPC tests)

**Structure:**
```
src/ModInstaller.Native.TypeScript/
├── test/
│   ├── ModInstaller.shared.spec.ts    # Main test suite
│   └── sharedTestData.ts              # Test data helpers
src/ModInstaller.IPC.TypeScript/
├── test/
│   ├── ModInstaller.ipc.spec.ts       # IPC-specific tests
│   └── sharedTestData.ts              # Reused test data
```

## Test Structure

**Suite Organization:**
- Single suite per test file, organized by test case iteration
- No explicit `describe()` blocks; tests generated via for-loop
- Test names include game context and test case name

**Example from Native module (lines 216-220):**
```typescript
// Generate tests from shared JSON data (supports both .zip and .7z)
for (const testCase of getAllTestCases()) {
  test(`${testCase.game}: ${testCase.name}`, async () => {
    await runTestCase(testCase);
  });
}
```

**Patterns:**
- Test setup: Extracted into helper functions (`createDeterministicUICallbacks`, `runTestCase`)
- Async/await: All tests marked `async` due to promises (file I/O, native binding calls)
- Deterministic UI: Callbacks pre-configured with predetermined choices, eliminating manual intervention
- Single assertion pattern: Each test validates one end-state (success or failure)

## Mocking

**Framework:** Native mocks via JavaScript closures and callback registration

**Patterns:**

1. **UI Callback Mocking (Native module, lines 16-71):**
   ```typescript
   const createDeterministicUICallbacks = (
     dialogChoices?: SelectedOption[],
     gameVersion?: string,
     extenderVersion?: string
   ) => {
     let selectCallback: types.SelectCallback | null = null;
     let contCallback: types.ContinueCallback | null = null;
     let _cancelCallback: types.CancelCallback | null = null;
     const unattended = dialogChoices === undefined;
     let dialogInProgress = false;

     return {
       pluginsGetAll: (_activeOnly: boolean): string[] => [],
       contextGetAppVersion: (): string => '1.0.0',
       contextGetCurrentGameVersion: (): string => gameVersion ?? '1.0.0',
       // ... more callbacks
     };
   };
   ```
   - Mocks stored as object with named properties matching C# callback expectations
   - Callback closures capture state (e.g., `selectCallback`, `unattended` flag)
   - Optional underscore prefix on unused parameters: `_activeOnly`, `_moduleName`

2. **Callback Registration (IPC module, lines 76-91):**
   ```typescript
   this.registerCallback('pluginsGetAll', (_activeOnly: boolean) => installedPlugins);
   this.registerCallback('iniGetBool', (_file: string, _section: string, _key: string) => null);
   // ...
   ```
   - Explicit callback registration for each C# interface method
   - Returns predefined data (empty arrays, null, hardcoded values) for test isolation
   - Underscore prefix for all unused parameters

3. **File System Mocking (Native module, lines 113-159):**
   ```typescript
   const syncFs = new NativeFileSystem(
     (filePath: string, offset: number, length: number): Uint8Array | null => {
       const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
       const content = fileCache.get(normalizedPath);
       if (!content) return null;
       // ...
       return content;
     },
     // ... more callbacks
   );
   ```
   - Callback-based file system abstraction
   - Path normalization inside mock to match cache keys
   - Returns `Uint8Array` or `null` per interface contract

**What to Mock:**
- UI interactions: Provide deterministic dialog choices
- File I/O: Use in-memory cache (`fileCache`) with pre-loaded archive contents
- Context callbacks: Return fixed values (game version, app version, installed plugins)
- Conditions: Mock based on test requirements (present/absent extenders, active/inactive plugins)

**What NOT to Mock:**
- Installation logic: Uses real native bindings
- Path normalization: Tests real path handling including backslash/forward-slash conversion
- Data comparison: Real instruction comparison (`compareInstructions()` normalizes and sorts)
- Archive reading: Pre-loads and tests against real archive contents

## Fixtures and Factories

**Test Data:**
- Shared fixture object `TestCase` interface (defined in sharedTestData.ts):
  ```typescript
  interface TestCase {
    game: string;
    name: string;
    archiveFile: string;
    expectedInstructions: Instruction[];
    dialogChoices?: SelectedOption[];
    gameVersion?: string;
    extenderVersion?: string;
    preset?: any;
    preselect?: boolean;
    validate?: boolean;
    pluginPath: string;
    stopPatterns: string[];
  }
  ```

**Location:**
- `src/ModInstaller.Native.TypeScript/test/sharedTestData.ts` (358 lines)
- Exports functions: `getAllTestCases()`, `getStopPatterns()`, `preloadArchive()`
- Used by both Native and IPC test suites

**Fixture Patterns:**
- JSON-driven test cases: Loaded from external JSON files (implied by `getAllTestCases()` implementation)
- Archive preloading: `preloadArchive(archiveFile, game)` returns `{ files, fileCache, close() }`
- Instruction factory: Expected instructions built from domain-specific objects

**Example from Native test (lines 104-126):**
```typescript
async function runTestCase(testCase: TestCase): Promise<void> {
  const archive = await preloadArchive(testCase.archiveFile, testCase.game);
  
  try {
    const { files, fileCache } = archive;
    const stopPatterns = getStopPatterns(testCase);
    
    // Use preloaded data
    const syncFs = new NativeFileSystem(
      (filePath: string, offset: number, length: number): Uint8Array | null => {
        const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
        const content = fileCache.get(normalizedPath);
        // ...
      }
    );
  } finally {
    await archive.close();
  }
}
```

## Coverage

**Requirements:** No coverage threshold specified in vitest config; no .coverage folder detected

**Tools:** Vitest has built-in coverage support (not currently enabled)

**View Coverage:**
```bash
npm run test -- --coverage
# (if configured in vitest.config.ts)
```

**Current State:**
- Coverage not enforced
- Both test files exercise: path normalization, callback registration, instruction comparison, async/await patterns
- Estimated coverage: UI layer (100% via mocks), native bindings (100% via test harness), error paths (partial)

## Test Types

**Unit Tests:**
- Scope: Installer logic validation, instruction generation correctness
- Approach: Deterministic UI callbacks + pre-loaded archive data + assertion on generated instructions
- Native module test (ModInstaller.shared.spec.ts): 220 lines, 1 test generator looping over test cases
- File: `src/ModInstaller.Native.TypeScript/test/ModInstaller.shared.spec.ts`

**Integration Tests:**
- Scope: IPC communication, process lifecycle, transport fallback
- Approach: Launch real C# process, send commands via transport, verify responses
- IPC module test (ModInstaller.ipc.spec.ts): Tests BaseIPCConnection subclass communication
- File: `src/ModInstaller.IPC.TypeScript/test/ModInstaller.ipc.spec.ts`

**E2E Tests:**
- Not explicitly present in codebase
- Integration tests approximate E2E by spawning real child processes

## Common Patterns

**Async Testing:**
- All tests marked `async` with `await` for promises
- Pattern: Load fixture → configure mocks → run operation → await result → assert
- Example (Native module, line 217):
  ```typescript
  test(`${testCase.game}: ${testCase.name}`, async () => {
    await runTestCase(testCase);
  });
  ```

**Error Testing:**
- Implicit error handling: Tests expect successful results; null returns indicate failure
- Assertion pattern: `expect(result).toBeTruthy()` for success; no explicit error assertions
- Example (lines 191-192):
  ```typescript
  expect(result).toBeTruthy();
  expect(result!.instructions).toBeTruthy();
  ```

**Test Assertion Pattern:**
- Vitest `expect()` with chain assertions: `expect(result).toBe(expectedValue)`
- Custom comparison helper: `compareInstructions()` normalizes paths and sorts before comparison
- Memory leak check in debug mode (lines 206-208):
  ```typescript
  if (isDebug) {
    expect(allocAliveCount()).toBe(0);
  }
  ```

**Test Data Normalization:**
- Instructions normalized for platform-independent comparison (lines 74-79):
  ```typescript
  const normalizeInstruction = (inst: Instruction): string => {
    const parts = [inst.type];
    if (inst.source) parts.push(inst.source.replace(/\\/g, '/').toLowerCase());
    if (inst.destination) parts.push(inst.destination.replace(/\\/g, '/').toLowerCase());
    return parts.join('|');
  };
  ```
- Backslash converted to forward slash
- Paths lowercased for case-insensitive comparison

---

*Testing analysis: 2026-04-09*
