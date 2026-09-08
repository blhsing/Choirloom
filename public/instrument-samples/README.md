# Choirloom instrument samples

All samples are CC0-1.0. See CC0.txt and config/instrument-sources.json for source locations pinned to upstream revisions.

- VCSL / Versilian Studios: Kawai piano, TX81Z electric piano, organ, marimba, tubular bells.
- VSCO 2 Community Edition / Versilian Studios: violin section, solo violin, flute, clarinet, trumpet.
- Jeff Learman / Discord SFZ GM: Martin HD28 steel-string guitar.
- Karoryfer / Discord SFZ GM: Killer electric bass.
- Roberto / FreePats: Spanish classical nylon-string guitar (2019-06-18).

Processed for browser preview: silence trimming, level normalization, 44.1 kHz 16-bit lossless FLAC encoding, and crossfaded sustain loops for held instruments. Pitch labels in the manifest use MIDI note numbers; differing upstream octave conventions are corrected. Only the required notes of the selected instrument are loaded and cached.

Rebuild using deploy/Build-Instrument-Samples.py (numpy, scipy, soundfile, and 7-Zip). Full upstream URLs and sample selections are in config/instrument-sources.json.
