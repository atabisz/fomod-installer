# Architecture

**Analysis Date:** 2026-04-09

## Pattern Overview

**Overall:** Dual-stack hybrid architecture with language/technology separation

The FOMOD Installer is designed to provide two complementary processing paths for FOMOD (Fallout Mod Organizer) archives:
1. **Full-featured path** (.NET-based via IPC) supporting XML and C# scripts
2. **Lightweight path** (Native AOT shared library via N-API) supporting XML scripts only

**Key Characteristics:**
- Language separation: .NET core logic in C#, Node.js wrappers in TypeScript
- Transport abstraction: Pluggable transports (TCP, Named Pipes) for IPC communication
- Security-aware process launching: Multiple security levels (regular, sandboxed)
- Modular script execution: Separate interpreters for XML 1.0-5.0 and C# scripts
- Framework-agnostic abstractions: Base classes designed for extension into different frameworks (Vortex, etc.)

## Layers

**Core Interfaces (.NET):**
- Purpose: Define the contract for FOMOD installation, scripting, and UI interactions
- Location: `src/FomodInstaller.Interface/`
- Contains: Base installer classes (`BaseInstaller.cs`), scripting interfaces (`IScript.cs`, `IScriptExecutor.cs`), UI delegates (`UIDelegates.cs`), data structures (`Instruction.cs`, `ArchiveStructure.cs`)
- Depends on: .NET BCL, scripting abstractions
- Used by: All adaptor and execution layers

**Script Execution Layer (.NET):**
- Purpose: Parse and execute FOMOD install scripts in different languages
- Location: `src/InstallScripting/`
- Contains:
  - `Scripting/` - Base script abstractions and execution framework
  - `XmlScript/` - XML-based FOMOD script interpreter (versions 1.0-5.0)
  - `CSharpScript/` - C# script execution environment
  - `omod/` - OMOD (old mod format) support
- Depends on: Core interfaces, ANTLR utilities (XML parsing)
- Used by: Adaptor layers

**ANTLR Parser Utilities (.NET):**
- Purpose: Provide ANTLR 3 parsing helpers for XML script parsing
- Location: `src/AntlrUtil/`
- Contains: Parser generator utilities
- Depends on: ANTLR runtime
- Used by: XmlScript interpreter

**Utility Library (.NET):**
- Purpose: Shared .NET utilities (collections, extensions)
- Location: `src/Utils/`
- Contains: Reusable collection types and extension methods
- Depends on: .NET BCL
- Used by: All .NET layers

**Adaptor Layer (.NET):**
- Purpose: Adapt the core interfaces for different deployment scenarios
- Location: `src/ModInstaller.Adaptor.Dynamic/` and `src/ModInstaller.Adaptor.Typed/`
- Dynamic adaptor: Full feature set including C# script execution
- Typed adaptor: Lightweight variant (XML scripts only)
- Depends on: Core interfaces, script execution layers
- Used by: IPC server, native executable

**IPC Transport Layer (TypeScript):**
- Purpose: Establish and manage inter-process communication
- Location: `src/ModInstaller.IPC.TypeScript/src/transport/`
- Contains:
  - `ITransport.ts` - Transport interface defining protocol (TCP, Named Pipes)
  - `TCPTransport.ts` - TCP socket implementation
  - `NamedPipeTransport.ts` - Windows named pipe implementation
- Depends on: Node.js net module, Windows API bindings (optional)
- Used by: IPC connection manager

**Process Launcher Layer (TypeScript):**
- Purpose: Launch child processes with configurable security levels
- Location: `src/ModInstaller.IPC.TypeScript/src/launchers/`
- Contains:
  - `IProcessLauncher.ts` - Launcher interface
  - `RegularProcessLauncher.ts` - Standard spawning
  - `SandboxProcessLauncher.ts` - Sandboxed execution via RunInContainer
  - `SecurityLevel.ts` - Security level enumeration
- Depends on: Node.js child_process
- Used by: IPC connection manager

**IPC Connection Manager (TypeScript):**
- Purpose: Orchestrate IPC communication lifecycle with strategy pattern
- Location: `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts`
- Contains: Message serialization/deserialization, request/response routing, callback delegation, timeout handling
- Depends on: Transport, launcher, vortex-api
- Used by: Framework adapters extending BaseIPCConnection

