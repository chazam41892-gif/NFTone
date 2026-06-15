import os
import subprocess
import tempfile
import numpy as np
import pytest
import soundfile as sf
from src.crypto import derive_pn_sequence
from src.watermarker import WatermarkParams
from src.api import _load_audio, _encode_video_with_audio, _SECRET, _PN_LENGTH
from src.watermarker import detect, embed

def test_video_watermark_roundtrip(secret_key):
    # 1. Generate a small 3-second MP4 video file with a 1000Hz sine wave audio stream
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as temp_video:
        video_path = temp_video.name
        
    try:
        cmd = [
            "ffmpeg",
            "-f", "lavfi", "-i", "testsrc=duration=3:size=160x120:rate=10",
            "-f", "lavfi", "-i", "sine=frequency=1000:duration=3",
            "-c:v", "libx264",
            "-c:a", "aac",
            "-pix_fmt", "yuv420p",
            "-y",
            video_path
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        
        with open(video_path, "rb") as f:
            video_bytes = f.read()
            
        # 2. Load the audio track from the video
        samples, sr, fmt, is_stereo = _load_audio(video_bytes, "video/mp4", "test.mp4")
        assert fmt == "mp4"
        assert sr == 44100
        
        # 3. Embed watermark in the samples
        pn_a = derive_pn_sequence("wallet-A", _SECRET, length=_PN_LENGTH)
        pn_b = derive_pn_sequence("wallet-B", _SECRET, length=_PN_LENGTH)
        
        params = WatermarkParams(sample_rate=sr)
        
        # If stereo, flatten to mono as we are testing the mono embed path
        mono = samples if samples.ndim == 1 else samples.mean(axis=1).astype(np.float32)
        watermarked = embed(mono, pn_a, params)
        
        # 4. Mux it back into the video
        muxed_bytes, mime = _encode_video_with_audio(watermarked, sr, "mp4", video_bytes)
        assert mime == "video/mp4"
        assert len(muxed_bytes) > 0
        
        # 5. Extract audio from the muxed video and run detection
        samples_out, sr_out, fmt_out, is_stereo_out = _load_audio(muxed_bytes, "video/mp4", "muxed.mp4")
        assert fmt_out == "mp4"
        
        mono_out = samples_out if samples_out.ndim == 1 else samples_out.mean(axis=1).astype(np.float32)
        result = detect(
            mono_out,
            [("wallet-A", pn_a), ("wallet-B", pn_b)],
            params
        )
        
        assert result.matched
        assert result.wallet_id == "wallet-A"
        
    finally:
        if os.path.exists(video_path):
            os.unlink(video_path)

def test_silent_video_raises_http_exception():
    # Generate a silent MP4 video file (no audio stream)
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as temp_video:
        video_path = temp_video.name
        
    try:
        cmd = [
            "ffmpeg",
            "-f", "lavfi", "-i", "testsrc=duration=2:size=160x120:rate=10",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-y",
            video_path
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        
        with open(video_path, "rb") as f:
            video_bytes = f.read()
            
        # Try to load it — should raise HTTPException with 400 status
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as excinfo:
            _load_audio(video_bytes, "video/mp4", "silent.mp4")
        assert excinfo.value.status_code == 400
        assert "No audio track" in excinfo.value.detail
        
    finally:
        if os.path.exists(video_path):
            os.unlink(video_path)
