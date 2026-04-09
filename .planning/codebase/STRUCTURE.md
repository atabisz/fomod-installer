# Codebase Structure

**Analysis Date:** 2026-04-09

## Directory Layout

```
fomod-installer/
├── src/                                    # Source code (C# and TypeScript)
│   ├── FomodInstaller.Interface/           # Core interfaces and data types
│   ├── InstallScripting/                   # Script execution engines
│   │   ├── Scripting/                      # Base abstractions
│   │   ├── XmlScript/                      # XML 1.0-5.0 interpreter
│   │   ├── CSharpScript/                   # C# script executor
│   │   └── omod/                           # Legacy OMOD format support
│   ├── Utils/                              # Shared .NET utilities
│   ├── AntlrUtil/                          # XML parser helpers
│   ├── ModInstaller.Adaptor.Dynamic/       # Full-featured adaptor (XML + C#)
│   ├── ModInstaller.Adaptor.Typed/         # Lightweight adaptor (XML only)
│   ├── ModInstaller.IPC/                   # IPC server executable (.NET)
│   ├── ModInstaller.IPC.TypeScript/        # IPC npm package (@nexusmods/fomod-installer-ipc)
│   │   ├── src/
│   │   │   ├── BaseIPCConnection.ts        # Core IPC orchestration
│   │   │   ├── transport/                  # Transport implementations (TCP, pipes)
│   │   │   ├── launchers/                  # Process launchers (regular, sandboxed)
│   │   │   ├── cleanup-processes.ts        # Process cleanup utilities
│   │   │   └── index.ts                    # Public exports
│   │   ├── test/                           # Integration tests
│   │   └── package.json                    # Package metadata
│   ├── ModInstaller.Native/                # Native AOT shared library
│   │   ├── Delegates/                      # N-API delegate marshaling
│   │   ├── Extensions/                     # N-API extension helpers
│   │   └── ModInstaller.Native.csproj      # Native AOT project
│   └── ModInstaller.Native.TypeScript/     # Native npm package (@nexusmods/fomod-installer-native)
│       ├── src/
│       │   ├── ModInstaller.ts             # Main wrapper class
│       │   ├── Common.ts                   # Common types and error handling
│       │   ├── FileSystem.ts               # File system interface
│       │   ├── Logger.ts                   # Logging interface
│       │   ├── resolve-native.ts           # Platform-specific binary loader
│       │   ├── types/                      # TypeScript type definitions
│       │   └── index.ts                    # Public exports
│       ├── src-native/                     # N-API bindings (C++ generated)
│       ├── prebuilds/                      # Precompiled platform binaries
│       ├── test/                           # Tests
│       ├── package.json                    # Package metadata
│       ├── binding.gyp                     # node-gyp configuration
│       └── install.js                      # Binary installation script
├── test/                                   # Test projects (.NET and shared test data)
│   ├── ModInstaller.IPC.Tests/             # IPC integration tests
│   ├── ModInstaller.Native.Tests/          # Native binding tests
│   ├── ModInstaller.Adaptor.Typed.Tests/   # XML-only adaptor tests
│   ├── ModInstaller.Adaptor.Dynamic.Tests/ # Full adaptor tests
│   ├── Utils.Tests/                        # Utility library tests
│   ├── TestData/                           # FOMOD archives and test cases
│   └── ModInstaller.Adaptor.Tests.Shared/  # Shared test utilities
├── FomodInstaller.sln                      # Visual Studio solution
├── pnpm-workspace.yaml                     # pnpm workspace configuration
├── pnpm-lock.yaml                          # pnpm lockfile
├── global.json                             # .NET SDK version pin
├── package.json                            # Root workspace package
├── README.md                               # Project overview
├── LICENSE.md                              # GPL-3.0 license
└── .planning/                              # Planning and documentation
    └── codebase/                           # Architecture documentation

```

## Directory Purposes

