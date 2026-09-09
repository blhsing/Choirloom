# NNSVS worker

Singing uses NNSVS SPSVS on CPU, with WORLD or the publisher's neural vocoder. The .NET Singer executable launches this worker and writes 192 kbps MP3 alongside 44.1 kHz PCM stems. Models and Python are deployment assets, not Git assets.

## Pinned Windows runtime

Install under `C:\Tools\choirloom-nnsvs`. Start from [ENUNU 1.0.0](https://github.com/oatsu-gh/ENUNU/releases/download/v1.0.0/ENUNU-1.0.0.zip), SHA-256 `900128e8cb17ade12eadd5edc259e65fc5b8f8c69971e5cd4bf5f105bec5f422`. Its embedded Python 3.12.10 includes the Windows NNSVS native dependencies. Add the Python directory and its Scripts directory to the user's PATH.

Using that Python executable:

```
python -m pip install torch==2.7.1+cpu torchaudio==2.7.1+cpu --index-url https://download.pytorch.org/whl/cpu
python -m pip install cmudict==1.1.3 pykakasi==2.3.0 pypinyin==0.55.0 Unidecode==1.4.0
```

`deploy/Build-Nnsvs.ps1` verifies dependencies and stages `.runtime/nnsvs`. It copies 7-Zip from `C:\Tools\7zip` for extraction of the checksum-pinned publisher N-Editor bundle; the installer is never executed. `deploy/Deploy-Nnsvs-Runtime.ps1` uploads Python independently from routine code changes. Configure `NNSVS_COMMAND`, optionally `NNSVS_PYTHON` / `NNSVS_WORKER`; deployed defaults are `singer/Singer.exe` and `nnsvs/python/python.exe`.

## Models and pronunciation

On Azure, the launcher unpacks the pinned runtime ZIP once into `C:\local\choirloom-nnsvs`, keyed by archive size and modification time. A process mutex and completion marker make interrupted preparation restartable. Subsequent Python imports use local disk; the original runtime archive, voice models and audio checkpoints remain in persistent storage. `Singer.exe --prepare-runtime true` prepares this cache and returns its Python path for operator checks.

For a first Azure deployment, run `Prepare-Nnsvs-Host.ps1`, then `Deploy-Nnsvs-Runtime.ps1`. Run the staged `Expand-Nnsvs-Runtime.ps1` on the host and wait for its extraction log to finish. Upload original model packages with `Deploy-Nnsvs-Voices.ps1`, then run the staged `Start-Nnsvs-Install.ps1`. Its status file in persistent data records an actual phrase render for each voice; missing original packages download from the catalog. Wait for all voices to complete before deploying the application code. Routine application deployments retain the runtime, model cache and phrase checkpoints. The .NET launcher builds into the fresh `.runtime/singer-nnsvs` directory and deploys as `singer`.

`config/voicebanks.json` contains original publisher URLs and checksums. Keep archives, extracted weights and publisher notices in the private shared cache. N-Editor shares one package across Cipher and Shia. The two checksum-pinned legacy ENUNU models use a one-time packing conversion, including their trusted old Python scaler/checkpoint objects. This conversion is unavailable to custom imports. All packed model inference uses PyTorch restricted weight loading; no publisher extension scripts run.

These models are Japanese. English uses CMU pronunciation plus Japanese phoneme approximation. Chinese uses pinyin; unlisted words use transliteration. Multi-note syllables use the whole word where possible; blank melismas retain the preceding vowel. Authored lyrics are never overwritten. Explicit `[en/b en/aa]` or `[ja/b ja/a]` is supported. An entirely untexted part uses its selected wordless pattern.

Ties join only equal-pitch contiguous notes. Lyrics are mapped before phrase splitting. Each phrase has score-derived timing and a content-keyed atomic audio checkpoint. Rests, tempo changes and repeated performance notes are handled before final stem mixing. The child exits when its Windows launcher exits; server job recovery reuses completed phrases.

## Validation

```
python workers/Nnsvs/test_worker.py
```

Set `NNSVS_PYTHON` to run the package-inspection integration tests in `npm test`. Every shipped voice additionally passes real phrase inference and WAV/MP3 verification; `config/voice-verification.json` records the results. These tests verify operation, not indistinguishability from a human singer.

## Third-party software

NNSVS and ENUNU are MIT licensed; their sources and notices are included in the portable runtime or available from [NNSVS](https://github.com/nnsvs/nnsvs) and [ENUNU](https://github.com/oatsu-gh/ENUNU). `legacy.py` adapts ENUNU's MIT `enulib/enunu2nnsvs.py`. PyTorch, NumPy, SciPy, CMUdict, PyKakasi, pypinyin, Unidecode, WORLD, utaupy and neural-vocoder dependencies retain their installed license notices. 7-Zip is LGPL with additional unRAR restrictions; [source and license](https://www.7-zip.org/license.txt). Publisher voice licenses are separate and linked per voice.
