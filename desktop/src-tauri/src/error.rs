use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    #[error("http: {0}")]
    Http(#[from] reqwest::Error),

    #[error("keychain: {0}")]
    Keychain(#[from] keyring::Error),

    #[error("url: {0}")]
    Url(#[from] url::ParseError),

    #[error("tauri: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(self.to_string().as_ref())
    }
}

pub type AppResult<T> = Result<T, AppError>;