**Core Interfaces (.NET C#):**
- `src/FomodInstaller.Interface/`
- Purpose: Define the FOMOD installation contract, scripting system, and UI integration points
- Contains: Base classes, interfaces, and data transfer objects
- Key files:
  - `ModInstaller/BaseInstaller.cs` - Abstract base for all installers
  - `ModInstaller/IInstaller.cs` - Public interface contract
  - `Scripting/IScript.cs` - Script abstraction
  - `Scripting/IScriptExecutor.cs` - Execution engine contract
  - `ModInstaller/UIDelegates.cs` - UI callback function signatures
  - `ModInstaller/ui/InstallerStep.cs`, `Group.cs`, `Option.cs` - UI data structures

**Script Execution (.NET C#):**
- `src/InstallScripting/Scripting/` - Base abstractions (ScriptExecutorBase, IScript, IScriptType)
- `src/InstallScripting/XmlScript/` - XML interpreter for FOMOD versions 1.0-5.0
- `src/InstallScripting/CSharpScript/` - C# dynamic script compilation and execution
- `src/InstallScripting/omod/` - Legacy OMOD format support
- Purpose: Parse and execute install logic defined by mod authors

**Adaptors (.NET C#):**
- `src/ModInstaller.Adaptor.Dynamic/` - Combines all script engines (XML + C#)
- `src/ModInstaller.Adaptor.Typed/` - XML-only lightweight variant
- Purpose: Instantiate BaseInstaller with appropriate script engines for the deployment scenario
- Pattern: Factory pattern selecting engines based on feature requirements

**IPC Transport & Process Management (TypeScript):**
- `src/ModInstaller.IPC.TypeScript/src/transport/`
  - `ITransport.ts` - Interface (TCP, named pipes, experimental: websockets)
  - `TCPTransport.ts` - Cross-platform TCP socket implementation
  - `NamedPipeTransport.ts` - Windows-only named pipe implementation
  - Purpose: Abstract communication channel
  - Responsibility: Message framing (delimiter-based), connection setup, error recovery

- `src/ModInstaller.IPC.TypeScript/src/launchers/`
  - `IProcessLauncher.ts` - Process spawning interface
  - `RegularProcessLauncher.ts` - Standard spawn (no isolation)
  - `SandboxProcessLauncher.ts` - Restricted spawn via RunInContainer
  - `SecurityLevel.ts` - Enum: SecurityLevel.None, SecurityLevel.Low, SecurityLevel.High
  - Purpose: Abstract process spawning with configurable isolation

**IPC Connection Management (TypeScript):**
- `src/ModInstaller.IPC.TypeScript/src/BaseIPCConnection.ts`
- Purpose: Orchestrate message exchange, callbacks, timeouts, strategy fallback
- Responsibilities:
  - Serialize/deserialize JSON messages
  - Match request IDs to responses
  - Route callbacks to registered handlers
  - Manage process lifecycle
  - Handle timeouts with optional user dialog
  - Implement strategy fallback (try TCP → fall back to named pipe)

**Native Binding (TypeScript/N-API):**
- `src/ModInstaller.Native.TypeScript/src/`
  - `ModInstaller.ts` - Main class (constructor takes callbacks, provides install method)
  - `types/` - TypeScript interface definitions
  - `resolve-native.ts` - Dynamic loading of prebuilt binaries
  - `Common.ts`, `FileSystem.ts`, `Logger.ts` - Interface implementations
- Purpose: Wrap native AOT compiled .NET library for Node.js
- Responsibility: N-API marshaling, callback adaptation

## Key File Locations

**Entry Points:**
- `src/ModInstaller.IPC.TypeScript/src/index.ts` - IPC package entry; exports BaseIPCConnection, transports, launchers
- `src/ModInstaller.Native.TypeScript/src/index.ts` - Native package entry; exports NativeModInstaller, types
- `src/ModInstaller.IPC/Program.cs` - IPC server entry point (spawned as separate process)

**Configuration:**
- `.NET`: `FomodInstaller.sln` - Visual Studio solution; `global.json` - SDK version (9.0)
- `TypeScript`: `pnpm-workspace.yaml` - Workspace config (2 packages); `tsconfig.json` - Compiler settings
- `Build`: `src/ModInstaller.IPC.TypeScript/build.js`, `src/ModInstaller.Native.TypeScript/build.js` - Custom build scripts

**Core Logic:**
- `src/InstallScripting/XmlScript/` - FOMOD XML parser and interpreter
- `src/InstallScripting/CSharpScript/CSharpScriptExecutor.cs` - C# compilation and execution
- `src/FomodInstaller.Interface/ModInstaller/BaseInstaller.cs` - Central installation coordinator

**Testing:**
- `test/ModInstaller.IPC.Tests/` - IPC integration tests (.NET)
- `src/ModInstaller.IPC.TypeScript/test/ModInstaller.ipc.spec.ts` - TypeScript IPC tests (vitest)
- `src/ModInstaller.Native.TypeScript/test/ModInstaller.shared.spec.ts` - Native binding tests
- `test/TestData/` - FOMOD test archives and metadata

**Types & Interfaces:**
- `src/FomodInstaller.Interface/Scripting/` - Scripting abstractions
- `src/ModInstaller.IPC.TypeScript/src/transport/ITransport.ts` - Transport contract
- `src/ModInstaller.IPC.TypeScript/src/launchers/IProcessLauncher.ts` - Launcher contract
- `src/ModInstaller.Native.TypeScript/src/types/` - Native binding types

**Utilities:**
- `src/Utils/` - .NET collection types and extensions
- `src/AntlrUtil/` - ANTLR parser helpers
- `src/ModInstaller.IPC.TypeScript/src/cleanup-processes.ts` - Node process cleanup

## Naming Conventions

**Directories:**
- Pascal case for .NET projects: `FomodInstaller.Interface`, `ModInstaller.IPC.TypeScript`
- Lowercase with hyphens for npm scopes: `@nexusmods/fomod-installer-ipc`
- Functional grouping: `src/InstallScripting/{XmlScript,CSharpScript}` groups related implementations

**Files (.NET C#):**
- Pascal case matching class name: `BaseInstaller.cs` contains `class BaseInstaller`
- Interfaces prefixed with `I`: `IInstaller.cs`, `IScript.cs`, `IScriptExecutor.cs`
- Delegates grouped in `*Delegates.cs`: `UIDelegates.cs`, `CoreDelegates.cs`
- Generic plural for collections: `GroupList.cs` contains `class GroupList`

**Files (TypeScript):**
- Camel case for implementation: `BaseIPCConnection.ts`, `TCPTransport.ts`
- Pascal case for interfaces: `ITransport.ts`, `IProcessLauncher.ts`
- Index files export public API: `index.ts` in each package/module
- Config files lowercase with dots: `tsconfig.json`, `vitest.config.ts`

**Exports:**
- Namespace-style (domain-driven): `transport/index.ts` exports all transports together
- Interface-implementation pairs: `ITransport` interface, `TCPTransport` + `NamedPipeTransport` implementations
- Barrel exports: `src/ModInstaller.IPC.TypeScript/src/index.ts` exports main classes and all sub-modules

## Where to Add New Code

**New FOMOD Script Type (XML variants, OMOD updates):**
- Create new directory under `src/InstallScripting/{NewScriptType}/`
- Implement `IScript` and `IScriptType` interfaces from `Scripting/`
- Register in appropriate adaptor: `ModInstaller.Adaptor.Dynamic.csproj`
- Add tests in `test/ModInstaller.Adaptor.Dynamic.Tests/`

**New Transport Mechanism (websockets, SSH, etc.):**
- Create `{TransportType}Transport.ts` in `src/ModInstaller.IPC.TypeScript/src/transport/`
- Implement `ITransport` interface
- Add `{TransportType}` to `TransportType` enum
- Export from `transport/index.ts`
- Add integration test to `src/ModInstaller.IPC.TypeScript/test/ModInstaller.ipc.spec.ts`

**New Process Launcher (Docker, remote, etc.):**
- Create `{LauncherType}ProcessLauncher.ts` in `src/ModInstaller.IPC.TypeScript/src/launchers/`
- Implement `IProcessLauncher` interface
- Add security level to `SecurityLevel.ts` enum
- Export from `launchers/index.ts`
- Add test coverage

**New Framework Integration (Proton, WinePrefix Manager, etc.):**
- Extend `BaseIPCConnection` class (from `@nexusmods/fomod-installer-ipc` or direct TypeScript import)
- Override abstract methods: `log()`, `fileExists()`, `getExecutablePaths()`
- Implement framework-specific UI callbacks
- Add framework-specific methods as needed

**New Utility (.NET):**
- Add to `src/Utils/Collections/` for collection types or `src/Utils/` for general utilities
- Add unit tests to `test/Utils.Tests/`

**New Test Data:**
- Add FOMOD archives to `test/TestData/` organized by test scenario
- Update `test/ModInstaller.Adaptor.Tests.Shared/` with test case metadata
- Reference from test files via `getAllTestCases()` helper

## Special Directories

**Build Output:**
- `src/*/bin/`, `src/*/obj/` - .NET build artifacts (generated, not committed)
- `src/ModInstaller.IPC.TypeScript/dist/`, `src/ModInstaller.Native.TypeScript/dist/` - TypeScript compiled output
- `src/ModInstaller.Native.TypeScript/prebuilds/` - Precompiled N-API binaries (win-x64, linux-x64, committed)

**Platform-Specific:**
- `src/ModInstaller.Native.TypeScript/prebuilds/*/` - Architecture-specific binaries for N-API binding
- `src/ModInstaller.IPC.TypeScript/src/launchers/SandboxProcessLauncher.ts` - Windows-specific sandboxing logic

**Configuration & Build:**
- `pnpm-workspace.yaml` - Defines 2 workspace packages (IPC, Native TypeScript packages)
- `FomodInstaller.sln` - All .NET projects
- `global.json` - Pins .NET SDK to version 9.0
- `.editorconfig` - Shared formatting rules

---

*Structure analysis: 2026-04-09*
