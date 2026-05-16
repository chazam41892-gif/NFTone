# Azure Trusted Signing — One-Time Setup

This is the procedure for setting up Azure Artifact Signing (formerly
Trusted Signing) so the `.github/workflows/desktop-release.yml` workflow
can sign NFTones desktop installers for ~$10/month base.

> **Eligibility gate:** Public Trust certificates are issued only to
> organizations in USA/Canada/EU/UK, OR to individual developers in
> USA/Canada. If you're outside those regions, this whole path is closed
> and you need an OV cert from DigiCert/Sectigo ($150–300/yr) instead.

## Phase A — Prerequisites

1. **Azure subscription + Microsoft Entra tenant** — any active Azure
   account has both.
2. **Verify billing-account info matches what you want on the cert.** The
   identity validation reads your legal name/address from the billing
   account. Fix it BEFORE starting validation:
   - Microsoft 365 Admin → Billing → Billing accounts → edit.

## Phase B — Create signing infrastructure in Azure Portal (~10 min active)

1. Azure portal → search **Artifact Signing Accounts** → **Create**.
2. Fill: subscription, new resource group `nftones-signing-rg`, account
   name `nftones-signing`, region (pick near your CI runner — affects
   the endpoint URL), pricing tier **Basic**.
3. After the resource is created, go to **Identity validations** →
   **New identity validation**:
   - Type: **Public Identity**
   - Subtype: **Individual** (US/Canada) or **Organization** (US/CAN/EU/UK)
   - Submit. **Wait a few business days for Microsoft to verify.**
4. Once status is `Completed`, go to **Certificate profiles** → **Create**:
   - Type: **Public Trust** (production) or **Public Trust Test** (dry
     run the toolchain first)
   - Name: `nftones-prod`
   - Identity validation: pick the completed one from the dropdown
5. **Assign yourself the signer role.** On the Artifact Signing account →
   **Access control (IAM)** → **Add role assignment** → role: **Trusted
   Signing Certificate Profile Signer** → assign to your user account
   (and later to your CI service principal).

## Phase C — Create the CI service principal

The GitHub Actions runner needs its own Entra identity (don't ship your
personal account credentials to CI):

1. Azure portal → **Microsoft Entra ID** → **App registrations** → **New
   registration**:
   - Name: `nftones-ci-signing`
   - Supported account types: **Single tenant**
   - Redirect URI: leave blank
2. From the new App Registration:
   - Copy **Application (client) ID** → repo secret `AZURE_CLIENT_ID`
   - Copy **Directory (tenant) ID** → repo secret `AZURE_TENANT_ID`
3. **Certificates & secrets** → **Client secrets** → **New client secret**:
   - Description: `github-actions`
   - Expires: 12 months (set a calendar reminder to rotate)
   - Copy the **Value** (not the ID) → repo secret `AZURE_CLIENT_SECRET`
4. Back to the **Artifact Signing account** → **Access control (IAM)** →
   **Add role assignment** → role: **Trusted Signing Certificate
   Profile Signer** → search for `nftones-ci-signing` (the App
   Registration) → assign.

## Phase D — Repository secrets

In GitHub: **Settings → Secrets and variables → Actions → New
repository secret**. Add all of these:

| Secret                          | Value                                                                 |
|---------------------------------|-----------------------------------------------------------------------|
| `AZURE_TENANT_ID`               | From Phase C step 2                                                   |
| `AZURE_CLIENT_ID`               | From Phase C step 2                                                   |
| `AZURE_CLIENT_SECRET`           | From Phase C step 3                                                   |
| `AZURE_SIGNING_ENDPOINT`        | `https://<region>.codesigning.azure.net/` (region-specific — Azure portal → your Artifact Signing account → **Account URI**) |
| `AZURE_SIGNING_ACCOUNT`         | `nftones-signing`                                                     |
| `AZURE_SIGNING_PROFILE`         | `nftones-prod`                                                        |

## Phase E — Tauri updater signing keypair

Separately from code-signing, the Tauri auto-updater needs an Ed25519
keypair to sign the `latest.json` manifest (so the desktop app can verify
updates came from you, not an attacker).

On any machine with Tauri CLI:

```powershell
cd C:\Users\chaza\NFTones\desktop
npx tauri signer generate -w ~/.tauri/nftones-updater.key
# Prompts for a password. Set one and save it somewhere safe.
```

Output:
- **Public key** (printed to terminal): paste into
  `desktop/src-tauri/tauri.conf.json` → `plugins.updater.pubkey`
  (commit this — it's public).
- **Private key** (`~/.tauri/nftones-updater.key`): copy the FILE
  CONTENTS into the GitHub repo secret `TAURI_UPDATER_PRIVKEY`.
- **Password**: into the GitHub repo secret
  `TAURI_UPDATER_PRIVKEY_PASSWORD`.
- Optionally: into the repo secret `TAURI_UPDATER_PUBKEY` (for reference).

> **Don't commit the .key file.** Even with a password, treat it as
> sensitive. The pubkey alone is what users will use to verify updates;
> losing the privkey means you can never ship another auto-update under
> the same pubkey.

## Phase F — Dry run

1. Push a test tag:
   ```bash
   git tag desktop-v0.0.1-test
   git push origin desktop-v0.0.1-test
   ```
2. Watch the workflow in GitHub Actions. The Windows job should:
   - Build the MSI/NSIS installers
   - Install the Artifact Signing client tools
   - Run `azure/trusted-signing-action` against your account
   - Upload signed artifacts
3. Download the signed `.msi`. On Windows:
   ```powershell
   Get-AuthenticodeSignature .\NFTones_0.0.1_x64_en-US.msi | Format-List
   ```
   `Status` should be `Valid` and `SignerCertificate.Subject` should
   contain your validated legal name.

## Phase G — Reputation expectation

Even after signing, the first few hundred users will see Microsoft
SmartScreen warnings — Microsoft's docs explicitly call this out:
**"new signed apps still trigger SmartScreen warnings until your
publisher identity builds reputation — typically several weeks and
hundreds of clean installs."**

What that means operationally:
- Don't promise "no warnings on install" in marketing
- Onboarding flow should walk early users through the "More info →
  Run anyway" path
- Reputation accumulates per publisher identity, not per release, so
  the friction goes away once you cross the (undisclosed) threshold

## Cost recap

| Item                                  | Cost                  |
|---------------------------------------|-----------------------|
| Azure Artifact Signing — Basic tier   | ~$9.99/month base     |
| Per-signature fee                     | Check current rate at https://azure.microsoft.com/pricing/details/artifact-signing/ |
| Identity validation (one-time)        | included in the above |
| Apple Developer (if you ship Mac)     | $99/year separately   |
| Linux signing                         | gpg-sign is free      |

## Troubleshooting

| Symptom                                 | Cause / fix                                                              |
|-----------------------------------------|--------------------------------------------------------------------------|
| `403 Forbidden` from SignTool           | Region/endpoint mismatch. The `AZURE_SIGNING_ENDPOINT` region must match the region of your Artifact Signing account. |
| `No identity validation found`          | Identity validation is still **Submitted** — wait for `Completed`.       |
| `Insufficient privileges`               | The CI App Registration isn't assigned the **Trusted Signing Certificate Profile Signer** role on the signing account. Re-do Phase C step 4. |
| SmartScreen blocks installer in users' hands | Expected for the first weeks. See Phase G.                          |
| Tauri updater shows "no update available" despite a new tag | `pubkey` in `tauri.conf.json` doesn't match the privkey that signed `latest.json`. Or `latest.json` isn't published to the URL the app polls. |
