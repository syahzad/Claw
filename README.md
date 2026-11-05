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

## Controls
| | Keyboard / mouse | Controller (DualShock 3 / any gamepad) |
|---|---|---|
| Move claw | WASD / arrow keys, or drag the joystick | Left stick (or D-pad) |
| Camera | Drag the glass, V = next view, double-click = reset | Right stick, L1/R1 = views, R3 = reset |
| Drop / release | Space / Enter, or the red button | X (cross) or R2 |
| Rotate machine (laptops) | Q = left, E = right, or the footer buttons | – |

Press any controller button once so the browser wakes it up.

## Carrying a prize
After the claw lifts a ball you steer it to the chute yourself and press the button again (RELEASE) over the chute.
Move too fast or reverse sharply and the ball swings out of the cradle and falls (`GRIP_STRENGTH`, `CRADLE_STIFFNESS`).
The Prince is the only ball with a random slip (`PRINCE_MISS_CHANCE`).

## Rotating the machine
Turn the laptop on its side, then press ROTATE MACHINE → LEFT or RIGHT (or Q / E) so the tall machine uses the long side of the screen.
Mouse drags, the joystick and the pop-up all follow the rotation.
