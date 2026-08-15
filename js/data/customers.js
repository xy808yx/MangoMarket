/* Mango Market regulars. Headless data: no DOM, no three.js. Eight named
   animals whose traits shape the stand math (SPEC.md Freshness). Traits map
   straight onto engine standOrder(opts): tender forces a big bill into the
   drawer, exact skips the change problem entirely. Customers with no trait
   take the engine's natural roll (keypad change, sometimes the drawer).

   species picks the world builder; duck and cat are the plaza regulars who
   walk over from their ambient spots.

   VOICE RULES (do not regress):
   - NO ANIMAL NOISES. "Mrow", "Quack", "Roar!", "Sparkle sparkle" and
     "Splish splash" all shipped as greetings and read as gibberish to a
     young player who is decoding every word: the first sentence the game
     ever said at the stand was "Mrow." A character may act like their
     animal ("Roaring is thirsty work"), never sound like one.
   - Never counting language, and never speed praise: automaticity pressure
     belongs to the separate drill app, and "you counted that out fast" is
     both at once. Fern used to ask "Can you count it out?"
   - Three moments, three jobs. hello is who they are, and it never states
     the order (the order is appended to the same bubble by stand.js, so a
     hello that also orders reads as a stutter). paying is said while the
     money is handed over, which is where a big-bill apology belongs: it
     lands when the bill actually matters instead of two cards early.
     happy is the goodbye.
   - paying is OPTIONAL, and only for an exact payer: with no change problem
     the sale runs total -> celebration and never renders the paying phase at
     all, so a line written there could never be read. Miso carries none.
     Everyone else must have one; stand.js falls back to the hello rather
     than throwing, but a missing line is a data mistake, not a style.
   - One or two short sentences per line, plain words, no adult deadpan.
     Miso's old "Perfect. As expected." was the cat sounding unimpressed at
     a five year old who had just got it right. */

export const CUSTOMERS = [
  { id: 'waddles', name: 'Waddles', species: 'duck',
    trait: { tender: 100 },
    hello: ['Lemonade day is my favourite day!', 'I waddled all the way here!'],
    paying: ['Here you go! Sorry it is such a big one.',
      'This is the only money I have on me!'],
    happy: ['You are so good with big money!', 'Best stand in the whole town!'] },
  /* Miso's lines may not mention money coming back. She pays exactly, so the
     gentle-first-session rule pins her first on every fresh save, which makes
     her hello the first sentence the game ever says at the stand, and the
     first change sale (with its teaching prompt) has not happened yet. */
  { id: 'miso', name: 'Miso', species: 'cat',
    trait: { exact: true },
    hello: ['Hello! I brought my money.', 'I have been waiting all morning!'],
    /* No paying line, and there is no writing one: she pays on the nose, so
       standOrder returns no problem and the sale goes straight from the total
       to the celebration. */
    happy: ['That was so good. Thank you!', 'See you tomorrow!'] },
  { id: 'fern', name: 'Fern', species: 'fox',
    trait: { tender: 50 },
    hello: ['I ran here all the way from the woods.', 'A fox gets thirsty running!'],
    paying: ['Here! My money is all in one big bill.',
      'Sorry, this is the smallest one I have!'],
    happy: ['You worked that out just right!', 'Clever, just like a fox!'] },
  /* The four toys. They took the slots of four flavour-only regulars (a
     beaver, a raccoon, a deer and an otter) rather than growing the roster:
     the queue length comes from engine.standVisits(), so a bigger roster
     would only make any one friend rarer. Pip stayed because Pip's line is
     the only thing tying the stand to Uncle Benny across town.
     NO TRAITS on any of them, on purpose: traits are what standOrder reads,
     and the curve was tuned and sim-verified against exactly three. */
  { id: 'taio', name: 'Taio', species: 'panda',
    hello: ['All that bamboo made me thirsty!', 'A panda needs a cold drink!'],
    paying: ['Here you go!', 'I saved up for this.'],
    happy: ['That was lovely. Nap time!', 'Thank you! You are the best.'] },
  { id: 'hippy', name: 'Hippy', species: 'hippo',
    hello: ['A big hippo needs a big drink!', 'Make room, hippo coming through!'],
    paying: ['Here is my money!', 'Take this, please!'],
    happy: ['That hit the spot. Thank you!', 'Back to my puddle now. Bye!'] },
  { id: 'shasha', name: 'Shasha', species: 'lion',
    hello: ['Roaring is thirsty work!', 'Hello! I heard about this stand.'],
    paying: ['Here you go!', 'This should do it!'],
    happy: ['That was great! Thank you.', 'My mane feels fluffier already!'] },
  { id: 'uncorn', name: 'Uncorn', species: 'unicorn',
    hello: ['I flew here on a rainbow!', 'My rainbow ends right at your stand!'],
    paying: ['Here you go!', 'I brought my rainbow money.'],
    happy: ['That tasted like sunshine!', 'Off to find more rainbows!'] },
  { id: 'sunny', name: 'Pip', species: 'cub',
    hello: ['Uncle Benny says yours is the best!', 'Hello! I ran the whole way.'],
    paying: ['Here you go!', 'I brought all of it!'],
    happy: ['Wow! Thank you!', 'I am telling everyone at school!'] }
];

export const BY_CUSTOMER_ID = Object.fromEntries(CUSTOMERS.map(c => [c.id, c]));

/* Cup sizes: per maps to a size so a changing price reads as a real menu,
   not a glitch. per comes from the engine (2..4). */
export const CUP_SIZES = { 2: 'Small', 3: 'Medium', 4: 'Large' };
