# Mango Market

A small voxel market game for young players learning subtraction. Buy food
and toys, run a lemonade stand, and make change.

Play it: https://xy808yx.github.io/MangoMarket/

## How it works

Subtraction shows up the way it does in real life. You hand over a bill and
work out the change, or a customer buys three cups of lemonade and you count
back what they are owed. There are no timers, no lost money and no fail
states: a wrong answer gets a retry, then a column scaffold that solves it
with you and completes the sale either way.

The town opens in chunks. A new save starts fenced into the market square
with one thing to do, the lemonade stand, and each new part of town unlocks
as you keep playing.

## Running it locally

No build step. It is plain ES modules, so any static file server works:

    python3 -m http.server 8230

Then open http://localhost:8230. The service worker is skipped on localhost
so you never test against a stale cache.

    node tools/sim.mjs      # math engine regression harness
    node tools/fresh.mjs    # date-seeded content harness

Both should pass before and after any change to the engine or the save.

## Layout

    js/engine.js      math engine, headless (no DOM, no three.js)
    js/save.js        save schema and migration
    js/zones.js       which parts of town are open
    js/world.js       the 3D town
    js/grocery.js     walk-in store interior
    js/room.js        the player's room
    js/store.js       main flow controller
    js/stand.js       lemonade stand
    js/ui.js          keypad, column scaffold, bills
    js/data/          catalog and customers
    tools/            headless test harnesses

## Credits

Built with [three.js](https://threejs.org) r185, MIT licensed, vendored in
`vendor/`. Everything else is original.
