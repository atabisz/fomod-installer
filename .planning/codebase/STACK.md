# Technology Stack

**Analysis Date:** 2026-04-09

## Languages

**Primary:**
- TypeScript 5.9.3 - Core Node.js packages (`src/ModInstaller.Native.TypeScript`, `src/ModInstaller.IPC.TypeScript`)
- C# (.NET 9) - Backend FOMOD parsing and script execution
- C++ 17 - Native bindings via N-API for AOT-compiled library

**Secondary:**
- JavaScript - Node.js build scripts and installation utilities
- ANTLR 3 - XML script parsing grammar

## Runtime

**Environment:**
- Node.js 22+ (enforced via engines field)
- .NET 9 SDK (required for building C# components)

**Package Manager:**
- pnpm 10.8.1 - Monorepo workspace management
- Lockfile: pnpm-lock.yaml (v9.0 format) present with catalog dependencies

## Frameworks

**Core:**
- N-API 8.5.0 - Native module bindings for shared library integration
- node-addon-api 8.5.0 - C++ wrapper for N-API

**Build/Compilation:**
- node-gyp 10.0.0 - Native module build system for C++ bindings
- Webpack 5.105.4 - Module bundling for TypeScript packages
- ts-loader 9.5.4 - TypeScript transpilation for Webpack
- ts-node 10.9.2 - Direct TypeScript execution for build scripts

**Testing:**
- Vitest 4.1.1 - Unit and integration test runner (configs: `src/ModInstaller.Native.TypeScript/vitest.config.ts`, `src/ModInstaller.IPC.TypeScript/vitest.config.ts`)

## Key Dependencies

**Critical:**
- node-gyp-build 4.8.4 - Runtime resolution of precompiled native bindings (used in `src/ModInstaller.Native.TypeScript/src/resolve-native.ts`)
- vortex-api (Nexus-Mods/vortex-api) - Logging and utilities from Vortex mod manager, used throughout IPC and Native modules
- winapi-bindings (Nexus-Mods/node-winapi-bindings) - Windows API access for security levels and sandbox process launching

**Utilities:**
- node-stream-zip 1.15.0 - ZIP archive reading for FOMOD extraction
- node-7z 3.0.0 - 7zip compression utility integration
- 7zip-bin 5.2.0 - Precompiled 7zip binaries

**Platform-Specific:**
- @types/node 22.19.15 - Node.js type definitions for TypeScript strict mode

## Dev Dependencies

**Build Tools:**
- node-gyp 10.0.0 - Configured in `src/ModInstaller.Native.TypeScript/binding.gyp` for Windows (.lib) and Linux (.so) native libraries
- webpack-cli 5.1.4 - Webpack command-line interface for bundling

**Testing:**
- Vitest 4.1.1 - Test runner with 60-120 second timeout windows for integration tests

## Configuration

**Environment:**
- Volta config (`volta.node: 22.22.0`) pins Node.js version per-project
- Engines field enforces Node.js >=22 for both packages
- .env file handling: Appears to be unused (not detected in codebase)

**Build:**
- `src/ModInstaller.Native.TypeScript/tsconfig.json` - Strict TypeScript compilation (ES2019 target, CommonJS modules, declaration generation)
- `src/ModInstaller.Native.TypeScript/binding.gyp` - Native module configuration with platform-specific compiler flags:
  - Windows: MSVC with /EHsc /std:c++17 exception handling
  - Linux: GCC/Clang with C++17 exceptions, dynamic linking with rpath
- `src/ModInstaller.IPC.TypeScript/tsconfig.json` - Same strict config as native package
- `src/ModInstaller.IPC.TypeScript/vitest.config.ts` - Test path alias for mocking vortex-api and winapi-bindings (broken/native deps)
- `pnpm-workspace.yaml` - Defines monorepo structure and shared dependency catalog

**NPM Scripts:**
- `@nexusmods/fomod-installer-native`:
  - `npm run build` - Full build via build.js
  - `npm run native` - C++/native compilation only
  - `npm run build-napi` - N-API bindings only
  - `npm run test` - Comprehensive test suite
  - `npm run test-vitest` - Unit tests only
  - `npm run watch:build` - TypeScript watch mode

- `@nexusmods/fomod-installer-ipc`:
  - `npm run build` - C# and TypeScript build
  - `npm run build-csharp` - C# compilation only
  - `npm run test` - Vitest suite
  - `npm run cleanup` - Process cleanup utility

## Package Publishing

**Native Package:**
- Package: `@nexusmods/fomod-installer-native` v0.13.0
- Publishes precompiled binaries via `prebuilds/` directory
- N-API version 8 compatibility for binary stability
- Distribution includes: dist/, prebuilds/, src-native/, binding.gyp

**IPC Package:**
- Package: `@nexusmods/fomod-installer-ipc` v0.13.0
- Publishes TypeScript transpiled output only (dist/ directory)

## Architecture Overview

**Two distinct integration paths:**

1. **Native Path** (`@nexusmods/fomod-installer-native`):
   - C++ extension wrapping Native AOT compiled .NET library
   - Loaded via N-API at runtime with `node-gyp-build`
   - Lightweight, no .NET runtime required
   - Limited to XML-based FOMOD scripts

2. **IPC Path** (`@nexusmods/fomod-installer-ipc`):
   - Spawns ModInstallerIPC.exe (.NET process)
   - Communicates via TCP or Named Pipes transport
   - Full C# script support (Windows-only for C# features)
   - Cross-platform transport abstraction with platform-specific optimizations

---

*Stack analysis: 2026-04-09*
