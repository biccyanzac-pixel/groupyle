# The category bank

Every Groupyle puzzle is built in the browser from the date, out of the hand-curated categories in `site/js/bank/`.
This file is the house style for writing and reviewing them.

## One category

```js
{
  id: 'planets',                 // unique, lowercase-kebab, stable forever. Never reuse an id, even a retired one.
  name: 'Planets',               // shown when the group is found. Short (≤ 32 characters), sentence case.
  tier: 1,                       // 1 obvious · 2 clear · 3 tricky · 4 wordplay (see below)
  family: ['space'],             // 1–2 themes from the list below. Categories that share a family are look-alikes:
                                 // the generator puts them together on harder days as red herrings.
  words: ['MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'EARTH'],
  also: ['PLUTO'],               // other words that ALSO fit (weaker, debatable or not shown). Never shown as members
                                 // of this group, but a puzzle with this group never shows them in another group.
  rule: { hidden: ['CAT'] },     // optional, wordplay only: a mechanical test (below)
  added: '2026-10-19',           // first day the category may appear. Never change it.
}
```

### Words

- **A–Z only, 3–10 letters, uppercase, no spaces or punctuation.** They must fit a tile on a 360 px phone.
- **6 to 10 `words`** (8 is ideal). The generator shows 4, and needs spares when some clash with other groups.
- Every word in `words` must belong **clearly and uncontroversially**. A solver who knows the category must agree at
  once. When in doubt, move it to `also`.
- Prefer words most people know (a UK/US general audience). No slurs, nothing gory or sexual, no living politicians.
- Avoid words that are mostly known as another category's member in an obvious way, unless that's the herring you want.
- Plurals and singulars: pick one form per category and stay with it (`words` are what's shown).

### `also`: the safety net

The puzzle promises that **no word on the board fits two of the day's groups**. The generator enforces this with
`words + also + rule`: a word may be shown in group A only if it isn't in group B's `words`, `also`, or `rule`.
So `also` should list **every reasonably common word that fits this category**, especially ones that appear
elsewhere in the bank. Be generous: an extra `also` word costs nothing; a missing one makes an unfair puzzle.

Example: `Things with keys` → words `PIANO, KEYBOARD, LOCKSMITH, MAP, TYPEWRITER, ACCORDION`, also `CODE, ORGAN,
JANITOR, FLORIDA, LAPTOP, CLARINET, FLUTE, SAXOPHONE, CIPHER, ANSWER, CASTLE, JAILER, LEGEND`.

### Tiers

| Tier | Feel | Examples |
| --- | --- | --- |
| 1 | Obvious closed set, plain meanings. Monday. | Planets, Chess pieces, Pasta shapes, Farm animals |
| 2 | Clear once seen, a little general knowledge. | Things with shells, Poker terms, Famous ships, Units of length |
| 3 | Tricky: less obvious link, a word used in a less common sense, or a narrower field. | Things that can be pitched, Bond villains, ___ cake (fruit, cup, pan…) |
| 4 | Wordplay: hidden words, homophones, anagrams, "add a letter", words before or after X. | Hidden animals (sCATter), Sounds like letters (SEA, TEA, EYE), Starts with a body part (ARMADA, LEGEND) |

Categories of the form "___ X" or "X ___" (compound words, phrases) are tier 3 or 4 and list every common compound
in `words`/`also` (FIRE___: FIREWORK, FIREPLACE, FIREMAN, FIREFLY, FIREARM, FIREWALL, FIREBALL, FIRESIDE, FIRECRACKER…).

### `rule`: mechanical tests for wordplay

For wordplay the generator also checks every other word on the board against the rule, so a sneaky second fit can't
slip through. A word fits when (all comparisons on the uppercase word):

| Rule | Fits when |
| --- | --- |
| `{ hidden: ['CAT', 'DOG'] }` | the word contains one of the strings |
| `{ starts: ['ARM', 'LEG'] }` | the word starts with one of the strings (and is longer than it) |
| `{ ends: ['BALL'] }` | the word ends with one of the strings (and is longer than it) |

Hidden-word rules must list **every** short word of that kind the generator should guard against (for hidden animals:
CAT, DOG, RAT, EEL, APE, EMU, OWL, ANT, BEE, HEN, COW, PIG, YAK, ELK, GNU, BAT, ASP, COD, RAM, EWE, SOW, BOAR, MOLE,
HARE, DEER, LION, MOTH, WASP, TOAD, CROW, SWAN, DOVE, GOAT, BEAR, CALF, LAMB, MULE, PONY, SEAL, ORCA, KOALA, OTTER…),
and the members must hide one clearly (`SCATTER` hides CAT, `PIGMENT` hides PIG, `HOWLER` hides OWL). Avoid members where the hidden word is also the word's real meaning.

### Families (red herrings)

Use these; add a new one only if nothing fits. Two categories sharing a family should *look* related, so a solver might
mix their words up: Planets (space) and Roman gods (mythology, space); Card games (cards) and Poker terms (cards).

```
animals birds fish insects pets farm sea dogs
food fruit vegetables baking cheese drinks cocktails sweets kitchen cooking
music instruments bands dance theatre film tv books art fashion clothing shoes hats
sport football cricket tennis golf boxing games cards chess toys puzzles
body medicine science chemistry physics maths computing internet money business law
space weather nature plants trees flowers gems metals rocks colours shapes
geography countries cities capitals rivers islands mountains europe usa uk
mythology religion royalty history military ships cars transport aviation trains
house furniture tools jobs school language letters numbers time calendar
emotions people names famous-people crime spies magic halloween christmas
words wordplay homophones hidden anagrams compounds
```

### Freezing

Once a category's `added` day is in the past, **never edit or delete it**: past puzzles are rebuilt from it every
time someone opens the archive. To fix one later, add an erratum in `site/js/bank/errata.js` with a `from` day after
tomorrow (UTC). New categories need an `added` day after tomorrow. `npm test` checks every day against
`test/golden.json`, and `npm run golden` re-records only days after tomorrow.

## Reviewing

`node tools/review-bank.mjs` checks the format and prints, for every pair of categories, the words they share, and
every word that a `rule` catches in another category. Each of those is fine *only* if the word sits in the other
category's `words` or `also` too (so the generator knows they clash). The review checklist for a person or agent:

1. Does every `words` member clearly belong? Move anything debatable to `also`, delete anything wrong.
2. Read the whole bank's vocabulary: which words from *other* categories also fit this one? Add them to `also`.
3. Is the tier right? Is the name short and fair? Would a solver who found the group agree with the name?
4. Do the families make sense, and do they pair categories a solver could actually confuse?
