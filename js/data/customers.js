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
  { id: 'miso', name: 'Miso', species: 'cat',
    trait: { exact: true },
    hello: ['My money is just right. It always is.', 'Mrow. No money back for me!'],
    happy: ['Perfect. As expected.', 'Mrow. See you tomorrow.'] },
  { id: 'fern', name: 'Fern', species: 'fox',
    trait: { tender: 50 },
    hello: ['All I have is one big $50 bill!', 'A big bill! Can you count it out?'],
    happy: ['Clever change, clever bunny!', 'You are as clever as a fox!'] },
  { id: 'maple', name: 'Maple', species: 'beaver',
    hello: ['Chewing wood is thirsty work!', 'Straight from the river. So thirsty!'],
    happy: ['Back to the dam. Thanks!', 'Tastes better than river water!'] },
  { id: 'rocky', name: 'Rocky', species: 'raccoon',
    hello: ['Fresh lemonade! My favorite!', 'I washed my paws, promise!'],
    happy: ['Worth every dollar!', 'So good I want seconds!'] },
  { id: 'bella', name: 'Bella', species: 'deer',
    hello: ['A twirl, a sip, a twirl!', 'Dancers get so thirsty!'],
    happy: ['Lovely! Time to twirl home.', 'So yummy! Time to dance!'] },
  { id: 'ollie', name: 'Ollie', species: 'otter',
    hello: ['Just swam the whole bay!', 'Splashy and ready for lemonade!'],
    happy: ['Splash! That was great!', 'That was splashy good!'] },
  { id: 'sunny', name: 'Pip', species: 'cub',
    hello: ['Uncle Benny says yours is the best!', 'Hi hi hi! Lemonade please!'],
    happy: ['Wow wow wow! Thank you!', 'I am telling everyone at school!'] }
];

export const BY_CUSTOMER_ID = Object.fromEntries(CUSTOMERS.map(c => [c.id, c]));

/* Cup sizes: per maps to a size so a changing price reads as a real menu,
   not a glitch. per comes from the engine (2..4). */
export const CUP_SIZES = { 2: 'Small', 3: 'Medium', 4: 'Large' };
