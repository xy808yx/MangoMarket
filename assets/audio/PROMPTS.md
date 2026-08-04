# Mango Market music (Suno pipeline)

Generate with Suno, export MP3, drop the files in THIS folder with these
exact names, then deploy (bump CACHE in sw.js). The game plays them
automatically; until they exist it stays silent by design.

## day.mp3 (the market, daytime)

Prompt:
"Cheerful toy-town market theme, playful marimba and ukulele with a light
glockenspiel melody, gentle hand claps, warm and bouncy, kids game
background music, simple and sunny, moderate tempo around 100 bpm,
instrumental, no vocals, seamless loop"

## evening.mp3 (Lantern Dusk mode, after 6pm)

Prompt:
"Cozy evening lo-fi lullaby for a kids game, soft electric piano and warm
pads, gentle vibraphone sparkles like lanterns, slow and calm around 70
bpm, dreamy but happy, instrumental, no vocals, seamless loop"

Notes:
- Instrumental only, loopable ends (ask Suno for a seamless loop, then
  trim silence at both ends so the loop point does not click).
- Keep each under ~2 minutes / ~3 MB; they loop forever and live in the
  offline cache.
- Volume is set in js/sfx.js (MUSIC_GAIN); no need to master loud.
