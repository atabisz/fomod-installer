# Coding Conventions

**Analysis Date:** 2026-04-09

## Naming Patterns

**Files:**
- Pascal case for class/interface files: `ModInstaller.ts`, `BaseIPCConnection.ts`, `NamedPipeTransport.ts`
- Kebab case for utilities and shared files: `cleanup-processes.ts`, `sharedTestData.ts`
- Index files: `index.ts` for barrel exports
- Type definition files: `index.ts` grouped in `types/` subdirectories

**Functions:**
- Camel case for function names: `initialize()`, `tryInitialize()`, `findExecutable()`, `getExecutablePaths()`
- Static factory/utility functions use camel case: `testSupported()`, `setDefaultCallbacks()`
- Callback functions: Explicit naming with `Callback` suffix: `SelectCallback`, `ContinueCallback`, `CancelCallback`
- Private methods: Camel case with leading underscore discouraged; privacy enforced via `private` keyword

**Variables:**
- Camel case for all variables and parameters: `connectionTimeout`, `testCase`, `archiveFiles`
- Constants in interfaces/types: Use full names, not SCREAMING_CASE (e.g., `SelectExactlyOne` not `SELECT_EXACTLY_ONE`)
- Type narrowing variables: `normalizedPath`, `normalizedDir`, `expectedNormalized`, `actualNormalized`

**Types:**
- Interfaces prefixed with `I`: `IModInstaller`, `ITransport`, `IFileSystem`, `IPlugin`, `IGroup`, `IInstallStep`, `IHeaderImage`
- Type aliases for callbacks: `SelectCallback`, `ContinueCallback`, `CancelCallback`
- Discriminated unions for type variants: `OrderType` ('AlphaAsc' | 'AlphaDesc' | 'Explicit'), `GroupType` ('SelectAtLeastOne' | 'SelectAtMostOne' | ...), `PluginType` ('Required' | 'Optional' | ...)

## Code Style

**Formatting:**
- TypeScript compiler configured via `tsconfig.json`
- No explicit Prettier/ESLint config detected; relies on TypeScript strict mode
- Indentation: 2 spaces (standard in package.json scripts and source files)
- Line length: No enforced limit, but single-line destructuring common in imports
- Semicolons: Always included (TypeScript default)
- Quotes: Single quotes in imports, double quotes in comments and strings where necessary

**Linting:**
- TypeScript strict mode enabled: `"strict": true`
- `noUnusedParameters: true` — all function parameters must be used or prefixed with `_`
- `noImplicitReturns: true` — all code paths must explicitly return
- `noFallthroughCasesInSwitch: true` — switch cases must be exhaustive or explicit break
- `strictNullChecks: true` — null/undefined safety enforced
- `noUnusedLocals: false` — unused local variables allowed (not reported)

## Import Organization

**Order:**
1. External libraries: `import { addon } from './resolve-native'`
2. Local types: `import * as types from './types'`
3. Local utilities/services: `import { ConnectionStrategy, ... } from './launchers'`
4. Relative imports: Always use `./` prefix for relative paths

**Path Aliases:**
- No path aliases configured; relative imports used throughout
- Barrel exports common in `types/index.ts` and main `index.ts` for re-exporting public API

**Barrel Files:**
- `src/index.ts` in Native module: Exports all public classes and types
- `src/types/index.ts`: Central type export point, re-exports all interface definitions
- `src/transport/index.ts`: Re-exports ITransport interface and concrete transports

## Error Handling

**Patterns:**
- Error collection with context: Collect errors in array before throwing aggregate (`BaseIPCConnection.initialize()` lines 170-224)
- Named error types: Custom error messages with semantic context (e.g., `error.name = 'ProcessError'`)
- Error propagation: Use `try/catch` with re-throw and enhancement, not silent failures
- Validation before operations: Check null/undefined explicitly (`if (!this.transport || !this.launcher)`)
- Error logging via framework: Use `log('error', message, context)` from vortex-api or console

**Example:**
```typescript
// BaseIPCConnection.ts lines 194-207
} catch (err: any) {
  log('warn', `Connection strategy ${i + 1} failed`, {
    transportType: this.transport.type,
    securityLevel: this.launcher.getSecurityLevel(),
    error: err.message
  });

  errors.push({
    strategyIndex: i,
    transport: this.transport.type,
    launcher: this.launcher.getSecurityLevel(),
    error: err
  });
}
```

## Logging

**Framework:** Vortex API logging (`log` from 'vortex-api') for IPC module; test logging via console

**Patterns:**
- Structured logging with context objects: `log('level', 'message', { key: value })`
- Log levels: `'info'`, `'warn'`, `'error'`, `'debug'`
- Process lifecycle events logged: initialization, strategy attempts, exit codes
- Data transformation logged: path normalization, callback registration
- Example in `BaseIPCConnection.ts` lines 177-180:
  ```typescript
  log('info', `Attempting connection strategy ${i + 1}/${this.strategies.length}`, {
    transportType: this.transport.type,
    securityLevel: this.launcher.getSecurityLevel()
  });
  ```

## Comments

**When to Comment:**
- Complex algorithm logic: Path normalization with backslash/forward-slash conversions (ModInstaller.shared.spec.ts lines 112-126)
- Non-obvious design decisions: Why certain callbacks are structured (e.g., lines 15-26 in test file)
- Platform-specific workarounds: Windows path handling, process exit handling
- TODO comments: Not found in current codebase (encouraging preventive practices)

**JSDoc/TSDoc:**
- Extensive inline documentation via JSDoc in `BaseIPCConnection.ts`:
  - Class-level documentation: 11 lines describing purpose and usage
  - Method documentation: `@param` tags, `@returns` tags, `@example` blocks
  - Interface documentation: Detailed descriptions of message structure and configuration
  - Example from lines 101-117:
    ```typescript
    /**
     * Create a new IPC connection with fallback strategies
     * ...
     * @example
     * // Try sandbox with named pipe, fallback to regular with named pipe, then TCP
     */
    ```

## Function Design

**Size:** 
- Utility functions: 3-10 lines (e.g., `normalizeInstruction()`)
- Initialization methods: 50-150 lines for complex setup (`tryInitialize()`)
- Test helpers: 20-40 lines

**Parameters:**
- Constructor injection pattern: Dependencies passed as parameters, not instantiated internally
- Callback functions: Parameters are named callbacks with full type signatures
- Options objects: Configuration passed as single object parameter to handle many options
- Example: `BaseIPCConnection` constructor (lines 119-133) takes strategies array, timeout number, and optional timeoutOptions

**Return Values:**
- Promises for async operations: `Promise<void>`, `Promise<T | null>`, `Promise<{ key: type }[]>`
- Object destructuring in returns: Return structured objects with named fields for clarity
- Nullable returns: `InstallResult | null` for operations that may not produce results
- Type narrowing: Return discriminated unions for different success/failure states

## Module Design

**Exports:**
- Public classes exported at module level: `export class ClassName`
- Re-export pattern in barrel files: `export * from './module'`
- Type-only exports: `export interface ISomething`, `export type CallbackType = (...) => void`
- Named exports preferred over default exports (only found in vitest config)

**Barrel Files:**
- `src/index.ts` in Native module (lines 1-10):
  ```typescript
  export * from './Common';
  export * from './Logger';
  export * from './ModInstaller';
  export * from './FileSystem';
  export { types }
  ```
- Allows consumers to import: `import { NativeModInstaller, types } from '@nexusmods/fomod-installer-native'`

---

*Convention analysis: 2026-04-09*
