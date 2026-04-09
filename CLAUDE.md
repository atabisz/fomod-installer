## Branch Strategy

This fork maintains two branches for clean upstream PR separation:

- **`linux-port`** — upstream PR candidate. Contains only Linux compatibility changes: path normalization fixes, case sensitivity handling, CSharpScript runtime guards, IPC Linux build support. No fork-specific tooling.
- **`master`** — full fork. Includes everything in `linux-port` plus GSD planning artifacts and any fork-specific work.

### Workflow rule

**Linux port work (upstream-eligible):** Commit to `linux-port` first, then merge into `master`.
**Fork-only work (planning, internal tooling):** Commit directly to `master` only.

### What belongs where

| Change type | Branch |
|---|---|
| Path normalization at parse time | `linux-port` |
| Case-insensitive path emit fixes | `linux-port` |
| CSharpScript runtime OS guard | `linux-port` |
| IPC Linux build pipeline / CI | `linux-port` |
| TCP transport improvements | `linux-port` |
| GSD `.planning/` docs | `master` only |
| Fork-specific IDE config | `master` only |

## Windows Constraints

**The Windows build must never break.** This is a cross-platform compatibility fork, not a Linux rewrite.

- All Linux-specific code paths must be guarded with `process.platform !== 'win32'` (TypeScript) or `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)` / `#if` conditionals (C#)
- No changes to Windows-only features: CSharpScript, NamedPipeTransport, AppContainer sandbox
- `Path.DirectorySeparatorChar` and `Path.AltDirectorySeparatorChar` must be used correctly — never hardcode `/` or `\` as a separator
- `StringComparison.OrdinalIgnoreCase` comparisons are correct and must be preserved on all platforms
- All fixes must be additive — no removal or replacement of existing Windows code paths
- The Native AOT `win-x64` build and the IPC `net9.0-windows` build must continue to pass CI unchanged

Do not add `Co-Authored-By` trailers to commit messages.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**fomod-installer: Linux/Proton Compatibility Fork**

A fork of `Nexus-Mods/fomod-installer` targeting full Linux compatibility for Vortex mod management under Steam Proton. Fixes silent C# script failures, inconsistent path normalization, case-sensitivity bugs, and missing IPC build pipeline for Linux — enabling correct FOMOD installations without Vortex-side workarounds.

**Core Value:** FOMOD mods install correctly on Linux/Vortex with no silent partial installs and no Vortex-side workarounds required.

### Constraints

- **Upstream compatibility**: All changes must be PR-splittable into small focused diffs mergeable to `Nexus-Mods/fomod-installer`
- **No .NET runtime dependency**: Native AOT path must remain self-contained (no .NET runtime install required)
- **Node.js ≥22**: Enforced by both packages' `engines` field
- **Platform**: Linux x64 primary target; Windows behavior must not regress
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.9.3 - Core Node.js packages (`src/ModInstaller.Native.TypeScript`, `src/ModInstaller.IPC.TypeScript`)
- C# (.NET 9) - Backend FOMOD parsing and script execution
- C++ 17 - Native bindings via N-API for AOT-compiled library
- JavaScript - Node.js build scripts and installation utilities
- ANTLR 3 - XML script parsing grammar
## Runtime
- Node.js 22+ (enforced via engines field)
- .NET 9 SDK (required for building C# components)
- pnpm 10.8.1 - Monorepo workspace management
- Lockfile: pnpm-lock.yaml (v9.0 format) present with catalog dependencies
## Frameworks
- N-API 8.5.0 - Native module bindings for shared library integration
- node-addon-api 8.5.0 - C++ wrapper for N-API
- node-gyp 10.0.0 - Native module build system for C++ bindings
- Webpack 5.105.4 - Module bundling for TypeScript packages
- ts-loader 9.5.4 - TypeScript transpilation for Webpack
- ts-node 10.9.2 - Direct TypeScript execution for build scripts
- Vitest 4.1.1 - Unit and integration test runner (configs: `src/ModInstaller.Native.TypeScript/vitest.config.ts`, `src/ModInstaller.IPC.TypeScript/vitest.config.ts`)
## Key Dependencies
- node-gyp-build 4.8.4 - Runtime resolution of precompiled native bindings (used in `src/ModInstaller.Native.TypeScript/src/resolve-native.ts`)
- vortex-api (Nexus-Mods/vortex-api) - Logging and utilities from Vortex mod manager, used throughout IPC and Native modules
- winapi-bindings (Nexus-Mods/node-winapi-bindings) - Windows API access for security levels and sandbox process launching
- node-stream-zip 1.15.0 - ZIP archive reading for FOMOD extraction
- node-7z 3.0.0 - 7zip compression utility integration
- 7zip-bin 5.2.0 - Precompiled 7zip binaries
- @types/node 22.19.15 - Node.js type definitions for TypeScript strict mode
## Dev Dependencies
- node-gyp 10.0.0 - Configured in `src/ModInstaller.Native.TypeScript/binding.gyp` for Windows (.lib) and Linux (.so) native libraries
- webpack-cli 5.1.4 - Webpack command-line interface for bundling
- Vitest 4.1.1 - Test runner with 60-120 second timeout windows for integration tests
## Configuration
- Volta config (`volta.node: 22.22.0`) pins Node.js version per-project
- Engines field enforces Node.js >=22 for both packages
- .env file handling: Appears to be unused (not detected in codebase)
- `src/ModInstaller.Native.TypeScript/tsconfig.json` - Strict TypeScript compilation (ES2019 target, CommonJS modules, declaration generation)
- `src/ModInstaller.Native.TypeScript/binding.gyp` - Native module configuration with platform-specific compiler flags:
- `src/ModInstaller.IPC.TypeScript/tsconfig.json` - Same strict config as native package
- `src/ModInstaller.IPC.TypeScript/vitest.config.ts` - Test path alias for mocking vortex-api and winapi-bindings (broken/native deps)
- `pnpm-workspace.yaml` - Defines monorepo structure and shared dependency catalog
- `@nexusmods/fomod-installer-native`:
- `@nexusmods/fomod-installer-ipc`:
## Package Publishing
- Package: `@nexusmods/fomod-installer-native` v0.13.0
- Publishes precompiled binaries via `prebuilds/` directory
- N-API version 8 compatibility for binary stability
- Distribution includes: dist/, prebuilds/, src-native/, binding.gyp
- Package: `@nexusmods/fomod-installer-ipc` v0.13.0
- Publishes TypeScript transpiled output only (dist/ directory)
## Architecture Overview
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Pascal case for class/interface files: `ModInstaller.ts`, `BaseIPCConnection.ts`, `NamedPipeTransport.ts`
- Kebab case for utilities and shared files: `cleanup-processes.ts`, `sharedTestData.ts`
- Index files: `index.ts` for barrel exports
- Type definition files: `index.ts` grouped in `types/` subdirectories
- Camel case for function names: `initialize()`, `tryInitialize()`, `findExecutable()`, `getExecutablePaths()`
- Static factory/utility functions use camel case: `testSupported()`, `setDefaultCallbacks()`
- Callback functions: Explicit naming with `Callback` suffix: `SelectCallback`, `ContinueCallback`, `CancelCallback`
- Private methods: Camel case with leading underscore discouraged; privacy enforced via `private` keyword
- Camel case for all variables and parameters: `connectionTimeout`, `testCase`, `archiveFiles`
- Constants in interfaces/types: Use full names, not SCREAMING_CASE (e.g., `SelectExactlyOne` not `SELECT_EXACTLY_ONE`)
- Type narrowing variables: `normalizedPath`, `normalizedDir`, `expectedNormalized`, `actualNormalized`
- Interfaces prefixed with `I`: `IModInstaller`, `ITransport`, `IFileSystem`, `IPlugin`, `IGroup`, `IInstallStep`, `IHeaderImage`
- Type aliases for callbacks: `SelectCallback`, `ContinueCallback`, `CancelCallback`
- Discriminated unions for type variants: `OrderType` ('AlphaAsc' | 'AlphaDesc' | 'Explicit'), `GroupType` ('SelectAtLeastOne' | 'SelectAtMostOne' | ...), `PluginType` ('Required' | 'Optional' | ...)
## Code Style
- TypeScript compiler configured via `tsconfig.json`
- No explicit Prettier/ESLint config detected; relies on TypeScript strict mode
- Indentation: 2 spaces (standard in package.json scripts and source files)
- Line length: No enforced limit, but single-line destructuring common in imports
- Semicolons: Always included (TypeScript default)
- Quotes: Single quotes in imports, double quotes in comments and strings where necessary
- TypeScript strict mode enabled: `"strict": true`
- `noUnusedParameters: true` — all function parameters must be used or prefixed with `_`
- `noImplicitReturns: true` — all code paths must explicitly return
- `noFallthroughCasesInSwitch: true` — switch cases must be exhaustive or explicit break
- `strictNullChecks: true` — null/undefined safety enforced
- `noUnusedLocals: false` — unused local variables allowed (not reported)
## Import Organization
- No path aliases configured; relative imports used throughout
- Barrel exports common in `types/index.ts` and main `index.ts` for re-exporting public API
- `src/index.ts` in Native module: Exports all public classes and types
- `src/types/index.ts`: Central type export point, re-exports all interface definitions
- `src/transport/index.ts`: Re-exports ITransport interface and concrete transports
## Error Handling
- Error collection with context: Collect errors in array before throwing aggregate (`BaseIPCConnection.initialize()` lines 170-224)
- Named error types: Custom error messages with semantic context (e.g., `error.name = 'ProcessError'`)
- Error propagation: Use `try/catch` with re-throw and enhancement, not silent failures
- Validation before operations: Check null/undefined explicitly (`if (!this.transport || !this.launcher)`)
- Error logging via framework: Use `log('error', message, context)` from vortex-api or console
## Logging
- Structured logging with context objects: `log('level', 'message', { key: value })`
- Log levels: `'info'`, `'warn'`, `'error'`, `'debug'`
- Process lifecycle events logged: initialization, strategy attempts, exit codes
- Data transformation logged: path normalization, callback registration
- Example in `BaseIPCConnection.ts` lines 177-180:
## Comments
- Complex algorithm logic: Path normalization with backslash/forward-slash conversions (ModInstaller.shared.spec.ts lines 112-126)
- Non-obvious design decisions: Why certain callbacks are structured (e.g., lines 15-26 in test file)
- Platform-specific workarounds: Windows path handling, process exit handling
- TODO comments: Not found in current codebase (encouraging preventive practices)
- Extensive inline documentation via JSDoc in `BaseIPCConnection.ts`:
## Function Design
- Utility functions: 3-10 lines (e.g., `normalizeInstruction()`)
- Initialization methods: 50-150 lines for complex setup (`tryInitialize()`)
- Test helpers: 20-40 lines
- Constructor injection pattern: Dependencies passed as parameters, not instantiated internally
- Callback functions: Parameters are named callbacks with full type signatures
- Options objects: Configuration passed as single object parameter to handle many options
- Example: `BaseIPCConnection` constructor (lines 119-133) takes strategies array, timeout number, and optional timeoutOptions
- Promises for async operations: `Promise<void>`, `Promise<T | null>`, `Promise<{ key: type }[]>`
- Object destructuring in returns: Return structured objects with named fields for clarity
- Nullable returns: `InstallResult | null` for operations that may not produce results
- Type narrowing: Return discriminated unions for different success/failure states
## Module Design
- Public classes exported at module level: `export class ClassName`
- Re-export pattern in barrel files: `export * from './module'`
- Type-only exports: `export interface ISomething`, `export type CallbackType = (...) => void`
- Named exports preferred over default exports (only found in vitest config)
- `src/index.ts` in Native module (lines 1-10):
- Allows consumers to import: `import { NativeModInstaller, types } from '@nexusmods/fomod-installer-native'`
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Language separation: .NET core logic in C#, Node.js wrappers in TypeScript
- Transport abstraction: Pluggable transports (TCP, Named Pipes) for IPC communication
- Security-aware process launching: Multiple security levels (regular, sandboxed)
- Modular script execution: Separate interpreters for XML 1.0-5.0 and C# scripts
- Framework-agnostic abstractions: Base classes designed for extension into different frameworks (Vortex, etc.)
## Layers
- Purpose: Define the contract for FOMOD installation, scripting, and UI interactions
- Location: `src/FomodInstaller.Interface/`
- Contains: Base installer classes (`BaseInstaller.cs`), scripting interfaces (`IScript.cs`, `IScriptExecutor.cs`), UI delegates (`UIDelegates.cs`), data structures (`Instruction.cs`, `ArchiveStructure.cs`)
- Depends on: .NET BCL, scripting abstractions
- Used by: All adaptor and execution layers
- Purpose: Parse and execute FOMOD install scripts in different languages
- Location: `src/InstallScripting/`
- Contains:
- Depends on: Core interfaces, ANTLR utilities (XML parsing)
- Used by: Adaptor layers
- Purpose: Provide ANTLR 3 parsing helpers for XML script parsing
- Location: `src/AntlrUtil/`
- Contains: Parser generator utilities
- Depends on: ANTLR runtime
- Used by: XmlScript interpreter
- Purpose: Shared .NET utilities (collections, extensions)
- Location: `src/Utils/`
- Contains: Reusable collection types and extension methods
- Depends on: .NET BCL
- Used by: All .NET layers
- Purpose: Adapt the core interfaces for different deployment scenarios
- Location: `src/ModInstaller.Adaptor.Dynamic/` and `src/ModInstaller.Adaptor.Typed/`
- Dynamic adaptor: Full feature set including C# script execution
- Typed adaptor: Lightweight variant (XML scripts only)
- Depends on: Core interfaces, script execution layers
- Used by: IPC server, native executable
- Purpose: Establish and manage inter-process communication
- Location: `src/ModInstaller.IPC.TypeScript/src/transport/`
- Contains:
- Depends on: Node.js net module, Windows API bindings (optional)
- Used by: IPC connection manager
- Purpose: Launch child processes with configurable security levels
- Location: `src/ModInstaller.IPC.TypeScript/src/launchers/`
- Contains:
- Depends on: Node.js child_process
- Used by: IPC connection manager
- Purpose: Orchestrate IPC communication lifecycle with strategy pattern
- Location: `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts`
- Contains: Message serialization/deserialization, request/response routing, callback delegation, timeout handling
- Depends on: Transport, launcher, vortex-api
- Used by: Framework adapters extending BaseIPCConnection
- Purpose: Wrap native AOT compiled shared library for Node.js consumption
- Location: `src/ModInstaller.Native.TypeScript/src/`
- Contains:
- Depends on: node-gyp-build, N-API (ABI 8)
- Used by: Vortex extension or direct consumers
- Purpose: Spawn as separate process, communicate via IPC
- Location: `src/ModInstaller.IPC/`
- Contains: ModInstallerIPC.exe entry point
- Depends on: Adaptor layer (dynamic)
- Used by: IPC connection from Node.js
- Purpose: Compile to native AOT for direct N-API binding
- Location: `src/ModInstaller.Native/`
- Contains: Native AOT entry points, delegate marshaling
- Depends on: Adaptor layer (typed, XML only)
- Used by: N-API bindings from Node.js
## Data Flow
```
```
- **IPC Connection State:** Tracked in `BaseIPCConnection` private fields (process, transport, launcher, currentStrategyIndex, disposed)
- **Pending Requests:** Map of message IDs to `AwaitingPromise` objects (resolve, reject, timeout)
- **Callback Registry:** Map of callback IDs to `DelegateCallback` functions
- **UI State:** Maintained by calling framework (Vortex); installer only invokes callbacks
## Key Abstractions
- Purpose: Abstract communication channel for IPC
- Examples: `TCPTransport` (cross-platform), `NamedPipeTransport` (Windows-only)
- Pattern: Strategy pattern — connection selects best transport for platform
- Key methods: `initialize()`, `createServers()`, `sendMessage()`, `startReceiving()`, `waitForConnection()`
- Responsibility: Manage encoding/decoding, connection establishment, message delimiting
- Purpose: Abstract process spawning with security levels
- Examples: `RegularProcessLauncher` (unrestricted), `SandboxProcessLauncher` (restricted)
- Pattern: Strategy pattern — connection selects launcher based on security requirements
- Key methods: `launch()`, `cleanup()`, `grantAdditionalAccess()`
- Responsibility: Spawn child process with appropriate isolation and permissions
- Purpose: Pair transport + launcher for a specific platform/security configuration
- Pattern: Strategy object containing transport and launcher
- Responsibility: Enable fallback chains (try TCP, fall back to named pipe, etc.)
- Purpose: Framework-agnostic IPC orchestration
- Responsibilities:
- Designed for extension: Framework (Vortex) extends with concrete logging, file system, UI callbacks
- `NativeModInstaller`: Public wrapper
- `types.ModInstaller` (native): N-API-bound interface
- Pattern: Adapter pattern — wraps native extension with TypeScript interface
## Entry Points
- Location: `src/ModInstaller.IPC.TypeScript/src/index.ts`
- Primary exports:
- Usage: Framework (e.g., Vortex) extends `BaseIPCConnection`, provides logging/UI/file system implementations
- Location: `src/ModInstaller.Native.TypeScript/src/index.ts`
- Primary exports:
- Entry point: Constructor takes callback functions (pluginsGetAll, UI callbacks, etc.), returns installer instance
- Usage: Direct instantiation, call `.install()` method
- Location: `src/ModInstaller.IPC/` compiles to `ModInstallerIPC.exe`
- Launched by: TypeScript IPC connection when full-featured mode needed
- Responsibilities: Listen on transport (TCP/named pipe), execute commands via dynamic adaptor
- Location: `src/ModInstaller.Native/` compiles to `ModInstaller.Native.dll/so`
- Bound by: N-API from TypeScript
- Prebuilds: Platform-specific binaries (win-x64, linux-x64) in `prebuilds/` directory
## Error Handling
- **Transport-level**: `TransportError` wraps platform errors (socket, pipe) with context
- **IPC-level**: Message errors serialized in JSON response, deserialized to Error on consumer side
- **Process-level**: Process death triggers connection cleanup; strategies retry with next transport/launcher
- **Script-level**: Script execution errors returned as error response in IPC message
- **Timeout-level**: `TimeoutOptions.onTimeoutDialog` allows user to continue or cancel; repeated timeouts eventually fail
- Exceptions caught and converted to error objects for IPC transmission
- Connection strategies allow graceful degradation (TCP fails → try named pipe)
- Timeout dialog system prevents silent hangs
- Cleanup handlers ensure resources released on any error path
## Cross-Cutting Concerns
- IPC: Delegates to `vortex-api` logger (Vortex-specific)
- Native: Implements `ILogger` interface (caller-provided at construction)
- Pattern: Abstract interface, framework provides implementation
- Input validation in IPC message handlers (file paths, command types)
- Archive structure validation in .NET adaptor layer
- Script syntax validation by XML/C# parsers
- Security levels control process isolation (SecurityLevel enum)
- File system access controlled by launcher (SandboxProcessLauncher restricts paths)
- Callback security: UI callbacks always invoked by IPC layer (no direct .NET-consumer communication)
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
