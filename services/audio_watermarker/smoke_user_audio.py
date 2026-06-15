import os
import sys
import numpy as np
from pydub import AudioSegment

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))
from src.crypto import derive_pn_sequence
from src.api import _load_audio, _encode_audio, _SECRET, _PN_LENGTH
from src.watermarker import detect, detect_stereo, embed, embed_stereo, WatermarkParams

def main():
    input_path = "C:/Users/chaza/Downloads/Leviathan_at_the_Door.mp3"
    output_path = "C:/Users/chaza/Downloads/Leviathan_at_the_Door_watermarked.mp3"
    
    print("====================================================")
    print("NFTonez - Real Audio Watermarking Smoke Test")
    print("====================================================")
    
    if not os.path.exists(input_path):
        print(f"Error: Input file not found at {input_path}")
        sys.exit(1)
        
    print(f"Loading input file: {input_path}")
    with open(input_path, "rb") as f:
        blob = f.read()
        
    # 1. Load the original audio
    samples, sr, fmt, is_stereo = _load_audio(blob, "audio/mp3", "Leviathan_at_the_Door.mp3")
    print(f"Successfully loaded: format={fmt}, sample_rate={sr}Hz, stereo={is_stereo}")
    print(f"Audio duration: {len(samples)/sr:.2f} seconds")
    
    # 2. Derive PN sequences for candidates
    test_wallet = "wallet-A-test-123"
    other_wallet = "wallet-B-test-456"
    pn_a = derive_pn_sequence(test_wallet, _SECRET, length=_PN_LENGTH)
    pn_b = derive_pn_sequence(other_wallet, _SECRET, length=_PN_LENGTH)
    
    # Use default params (alpha=0.08)
    params = WatermarkParams(sample_rate=sr)
    print(f"Embedding parameters: alpha={params.alpha}, threshold={params.detection_threshold}")
    
    # 3. Embed the watermark
    print(f"\nEmbedding watermark for wallet: {test_wallet}")
    if is_stereo:
        watermarked = embed_stereo(samples, pn_a, params)
    else:
        watermarked = embed(samples, pn_a, params)
        
    # 4. Encode back to MP3 and save
    print(f"Encoding and saving watermarked copy to: {output_path}")
    out_bytes, mime = _encode_audio(watermarked, sr, "mp3")
    with open(output_path, "wb") as f:
        f.write(out_bytes)
    print(f"Saved {len(out_bytes)} bytes.")
    
    # 5. Read the watermarked file back for detection
    print("\nReading watermarked copy back for detection...")
    samples_out, sr_out, fmt_out, is_stereo_out = _load_audio(out_bytes, "audio/mp3", "watermarked.mp3")
    
    # 6. Run watermark detection
    candidates = [(test_wallet, pn_a), (other_wallet, pn_b)]
    print(f"Scanning against {len(candidates)} candidate wallets...")
    if is_stereo_out:
        result = detect_stereo(samples_out, candidates, params)
    else:
        result = detect(samples_out, candidates, params)
        
    print("\n================ Detection Results ================")
    print(f"Matched Wallet: {result.wallet_id}")
    print(f"Correlation:    {result.correlation:.4f}")
    print(f"Confidence:     {result.confidence.upper()}")
    print(f"Detection Gate: {'PASS' if result.matched else 'FAIL'}")
    print("====================================================")
    
    if result.wallet_id == test_wallet:
        print("SUCCESS: Watermark detected and correctly attributed!")
    else:
        print("FAIL: Watermark detection failed or misattributed.")
        sys.exit(1)

if __name__ == "__main__":
    main()
