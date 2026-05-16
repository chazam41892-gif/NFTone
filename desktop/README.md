# NFTones Desktop Shell

Tauri 2.x native shell that wraps the deployed NFTones web app and adds
OS-level capabilities the browser can't provide: offline watermark detect,
encrypted session storage in the OS keychain, deep-link wallet round-trip,
and code-signed auto-update.

## Architecture (strangler fig)

```
┌────────────────────────────────────────────────────────────────────────┐
│  NFTones Desktop (this directory)                                       │
│                                                                         │
│   ┌──────────────────┐    Tauri IPC    ┌──────────────────────────┐   │
│   │  Webview         │ ◄─────────────► │  Rust backend             │   │
│   │  (Next.js URL,   │                 │  - sidecar lifecycle      │   │
│   │   localhost:3000 │                 │  - deep-link nftones://   │   │
│   │   in dev,        │                 │  - OS keychain (keyring)  │   │
│   │   prod URL in    │                 │  - Tauri updater          │   │
│   │   release)       │                 │  - native dialogs/fs/http │   │
│   └──────────────────┘                 └────────────┬──────────────┘   │
│                                                     │                   │
│                                                     │ spawn / IPC       │
│                                                     ▼                   │
│                                          ┌──────────────────────┐      │
│                                          │  audio_watermarker   │      │
│                                          │  (pyinstaller bin)   │      │
│                                          │  127.0.0.1:8501      │      │
│                                          └──────────────────────┘      │
└────────────────────────────────────────────────────────────────────────┘
```

Stack B (the Next.js web app at the repo root) is **canonical**. The
desktop shell points its webview at it. No code is forked. Anything that
works in the web app works in the desktop shell automatically. Anything
that *only* works in the desktop shell (offline detect, keychain) is
gated on `isTauri()` in `lib/desktop.ts`.

## Quick start (developer machine)

### Prerequisites

| Tool                              | Why                                  | How to install |
|-----------------------------------|--------------------------------------|----------------|
| Rust 1.77+                        | Tauri core                            | `rustup-init` from rustup.rs |
| Node 20+                          | Tauri CLI + JS deps                   | Already required by Stack B |
| **Visual Studio Build Tools 2022** | MSVC linker for Rust on Windows      | https://visualstudio.microsoft.com/visual-cpp-build-tools/ — install the "Desktop development with C++" workload |
| WebView2 Runtime                  | Tauri uses Chromium-based WebView2    | Preinstalled on Windows 11; on Win 10 see Microsoft Edge WebView2 docs |
| `winget`                          | One-line install of Artifact Signing tools | Built into Windows 11 |

### Run the dev shell

```powershell
# In one terminal: Stack B
cd C:\Users\chaza\NFTones
npm run dev          # serves Next.js on http://localhost:3000

# In another terminal: Tauri shell pointed at it
cd C:\Users\chaza\NFTones\desktop
npm install          # first time only
npm run dev          # opens the Tauri window
```

The window loads `http://localhost:3000`. Hot-reload works because the
webview just reloads the URL.

### Build a release installer locally

```powershell
cd C:\Users\chaza\NFTones\desktop
npm run build        # produces src-tauri/target/release/bundle/...
```

Output paths:
- Windows MSI: `src-tauri/target/release/bundle/msi/*.msi`
- Windows NSIS: `src-tauri/target/release/bundle/nsis/*.exe`
- macOS app: `src-tauri/target/release/bundle/macos/*.app`
- macOS DMG: `src-tauri/target/release/bundle/dmg/*.dmg`
- Linux deb: `src-tauri/target/release/bundle/deb/*.deb`
- Linux AppImage: `src-tauri/target/release/bundle/appimage/*.AppImage`

Local builds are **unsigned**. For signed Windows installers, use the CI
workflow at `.github/workflows/desktop-release.yml` — see `SIGNING-SETUP.md`.

## IPC commands exposed to the webview

All defined in `src-tauri/src/commands.rs`. Typed wrappers in
`lib/desktop.ts` (Stack B side):

