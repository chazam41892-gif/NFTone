# Icons placeholder

This directory must contain the icon set referenced by `tauri.conf.json`:

- `32x32.png`
- `128x128.png`
- `128x128@2x.png` (256x256)
- `icon.icns` (macOS)
- `icon.ico` (Windows)

## Generate from a single source PNG

Drop a 1024x1024 PNG named `icon-source.png` in the `desktop/` directory, then:

```powershell
cd desktop
npx @tauri-apps/cli icon ./icon-source.png
```

This auto-generates every required size/format and places them here. Until then, `tauri build` will fail with "icon not found" — `tauri dev` works without bundle icons because no installer is produced.
