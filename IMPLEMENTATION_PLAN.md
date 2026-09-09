# Choirloom implementation decisions

[README.md](README.md) documents the implemented system. These decisions supersede the earlier OCI-first proposal.

## Product

- Create ensembles from lead melodies, import lyric-bearing songs, or compose new melodies/songs from prompts.
- Select one to 24 parts, independent voice types/ranges, multiple styles/textures, and reasoning effort.
- Arrangement mode preserves the lead; creation/revision prompts can change melody and lyrics. Locked notes remain protected.
- English and Traditional Chinese; browser-based initial language, persisted explicit preferences, and a 12px minimum interface text size.
- Settings has one upper-right entry. BPM has direct numeric, step, slider, and tap controls.
- Wordless options: ah, woooo, ba-ba-bom, da-da-dum, scat. Authored lyrics take precedence.

## Persistence and access

- Signup uses name, unique normalized email, and password, without email verification.
- Preferences, works, revisions, chats, references, and job outcomes persist.
- Browser closure/disconnection does not cancel submitted work. Reconnection restores a snapshot; each user/project resumes its Codex conversation.
- References support dialog/drag-and-drop uploads and @ autocomplete. Completed replies link to reviewable, continuable score revisions.
- Only admins manage shared ChatGPT OAuth. Admins can assign roles and inspect all works; last-admin protection applies.
- Admin read access does not automatically grant editing another owner’s work.
- Business-state updates use WebSockets. Redacted server/browser logs are persisted and admin-viewable; browser buffers upload at the next opportunity.

## Engines and hosting

- Use the existing Windows Azure App Service at `/Choirloom/`; no added paid service or plan upgrade.
- IISNode hosts the Node API and frontend, separately from existing virtual applications.
- NNSVS phrase inference uses a portable Python runtime with a C#/.NET launcher and MP3 export. Score-image conversion uses Codex GPT-6 Astra with low reasoning, per-sheet visual transcription and verification.
- Assets live on Azure. Workers verify hashes and read local assets or fetch HTTPS copies.
- No Choirloom service currently runs on OCI. If future measurements justify placing a worker there, access OCI directly without a proxy and use an unoccupied port.
- Durable data stays outside application deployments; temporary engine caches are regenerable.

## Catalogs and export

- OpenScore Lieder provides a pinned, browsable/filterable catalog of completed lyric-bearing MusicXML editions. Users preview a vocal part and import a new work with attribution.
- The voice catalog displays all configured voices by default. Downloads are shared globally; any user can download and only admins remove them. The initial independent bank is Qixuan.
- PDF/SVG/PNG/MusicXML/MXL/MIDI/JSON/WAV/MP3 exports support any subset of voices, combined or separate. Matching rendered stems can be remixed without resynthesis.

## Boundaries

- Monophonic parts and one meter/key; recognition/imports and AI output require musical review.
- Host restarts interrupt native jobs; those are retryable rather than silently stuck.
- Single Node process, SQLite, and in-process event distribution; horizontal scaling needs coordination.
- Password recovery needs configured SMTP. Binary assets, credentials, and user data stay outside the public repository.

- Bar-range prompts enforce unchanged notes outside the range and in untargeted voices. Individual/composer views, playback note/lyric highlighting, and optional auto-follow are supported.