| Command                  | Frontend wrapper                       | Purpose |
|--------------------------|----------------------------------------|---------|
| `app_version`            | `app.version()`                        | Return Cargo version |
| `open_external`          | `app.openExternal(url)`                | Open URL in OS default browser |
| `request_wallet_signin`  | `auth.requestWalletSignin(signinUrl)`  | Kick off Phantom-in-browser sign-in; deep-link returns the signed payload |
| `session_set/get/clear`  | `session.{set,get,clear}(key, value?)` | OS keychain (Win Credential Mgr / macOS Keychain / Linux Secret Service) |
| `watermarker_health`     | `watermarker.health()`                 | Liveness probe of the local sidecar |
| `watermarker_embed`      | `watermarker.embed(path, rid, wallet)` | Embed wallet-derived watermark; writes derivative to `%TEMP%/nftones-watermarked/` |
| `watermarker_detect`     | `watermarker.detect(path, releaseId?)` | Identify a buyer wallet from a leaked file |
| `check_for_updates`      | `updater.check()`                      | Hit the Tauri updater endpoint, return manifest |
| `updater_install`        | `updater.install()`                    | Download + install + exit |

## The watermarker sidecar binary

The Rust `sidecar.rs` spawns `binaries/audio_watermarker(-<target-triple>)`
on app start. That binary is a pyinstaller bundle of
`services/audio_watermarker` (the FastAPI service verified by the Phase 1
audit, 28 pytest passing).

This commit set ships the **wiring** but not the binary. Building it:

```powershell
cd services\audio_watermarker
.\.venv\Scripts\activate
pip install pyinstaller
pyinstaller --onefile -n audio_watermarker src/api_runner.py   # (script TBD)
# Copy dist\audio_watermarker.exe to desktop\src-tauri\binaries\audio_watermarker-x86_64-pc-windows-msvc.exe
```

Then, to wire the binary into the bundle, add this back into
`tauri.conf.json` under `bundle`:

```json
"externalBin": ["binaries/audio_watermarker"]
```

(Removed from the default config because Tauri's build script validates
the file exists at compile time, which would block fresh-clone builds
before anyone produces the binary.)

When the binary is missing OR not declared in `externalBin`, `sidecar.rs`
logs a warning and the shell runs without it. `watermarker_health`
returns `false`; the frontend can fall back to a cloud-hosted
watermarker URL.

## Deep-link wallet sign-in flow

```
Desktop                          OS Default Browser              Phantom
   │                                     │                          │
   │  request_wallet_signin(url)        │                          │
   ├────────────────────────────────────►│                          │
   │  → opens https://nftones.app/      │                          │
   │    signin-desktop?state=...&       │                          │
   │    callback=nftones://auth/...     │                          │
   │                                     │  user clicks "Sign In"   │
   │                                     ├─────────────────────────►│
   │                                     │   ◄──── signed message ──┤
   │                                     │                          │
   │              os routes nftones:// ──┤                          │
   ◄─────────────────────────────────────┘                          │
   │  emits "deep-link" event with                                  │
   │  ["nftones://auth/callback?...&signature=...&wallet=..."]     │
   │                                                                │
   │  webview listens via auth.onDeepLink                          │
   │  validates state, calls NextAuth /api/auth/callback/credentials│
```

This pattern avoids shipping wallet keys in the desktop bundle. Phantom
(or any wallet) lives in the user's browser; we just round-trip the
signed payload through the OS deep-link bus.

## Auto-update channel

`tauri.conf.json` points at `https://releases.nftones.app/desktop/
{{target}}/{{current_version}}` — a static JSON manifest signed with the
Ed25519 keypair generated by `tauri signer generate`. The CI workflow
signs `latest.json` inline; you publish that file to the URL (manual
copy to S3/Cloudflare R2 today; CDN automation is future work).

Set `updater.pubkey` in `tauri.conf.json` to the public half of that
keypair before building. Without it, the updater is inert (returns
`{available: false}`).

## Releasing

```bash
git tag desktop-v0.1.1
git push origin desktop-v0.1.1
```

Triggers `.github/workflows/desktop-release.yml`:
1. Builds Windows + macOS (x64 + arm64) + Linux from one workflow
2. Signs Windows .msi and .exe via `azure/trusted-signing-action` using
   the Entra App Registration credentials in repo secrets
3. Creates a **draft** GitHub Release with all installers + `latest.json`

You review the draft and publish manually.

See `SIGNING-SETUP.md` for the one-time Azure Trusted Signing setup.
