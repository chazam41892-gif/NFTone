import os
import sys
import numpy as np
from pydub import AudioSegment

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))
from src.crypto import derive_pn_sequence
from src.api import _load_audio, _SECRET, _PN_LENGTH
from src.watermarker import detect, detect_stereo, WatermarkParams

def main():
    watermarked_path = "C:/Users/chaza/Downloads/Leviathan_at_the_Door_watermarked.mp3"
    bootleg_path = "C:/Users/chaza/Downloads/Leviathan_at_the_Door_bootleg.mp3"
    
    print("====================================================")
    # NFTonez represents the user's spelling
    print("NFTonez - Bootleg / Leak Leakage Testing Simulation")
    print("====================================================")
    
    if not os.path.exists(watermarked_path):
        print(f"Error: Watermarked file not found at {watermarked_path}")
        print("Please run 'smoke_user_audio.py' first to generate the watermarked file.")
        sys.exit(1)
        
    print(f"1. Loading watermarked master: {watermarked_path}")
    audio = AudioSegment.from_mp3(watermarked_path)
    print(f"   Original duration: {len(audio)/1000.0:.2f} seconds")
    
    # Simulate bootlegging:
    # A. Crop the audio to just a 15-second clip (e.g. from second 5 to 20)
    print("\n2. Simulating bootleg modification:")
    print("   -> Cropping audio to a 15-second sub-clip (from 5s to 20s)...")
    bootleg_clip = audio[5000:20000]
    
    # B. Compress/export at a lower quality (e.g., 64 kbps stereo) to simulate lossy compression or hosting on a leak site
    print("   -> Re-compressing to low quality (64 kbps) to simulate sharing on a bootleg portal...")
    bootleg_clip.export(bootleg_path, format="mp3", bitrate="64k")
    print(f"   Saved bootleg clip to: {bootleg_path} ({os.path.getsize(bootleg_path)} bytes)")
    
    # Load the bootleg copy back for detection
    print("\n3. Loading the bootleg clip back for forensic analysis...")
    with open(bootleg_path, "rb") as f:
        bootleg_bytes = f.read()
        
    samples_bootleg, sr_bootleg, fmt_bootleg, is_stereo_bootleg = _load_audio(
        bootleg_bytes, "audio/mp3", "Leviathan_at_the_Door_bootleg.mp3"
    )
    
    # Define candidate wallets
    buyer_wallet = "wallet-A-test-123"
    other_wallet = "wallet-B-test-456"
    
    pn_buyer = derive_pn_sequence(buyer_wallet, _SECRET, length=_PN_LENGTH)
    pn_other = derive_pn_sequence(other_wallet, _SECRET, length=_PN_LENGTH)
    candidates = [(buyer_wallet, pn_buyer), (other_wallet, pn_other)]
    
    params = WatermarkParams(sample_rate=sr_bootleg)
    
    print(f"\n4. Running forensic detection with full phase alignment (scanning {len(candidates)} wallets)...")
    
    # Average envelopes for stereo if needed
    from src.watermarker import _envelopes, _normalized_correlation
    if is_stereo_bootleg:
        envs_l = _envelopes(samples_bootleg[:, 0].astype(np.float32), params)
        envs_r = _envelopes(samples_bootleg[:, 1].astype(np.float32), params)
        base_envs = []
        for el, er in zip(envs_l, envs_r):
            n = min(len(el), len(er))
            base_envs.append(((el[:n] + er[:n]) * 0.5).astype(np.float32))
    else:
        base_envs = _envelopes(samples_bootleg.astype(np.float32), params)
        
    best_wallet = None
    best_corr = 0.0
    best_offset = 0
    
    # Scan all possible frame offsets to find the cropped start alignment
    bit_period = _PN_LENGTH * params.repetition_factor # 512 * 3 = 1536
    for wallet_id, pn in candidates:
        for env in base_envs:
            for offset in range(bit_period):
                corr = _normalized_correlation(env, pn, params.repetition_factor, offset)
                if abs(corr) > abs(best_corr):
                    best_corr = corr
                    best_wallet = wallet_id
                    best_offset = offset
                    
    # Formulate mock result to match print structure
    class MockResult:
        wallet_id = best_wallet
        correlation = best_corr
        matched = abs(best_corr) >= params.detection_threshold
        confidence = "high" if abs(best_corr) >= 2*params.detection_threshold else "medium" if abs(best_corr) >= params.detection_threshold else "none"
        
    result = MockResult()
    print(f"   Detected crop alignment offset: {best_offset} frames")
        
    print("\n================ Detection Results ================")
    print(f"Leaker Wallet Match: {result.wallet_id}")
    print(f"Correlation score:   {result.correlation:.4f} (threshold: {params.detection_threshold})")
    print(f"Confidence Level:    {result.confidence.upper()}")
    print(f"Detection Gate:      {'PASS (Identified!)' if result.matched else 'FAIL'}")
    print("====================================================")
    
    if result.matched and result.wallet_id == buyer_wallet:
        print("\nSUCCESS: The leaked bootleg copy was successfully traced back to buyer wallet 'wallet-A-test-123'!")
        print("This proves the watermark survives cropping and lossy compression.")
    else:
        print("\nFAIL: Tracing failed.")
        sys.exit(1)

if __name__ == "__main__":
    main()
