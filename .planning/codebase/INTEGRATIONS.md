# External Integrations

**Analysis Date:** 2026-04-09

## Primary Integration: Vortex API

**Vortex Mod Manager:**
- SDK/Client: vortex-api (Nexus-Mods/vortex-api)
- Version: 1.16.4
- Usage: Logging framework and utilities
- Location: Imported in `src/ModInstaller.IPC.TypeScript/src/transport/TCPTransport.ts`, `src/ModInstaller.IPC.TypeScript/src/transport/NamedPipeTransport.ts`, `src/ModInstaller.IPC.TypeScript/src/launchers/RegularProcessLauncher.ts`, `src/ModInstaller.IPC.TypeScript/src/launchers/SandboxProcessLauncher.ts`
- Log Method: `log(level, message, metadata)` - used for debug, info, error level logging

**Note:** vortex-api is a git dependency with broken exports, requiring test-time aliasing in `src/ModInstaller.IPC.TypeScript/vitest.config.ts` to mock `vortex-api` for test execution.

## Windows Platform Integration

**Windows API Bindings:**
- Package: winapi-bindings (Nexus-Mods/node-winapi-bindings)
- Version: 2.7.3
- Usage: Windows-specific security level implementation and sandbox process launching
- Location: `src/ModInstaller.IPC.TypeScript/src/launchers/SecurityLevel.ts` (dynamic require), `src/ModInstaller.IPC.TypeScript/src/launchers/SandboxProcessLauncher.ts` (static import)
- Platform: Windows only (checked at runtime: `if (process.platform === 'win32')`)

**Note:** winapi-bindings requires native builds and is mocked during testing via `src/ModInstaller.IPC.TypeScript/test/__mocks__/winapi-bindings.ts`.

## Archive/Compression Integration

**7-Zip Utilities:**
- Package: node-7z 3.0.0 (command wrapper)
- Package: 7zip-bin 5.2.0 (precompiled binaries)
- Usage: ZIP/7z archive extraction for FOMOD mod packages
- Purpose: Enables reading FOMOD archives which are typically ZIP-compressed format

## Scripting/Parsing Integration

**ANTLR 3 Parser:**
- Location: `/home/alex/src/fomod-installer/lib/Antlr/` (precompiled libraries)
- Usage: XML-based FOMOD script version parsing (v1.0-5.0)
- Purpose: Parses modular configuration options in XML format

## Inter-Process Communication (IPC) Integrations

**Transport Layer Abstraction:**

Located in `src/ModInstaller.IPC.TypeScript/src/transport/`:

1. **TCP Transport** (`TCPTransport.ts`):
   - Protocol: localhost TCP sockets
   - Uses: Node.js `net` module
   - Handshake: "connected" message delimiter
   - Message delimiter: Unicode U+FFFF character
   - Ports: Dynamic, random available port
   - Platform: Cross-platform (Windows, Linux, macOS)
   - Features:
     - Configurable timeout windows (60-120s for tests)
     - Encoded message delimiter handling
     - Error and close event listeners

2. **Named Pipe Transport** (`NamedPipeTransport.ts`):
   - Protocol: Windows named pipes (Windows-only)
   - Uses: Node.js `net` module with `\\.\pipe\` paths
   - Architecture: Dual-pipe (separate outbound and inbound pipes)
     - Outbound: `{pipeId}` (Node writes, C# reads)
     - Inbound: `{pipeId}_reply` (C# writes, Node reads)
   - Platform: Windows only (`process.platform === 'win32'`)
   - Message delimiter: Unicode U+FFFF character (same as TCP)
   - Advantages: Kernel IPC, no firewall blocking, Windows ACL permissions

**Process Launching:**

Located in `src/ModInstaller.IPC.TypeScript/src/launchers/`:

1. **RegularProcessLauncher.ts**:
   - Spawns child ModInstallerIPC.exe processes
   - Uses Vortex logging via vortex-api

2. **SandboxProcessLauncher.ts**:
   - Windows-specific sandbox isolation
   - Integrates with winapi-bindings for security level handling
   - Provides restricted execution environment

**Security Levels** (`SecurityLevel.ts`):
- Enum-based system for process isolation levels
- Uses winapi-bindings dynamic require for Windows API calls

## .NET/C# Backend Integration

**ModInstaller.IPC Executable:**
- Type: .NET executable built from `src/ModInstaller.IPC/`
- Communication: stdin/stdout OR TCP/named pipes (IPC)
- Protocol: JSON-based messaging (inferred from IPC handshake "connected")
- Modes:
  - Full feature set: All FOMOD script types (XML and C#)
  - Windows-specific: C# script execution

## Build-Time Integrations

**Code Signing:**
- Environment Variables: `SIGN_TOOL`, `SIGN_THUMBPRINT`
- Location: Used in `src/ModInstaller.Native.TypeScript/build.js`
- Protocol: SignTool.exe with SHA1 and SHA256 hashing
- Timestamp: http://timestamp.comodoca.com

**Prebuilt Binary Management:**
- Location: `src/ModInstaller.Native.TypeScript/prebuilds/` directory
- Format: Platform-specific (.lib for Windows, .so for Linux)
- Fallback: Local compilation in `build/Release/` if prebuilds unavailable
- Resolution: `node-gyp-build` runtime package

## Data Flow

**Native Path (XML scripts only):**
```
Node.js → N-API Binding → Native AOT Library (.so/.lib) → FOMOD parsing
```

**IPC Path (All scripts):**
```
Node.js → TCP/NamedPipe Transport → ModInstallerIPC.exe (.NET) → FOMOD parsing
          (via BaseIPCConnection.ts)
```

## Environment Configuration

**No API keys or secrets detected** - This is a library with no external API dependencies.

**Process Environment Variables:**
- `SIGN_TOOL` - Path to code signing utility (optional, build-time)
- `SIGN_THUMBPRINT` - Certificate thumbprint for signing (optional, build-time)

## Archive Format Support

**Input:**
- ZIP archives (.fomod files are typically ZIP)
- 7z archives (.7z)
- OMOD legacy format (via `src/InstallScripting/omod/`)

**Output:**
- File installation manifests (list of files with destination paths)

## Testing Integration

**Mock/Stub Integrations:**
- `src/ModInstaller.IPC.TypeScript/test/__mocks__/vortex-api.ts` - Stubs `log()` and `util` functions
- `src/ModInstaller.IPC.TypeScript/test/__mocks__/winapi-bindings.ts` - Provides mock Windows API surface
- Vitest alias configuration in `vitest.config.ts` redirects imports to these mocks

---

*Integration audit: 2026-04-09*
