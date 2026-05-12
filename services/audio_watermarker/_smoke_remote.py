"""End-to-end smoke test against the deployed Docker service.
Generates 2s WAV → embeds wallet-A's watermark → detects → asserts attribution.
"""
import io, json, math, struct, urllib.request, wave

BASE = "http://localhost:8500"
SR = 44100
DUR = 2

def make_wav():
    samples = [int(0.3 * 32767 * math.sin(2*math.pi*1000*i/SR)) for i in range(SR*DUR)]
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        for s in samples:
            w.writeframes(struct.pack("<h", s))
    return buf.getvalue()

def multipart(fields, file_bytes, file_field="audio", filename="x.wav"):
    boundary = b"---fb42"
    body = b""
    for k, v in fields.items():
        body += b"--" + boundary + b'\r\nContent-Disposition: form-data; name="' + k.encode() + b'"\r\n\r\n' + v.encode() + b'\r\n'
    body += b"--" + boundary + b'\r\nContent-Disposition: form-data; name="' + file_field.encode() + b'"; filename="' + filename.encode() + b'"\r\nContent-Type: audio/wav\r\n\r\n' + file_bytes + b'\r\n'
    body += b"--" + boundary + b"--\r\n"
    return body, "multipart/form-data; boundary=" + boundary.decode()

wav = make_wav()
print(f"generated WAV: {len(wav)} bytes")

# Embed
body, ct = multipart({"release_id": "smoke-001", "wallet_id": "wallet-A-functional"}, wav)
req = urllib.request.Request(BASE + "/api/v1/watermark/embed", data=body, method="POST", headers={"Content-Type": ct})
resp = urllib.request.urlopen(req, timeout=15)
watermarked = resp.read()
fp = resp.headers.get("X-Wallet-Fingerprint", "")
alpha = resp.headers.get("X-Alpha", "")
master = resp.headers.get("X-Master-Sha256", "")[:16]
deriv = resp.headers.get("X-Derivative-Sha256", "")[:16]
print(f"EMBED status={resp.status} bytes={len(watermarked)} fingerprint={fp[:12]}... alpha={alpha} master={master}... derivative={deriv}...")

# Detect
body2, ct2 = multipart({"release_id": "smoke-001"}, watermarked, filename="leak.wav")
req2 = urllib.request.Request(BASE + "/api/v1/watermark/detect", data=body2, method="POST", headers={"Content-Type": ct2})
resp2 = urllib.request.urlopen(req2, timeout=15)
result = json.loads(resp2.read())
print("DETECT response:")
print(json.dumps(result, indent=2))

if result.get("matched") and result.get("wallet_id") == "wallet-A-functional":
    print("\nVERDICT: PASS  (wallet-A's watermark detected with confidence=" + result.get("confidence", "?") + ")")
else:
    print(f"\nVERDICT: FAIL  matched={result.get('matched')} wallet_id={result.get('wallet_id')}")
    raise SystemExit(1)
