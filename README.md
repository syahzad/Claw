# The Royal Claw — medieval fantasy claw machine

Static site (HTML + CSS + JS). No build step, no dependencies.

## Run locally
    npx serve .        # or any static server, e.g. python3 -m http.server

## Deploy to Vercel
1. Push this folder to a GitHub repo, then "Add New Project" on vercel.com and import it
   (Framework Preset: **Other**, no build command, output directory left empty).
2. Or from this folder:  `npx vercel --prod`

## Customise (all in game.js → CONFIG)
- `BALLS`            image links for the balls (local paths or full URLs; look for PASTE_IMAGE_URL_HERE)
- `SPECIAL_BALL`     image for PRINCE SYAHZAD OF XI-9 (triggers the VFX + "HE'S SO HANDSOME OMG!!")
- `MISS_CHANCE`      chance a reachable drop slips away (default 0.35)
- `RARITY_WEIGHTS`   COMMON / RARE / LEGENDARY odds (random, independent of the ball image)
- `CATCH_RADIUS`, `CLAW_SPEED`, `HIGHLIGHT_SPECIAL`
