/**
 * Detect whether Stack B is running inside the Tauri desktop shell, and
 * expose a thin typed bridge to the native IPC commands defined in
 * `desktop/src-tauri/src/commands.rs`.
 *
 * Everything here is no-op safe in the browser — `isTauri()` short-circuits
 * to `false` when window.__TAURI_INTERNALS__ isn't present, and `invoke()`
 * is dynamically imported only on the desktop path so the Tauri JS API is
 * never bundled into the web build.
 *
 * Usage in a component:
 *
 *   import { isTauri, watermarker, session } from "@/lib/desktop";
 *   if (isTauri()) {
 *     const healthy = await watermarker.health();
 *   }
 */

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  // Tauri 2.x marker; survives webview reloads.
  return Boolean((window as any).__TAURI_INTERNALS__);
}

async function tauriInvoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (!isTauri()) {
    throw new Error(`Tauri command "${cmd}" called outside the desktop shell.`);
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

// ---------- App ----------

export const app = {
  version: () => tauriInvoke<string>("app_version"),
  openExternal: (url: string) => tauriInvoke<void>("open_external", { url }),
};

// ---------- Wallet sign-in (browser-roundtrip) ----------

export type WalletSigninRequest = {
  state: string;
  callbackUrl: string;
};

export const auth = {
  /**
   * Open the system browser to /signin-desktop with a one-time state
   * token. Phantom signs in browser; result returns via nftones:// deep
   * link, which the Tauri runtime emits as a `deep-link` event.
   *
   * Call `onDeepLink` to subscribe.
   */
  requestWalletSignin: async (signinUrl: string): Promise<WalletSigninRequest> => {
    const raw = await tauriInvoke<{ state: string; callback_url: string }>(
      "request_wallet_signin",
      { signinUrl }
    );
    return { state: raw.state, callbackUrl: raw.callback_url };
  },

  /** Subscribe to deep-link callbacks. Returns an unsubscribe fn. */
  onDeepLink: async (handler: (urls: string[]) => void): Promise<() => void> => {
    if (!isTauri()) return () => {};
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen<string[]>("deep-link", (event) => {
      handler(event.payload);
    });
    return unlisten;
  },
};

// ---------- Secure session storage (OS keychain) ----------

export const session = {
  set: (key: string, value: string) =>
    tauriInvoke<void>("session_set", { key, value }),
  get: (key: string) => tauriInvoke<string | null>("session_get", { key }),
  clear: (key: string) => tauriInvoke<void>("session_clear", { key }),
};

// ---------- Watermarker (sidecar on 127.0.0.1:8501) ----------

export type EmbedResult = {
  watermarked_path: string;
  master_sha256: string;
  derivative_sha256: string;
  wallet_fingerprint: string;
  format: string;
};

export type DetectResult = {
  matched: boolean;
  wallet_id: string | null;
  wallet_fingerprint: string | null;
  correlation: number;
  confidence: "none" | "low" | "medium" | "high";
  wallets_searched: number;
  threshold: number;
};

export const watermarker = {
  health: () => tauriInvoke<boolean>("watermarker_health"),
  embed: (audioPath: string, releaseId: string, walletId: string) =>
    tauriInvoke<EmbedResult>("watermarker_embed", {
      audioPath,
      releaseId,
      walletId,
    }),
  detect: (audioPath: string, releaseId?: string) =>
    tauriInvoke<DetectResult>("watermarker_detect", { audioPath, releaseId }),
};

// ---------- Updater ----------

export type UpdateInfo =
  | { available: false; error?: string }
  | {
      available: true;
      version: string;
      current_version: string;
      date: string | null;
      body: string | null;
    };

export const updater = {
  check: () => tauriInvoke<UpdateInfo>("check_for_updates"),
  install: () => tauriInvoke<void>("updater_install"),
};
