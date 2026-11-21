/**
 * Every word in the toy, in English. Almost everything is pictures; most of these
 * words are read out by screen readers, and a few appear in Settings. To add a
 * language, copy this file (for example to th.ts), translate the values, and
 * register it in index.ts. Text in {curly braces} is filled in by the toy.
 *
 * Cosmetic names live under `names`, as "kind/id". A new cosmetic without a name
 * here is called by its id ("flower-crown" → "Flower crown").
 */
export const en = {
  title: 'Bubble Pop',
  madeBy: 'Made by KumoPlay',
  version: 'Version {version}',
  close: 'Close',
  toysLabel: 'Toys',
  toys: {
    wrap: 'Bubble wrap',
    soap: 'Soap bubbles',
    cloud: 'Squishy cloud',
  },
  /** Read out for the play area of each toy. */
  stage: {
    wrap: 'A sheet of bubble wrap. Tap or slide over the bubbles to pop them.',
    soap: 'Soap bubbles. Press and hold to blow bubbles, sweep to send them drifting, and touch them to pop them.',
    cloud: 'A squishy cloud. Poke it, pinch it and stretch it.',
  },
  bar: {
    collection: 'Collection',
    collectionNew: 'Collection, something new',
    settings: 'Settings',
  },

  collection: {
    title: 'Collection',
    sections: {
      'wrap-color': 'Colors',
      'wrap-pattern': 'Patterns',
      wand: 'Wands',
      face: 'Faces',
      hat: 'Hats',
    } as Record<string, string>,
    mix: 'Mix them all',
    locked: 'Not found yet',
    isNew: 'new',
  },

  names: {
    'wrap-color/petal': 'Petal pink',
    'wrap-color/sky': 'Sky blue',
    'wrap-color/mint': 'Mint',
    'wrap-color/butter': 'Butter',
    'wrap-color/lilac': 'Lilac',
    'wrap-color/peach': 'Peach',
    'wrap-color/lavender': 'Lavender',
    'wrap-color/clear': 'Clear',
    'wrap-color/gold': 'Gold',
    'wrap-pattern/classic': 'Classic',
    'wrap-pattern/mini': 'Mini',
    'wrap-pattern/big': 'Big',
    'wrap-pattern/hearts': 'Hearts',
    'wrap-pattern/stars': 'Stars',
    'wrap-pattern/clouds': 'Clouds',
    'wrap-pattern/flowers': 'Flowers',
    'wrap-pattern/kumo': 'Kumo',
    'wand/round': 'Round wand',
    'wand/heart': 'Heart wand',
    'wand/star': 'Star wand',
    'wand/flower': 'Flower wand',
    'wand/cloud': 'Cloud wand',
    'wand/rainbow': 'Rainbow wand',
    'face/classic': 'Classic face',
    'face/sparkle': 'Sparkly eyes',
    'face/kitty': 'Kitty',
    'face/lashes': 'Lashes',
    'face/freckles': 'Freckles',
    'face/sunny': 'Sunny',
    'face/star-eyes': 'Star eyes',
    'hat/none': 'No hat',
    'hat/bow': 'Bow',
    'hat/beret': 'Beret',
    'hat/flower-crown': 'Flower crown',
    'hat/party': 'Party hat',
    'hat/beanie': 'Beanie',
    'hat/strawberry': 'Strawberry hat',
    'hat/crown': 'Crown',
  } as Record<string, string>,

  settings: {
    title: 'Settings',
    sound: 'Sounds',
    ambience: 'Background sound',
    ambienceOff: 'Off',
    breeze: 'Breeze',
    chimes: 'Chimes',
    ambienceVolume: 'Background volume',
    haptics: 'Buzz on pops',
    calm: 'Calm motion',
    calmHelp: 'Fewer sparkles, softer wobbles',
    install: 'Add to Home Screen',
    installHelp: 'Opens full screen and works without internet.',
    installIos: 'In Safari, tap Share, then “Add to Home Screen”.',
    installMenu: 'Use your browser’s menu to add it to your home screen.',
    reset: 'Start over',
  },

  reset: {
    title: 'Start over?',
    body: 'Your collection, choices and settings will be cleared. This cannot be undone.',
    keep: 'Keep everything',
    hold: 'Hold to start over',
  },

  otherTab: {
    body: 'Bubble Pop is open in another tab.',
    here: 'Play here',
  },

  saveTooNew: 'This toy was saved by a newer version. Reload the page to update; until then nothing new is saved.',
};

export type Strings = typeof en;
