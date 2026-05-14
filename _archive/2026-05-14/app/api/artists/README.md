# Archived: app/api/artists/route.ts

**Date:** 2026-05-14
**Reason:** Orphan + security hole.

This route accepted `userId` in the request body without authenticating —
any caller could create an artist profile for any user ID.

Functionally it was superseded by `app/api/onboard/route.ts`, which:
- Reads `userId` from `auth()` session (not body)
- Checks for an existing profile
- Validates the slug isn't taken

No frontend code referenced `/api/artists` (verified via grep before move).

Archived per the Preservation Architect rule: never `rm`, always move +
README. If the public artist-creation endpoint is ever needed again, it
should be re-introduced via the auth-gated pattern in `/api/onboard`,
not by restoring this file as-is.
