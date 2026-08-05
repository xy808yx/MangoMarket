/* Mango Market regulars. Headless data: no DOM, no three.js. Eight named
   animals whose traits shape the stand math (SPEC.md Freshness). Traits map
   straight onto engine standOrder(opts): tender forces a big bill into the
   drawer, exact skips the change problem entirely. Customers with no trait
   take the engine's natural roll (keypad change, sometimes the drawer).

   species picks the world builder; duck and cat are the plaza regulars who
   walk over from their ambient spots. Barks are one line, simple words a
   new reader handles, and never counting language. */

export const CUSTOMERS = [
  { id: 'waddles', name: 'Waddles', species: 'duck',
    trait: { tender: 100 },
    hello: ['Quack! All I have is a $100 bill!', 'Quack quack! Lemonade day!'],
    happy: ['Quack! Big bills are easy for you!', 'Best stand in town. Quack!'] },
  /* Miso's lines may not mention money coming back. She pays exactly, so the
     gentle-first-session rule pins her first on every fresh save, which makes
     her hello the first sentence the game ever says at the stand, and the
     first change sale (with its teaching prompt) has not happened yet. */
  { id: 'miso', name: 'Miso', species: 'cat',
    trait: { exact: true },
    hello: ['Mrow. One lemonade, please!', 'Mrow. I brought my money.'],
    happy: ['Perfect. As expected.', 'Mrow. See you tomorrow.'] },
  { id: 'fern', name: 'Fern', species: 'fox',
    trait: { tender: 50 },
    hello: ['All I have is one big $50 bill!', 'A big bill! Can you count it out?'],
    happy: ['Clever change, clever bunny!', 'You are as clever as a fox!'] },
  /* The four toys. They took the slots of four flavour-only regulars (a
     beaver, a raccoon, a deer and an otter) rather than growing the roster:
     the queue length comes from engine.standVisits(), so a bigger roster
     would only make any one friend rarer. Pip stayed because Pip's line is
     the only thing tying the stand to Uncle Benny across town.
     NO TRAITS on any of them, on purpose: traits are what standOrder reads,
     and the curve was tuned and sim-verified against exactly three. */
  { id: 'taio', name: 'Taio', species: 'panda',
    hello: ['Bamboo makes me so thirsty!', 'Hi! One lemonade for a panda!'],
    happy: ['That was lovely. Nap time!', 'Thank you! You are the best.'] },
  { id: 'hippy', name: 'Hippy', species: 'hippo',
    hello: ['A big hippo needs a big drink!', 'Hippo coming through!'],
    happy: ['Splish splash, thank you!', 'Back to my puddle. Bye!'] },
  { id: 'shasha', name: 'Shasha', species: 'lion',
    hello: ['Roar! I mean, hello!', 'Roaring all day is thirsty work.'],
    happy: ['Roar! That was great!', 'My mane feels fluffier already!'] },
  { id: 'uncorn', name: 'Uncorn', species: 'unicorn',
    hello: ['Sparkle sparkle! Lemonade please!', 'I came here on a rainbow!'],
    happy: ['Sparkly! Thank you!', 'Off to find more rainbows!'] },
  { id: 'sunny', name: 'Pip', species: 'cub',
    hello: ['Uncle Benny says yours is the best!', 'Hi hi hi! Lemonade please!'],
    happy: ['Wow wow wow! Thank you!', 'I am telling everyone at school!'] }
];

export const BY_CUSTOMER_ID = Object.fromEntries(CUSTOMERS.map(c => [c.id, c]));

/* Cup sizes: per maps to a size so a changing price reads as a real menu,
   not a glitch. per comes from the engine (2..4). */
export const CUP_SIZES = { 2: 'Small', 3: 'Medium', 4: 'Large' };
