"""
Wrapper that monkey-patches torchaudio.save to use soundfile
before importing demucs, bypassing the torchcodec requirement.
Usage: python demucs_run.py [demucs args...]
"""
import sys
import soundfile as sf
import torch
import torchaudio

# Patch torchaudio.save to use soundfile directly
def _sf_save(uri, src, sample_rate, channels_first=True, **kwargs):
    wav = src
    if isinstance(wav, torch.Tensor):
        wav = wav.numpy()
    if channels_first and wav.ndim == 2:
        wav = wav.T  # soundfile wants (frames, channels)
    sf.write(str(uri), wav, sample_rate)

torchaudio.save = _sf_save

# Also patch the internal audio module if already imported
try:
    import torchaudio.backend.soundfile_backend as _sfb
except Exception:
    pass

# Now run demucs with the remaining args
from demucs.__main__ import main
sys.argv = ['demucs'] + sys.argv[1:]
main()
