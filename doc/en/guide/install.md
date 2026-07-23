# Install & Build

## Download a release

For regular users, download packages from GitHub Releases:

- [Latest release](https://github.com/fantasy-ke/FkeMark/releases/latest)
- [All releases](https://github.com/fantasy-ke/FkeMark/releases)

Choose the package for your platform:

| Platform | Recommended file |
| --- | --- |
| Windows | <code>.msi</code> or <code>.exe</code> (NSIS), or a portable build |
| macOS | <code>.dmg</code> |
| Linux | <code>.deb</code> or <code>.AppImage</code> |

## Run from source

Requirements:

- Node.js 18+
- Stable Rust toolchain
- WebKitGTK and other Tauri runtime dependencies on Linux

~~~bash
npm install
npm run tauri:dev
~~~

## Build the desktop app

~~~bash
npm run tauri:build
~~~

Platform-specific commands are also available:

~~~bash
npm run tauri:build:msi
npm run tauri:build:nsis
npm run tauri:build:deb
npm run tauri:build:appimage
npm run tauri:build:dmg
~~~

## Quality check

~~~bash
npm test
~~~

If tests fail, fix the failing cases before publishing.
