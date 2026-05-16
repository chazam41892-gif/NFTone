//! Secure session storage backed by the OS keychain.
//!
//! Cross-platform via the `keyring` crate:
//!   - macOS    → Keychain Services
//!   - Windows  → Credential Manager (Generic Credential)
//!   - Linux    → Secret Service (gnome-keyring / kwallet)
//!
//! Why not localStorage / Tauri store plugin? Both write tokens in cleartext
//! on disk. The OS keychain encrypts at rest and gates access on the logged-in
//! user. For session tokens we are correctly paranoid.

use crate::error::AppResult;
use keyring::Entry;

const SERVICE: &str = "app.nftones.desktop";

fn entry(key: &str) -> AppResult<Entry> {
    Ok(Entry::new(SERVICE, key)?)
}

pub fn set(key: &str, value: &str) -> AppResult<()> {
    entry(key)?.set_password(value)?;
    Ok(())
}

pub fn get(key: &str) -> AppResult<Option<String>> {
    match entry(key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        // keyring::Error::NoEntry on most platforms when missing
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn clear(key: &str) -> AppResult<()> {
    match entry(key)?.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}