**Native Binding Layer (TypeScript/N-API):**
- Purpose: Wrap native AOT compiled shared library for Node.js consumption
- Location: `src/ModInstaller.Native.TypeScript/src/`
- Contains:
  - `ModInstaller.ts` - Main wrapper class
  - `Common.ts` - Common types and error handling
  - `FileSystem.ts` - File system interface
  - `Logger.ts` - Logging interface
  - `resolve-native.ts` - Dynamic loading of platform-specific binaries
- Depends on: node-gyp-build, N-API (ABI 8)
- Used by: Vortex extension or direct consumers

**IPC Server (.NET):**
- Purpose: Spawn as separate process, communicate via IPC
- Location: `src/ModInstaller.IPC/`
- Contains: ModInstallerIPC.exe entry point
- Depends on: Adaptor layer (dynamic)
- Used by: IPC connection from Node.js

**Native Shared Library (.NET):**
- Purpose: Compile to native AOT for direct N-API binding
- Location: `src/ModInstaller.Native/`
- Contains: Native AOT entry points, delegate marshaling
- Depends on: Adaptor layer (typed, XML only)
- Used by: N-API bindings from Node.js

## Data Flow

**IPC-based Installation (Full-featured):**

1. TypeScript consumer calls `BaseIPCConnection.install(files, scriptPath, ...)`
2. Connection selects `ConnectionStrategy` (transport + launcher pair)
3. `IProcessLauncher` spawns `ModInstallerIPC.exe` with arguments from transport
4. `ITransport.initialize()` sets up connection listener (TCP port or named pipe)
5. `ITransport.readHandshake()` waits for "connected" message from .NET process
6. JSON-serialized install request sent via transport
7. .NET adaptor parses FOMOD metadata and script
8. Script executor (XML or C#) evaluates install steps
9. During execution, .NET calls back UI delegates (selectCallback, continueCallback, cancelCallback)
10. TypeScript `BaseIPCConnection.callbacks` map routes incoming callbacks to registered handlers
11. User makes selections, TypeScript returns decision via callback response
12. .NET completes installation, returns file list and instructions
13. TypeScript resolves promise with install result

**Native-based Installation (XML only, lightweight):**

1. TypeScript consumer calls `NativeModInstaller.install(files, scriptPath, ...)`
2. Calls registered N-API entry point in native AOT compiled library
3. Native library uses XML interpreter directly (no C# support)
4. Native library invokes UI callbacks provided at construction
5. Returns install result directly (same process, no IPC overhead)

**Message Protocol (.NET ↔ TypeScript):**

```
Message Format: JSON objects delimited by \uFFFF

Request:
{
  id: "unique-msg-id",
  payload: {
    command: "Install" | "TestSupported",
    files: [...],
    scriptPath: "...",
    ...
  }
}

Response:
{
  id: "matching-msg-id",
  data: { ... result ... }
}

or

{
  id: "matching-msg-id",
  error: {
    message: "...",
    stack: "...",
    name: "..."
  }
}

Callback (from .NET):
{
  id: "callback-msg-id",
  callback: {
    id: "original-request-id",
    type: "OnSelectOption" | "OnContinue" | "OnCancel"
  },
  data: [... arguments ...]
}
```

**State Management:**

- **IPC Connection State:** Tracked in `BaseIPCConnection` private fields (process, transport, launcher, currentStrategyIndex, disposed)
- **Pending Requests:** Map of message IDs to `AwaitingPromise` objects (resolve, reject, timeout)
- **Callback Registry:** Map of callback IDs to `DelegateCallback` functions
- **UI State:** Maintained by calling framework (Vortex); installer only invokes callbacks

## Key Abstractions

**ITransport Interface:**
- Purpose: Abstract communication channel for IPC
- Examples: `TCPTransport` (cross-platform), `NamedPipeTransport` (Windows-only)
- Pattern: Strategy pattern — connection selects best transport for platform
- Key methods: `initialize()`, `createServers()`, `sendMessage()`, `startReceiving()`, `waitForConnection()`
- Responsibility: Manage encoding/decoding, connection establishment, message delimiting

**IProcessLauncher Interface:**
- Purpose: Abstract process spawning with security levels
- Examples: `RegularProcessLauncher` (unrestricted), `SandboxProcessLauncher` (restricted)
- Pattern: Strategy pattern — connection selects launcher based on security requirements
- Key methods: `launch()`, `cleanup()`, `grantAdditionalAccess()`
- Responsibility: Spawn child process with appropriate isolation and permissions

**ConnectionStrategy:**
- Purpose: Pair transport + launcher for a specific platform/security configuration
- Pattern: Strategy object containing transport and launcher
- Responsibility: Enable fallback chains (try TCP, fall back to named pipe, etc.)

**BaseIPCConnection (Abstract):**
- Purpose: Framework-agnostic IPC orchestration
- Responsibilities:
  - Message routing and correlation
  - Request/response pairing
  - Callback delegation
  - Timeout handling with user dialogs
  - Process lifecycle management
  - Strategy fallback logic
- Designed for extension: Framework (Vortex) extends with concrete logging, file system, UI callbacks

**ModInstaller Type Hierarchy (TypeScript Native):**
- `NativeModInstaller`: Public wrapper
- `types.ModInstaller` (native): N-API-bound interface
- Pattern: Adapter pattern — wraps native extension with TypeScript interface

## Entry Points

**IPC Package (`@nexusmods/fomod-installer-ipc`):**
- Location: `src/ModInstaller.IPC.TypeScript/src/index.ts`
- Primary exports:
  - `BaseIPCConnection` - Abstract class for framework extension
  - `ConnectionStrategy`, `TimeoutOptions` - Configuration types
  - `ITransport`, `TCPTransport`, `NamedPipeTransport` - Transport mechanisms
  - `IProcessLauncher`, `RegularProcessLauncher`, `SandboxProcessLauncher`, `SecurityLevel` - Process launching
- Usage: Framework (e.g., Vortex) extends `BaseIPCConnection`, provides logging/UI/file system implementations

**Native Package (`@nexusmods/fomod-installer-native`):**
- Location: `src/ModInstaller.Native.TypeScript/src/index.ts`
- Primary exports:
  - `NativeModInstaller` - Main installer class
  - `types` - Type definitions including `ModInstaller`, `InstallResult`, `FileSystem`, `Logger`
- Entry point: Constructor takes callback functions (pluginsGetAll, UI callbacks, etc.), returns installer instance
- Usage: Direct instantiation, call `.install()` method

**IPC Server Executable:**
- Location: `src/ModInstaller.IPC/` compiles to `ModInstallerIPC.exe`
- Launched by: TypeScript IPC connection when full-featured mode needed
- Responsibilities: Listen on transport (TCP/named pipe), execute commands via dynamic adaptor

**Native Shared Library:**
- Location: `src/ModInstaller.Native/` compiles to `ModInstaller.Native.dll/so`
- Bound by: N-API from TypeScript
- Prebuilds: Platform-specific binaries (win-x64, linux-x64) in `prebuilds/` directory

## Error Handling

**Strategy:** Multi-level error propagation with recovery

- **Transport-level**: `TransportError` wraps platform errors (socket, pipe) with context
- **IPC-level**: Message errors serialized in JSON response, deserialized to Error on consumer side
- **Process-level**: Process death triggers connection cleanup; strategies retry with next transport/launcher
- **Script-level**: Script execution errors returned as error response in IPC message
- **Timeout-level**: `TimeoutOptions.onTimeoutDialog` allows user to continue or cancel; repeated timeouts eventually fail

**Patterns:**
- Exceptions caught and converted to error objects for IPC transmission
- Connection strategies allow graceful degradation (TCP fails → try named pipe)
- Timeout dialog system prevents silent hangs
- Cleanup handlers ensure resources released on any error path

## Cross-Cutting Concerns

**Logging:** 
- IPC: Delegates to `vortex-api` logger (Vortex-specific)
- Native: Implements `ILogger` interface (caller-provided at construction)
- Pattern: Abstract interface, framework provides implementation

**Validation:** 
- Input validation in IPC message handlers (file paths, command types)
- Archive structure validation in .NET adaptor layer
- Script syntax validation by XML/C# parsers

**Authentication/Authorization:**
- Security levels control process isolation (SecurityLevel enum)
- File system access controlled by launcher (SandboxProcessLauncher restricts paths)
- Callback security: UI callbacks always invoked by IPC layer (no direct .NET-consumer communication)

---

*Architecture analysis: 2026-04-09*
