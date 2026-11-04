# The Royal Claw — medieval fantasy claw machine (v2)

Static site (HTML + CSS + JS). No build step, no dependencies, no backend / Redis.

    your-repo/
    ├── index.html
    ├── style.css
    ├── game.js
    ├── vercel.json
    └── balls/            ← your medallion images

Deploy: push to GitHub → import on Vercel (Framework Preset: Other). Or `npx vercel --prod`.

Everything tweakable is in the CONFIG block at the top of game.js
(ball links, grip precision, miss chances, rarity odds, physics feel).

## Camera
Drag the glass to orbit the machine in real 3D, double-click to reset, or use the FRONT / 3/4 / SIDE / TOP tabs
(keyboard: V cycles views). The joystick is camera-relative (`CAMERA_RELATIVE_CONTROLS` in CONFIG).
