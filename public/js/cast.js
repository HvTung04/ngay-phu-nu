// Nhan vat lay tu "16x16 DungeonTileset II" cua 0x72, CC0 1.0.
// Moi sheet la 4 frame chay lien nhau theo hang ngang, kich thuoc khac nhau
// nen khai bao rieng tung nhan vat trong META.

const META = {
  big_demon: { fw: 32, fh: 36 },
  big_zombie: { fw: 32, fh: 34 },
  chort: { fw: 16, fh: 24 },
  elf_f: { fw: 16, fh: 28 },
  elf_m: { fw: 16, fh: 28 },
  goblin: { fw: 16, fh: 16 },
  ice_zombie: { fw: 16, fh: 16 },
  imp: { fw: 16, fh: 16 },
  knight_f: { fw: 16, fh: 28 },
  knight_m: { fw: 15, fh: 22 },
  lizard_f: { fw: 16, fh: 28 },
  lizard_m: { fw: 16, fh: 28 },
  masked_orc: { fw: 16, fh: 20 },
  muddy: { fw: 16, fh: 16 },
  necromancer: { fw: 16, fh: 20 },
  ogre: { fw: 32, fh: 32 },
  orc_shaman: { fw: 16, fh: 20 },
  orc_warrior: { fw: 16, fh: 20 },
  skelet: { fw: 16, fh: 16 },
  swampy: { fw: 16, fh: 16 },
  tiny_zombie: { fw: 16, fh: 16 },
  wizzard_f: { fw: 16, fh: 28 },
  wizzard_m: { fw: 16, fh: 28 },
  wogol: { fw: 16, fh: 20 },
  zombie: { fw: 16, fh: 16 },
}

export const CAST = Object.keys(META)

// 12 slot, moi slot mot nhan vat khac nhau: nguoi, elf, phap su, than lan, orc, quai.
const SLOT_CAST = [
  'knight_f', 'knight_m', 'elf_f', 'elf_m', 'wizzard_f', 'wizzard_m',
  'lizard_f', 'lizard_m', 'orc_shaman', 'orc_warrior', 'chort', 'goblin',
]

export function hashOf(text) {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return hash
}

export function castFileForSlot(slot) {
  const i = ((slot % SLOT_CAST.length) + SLOT_CAST.length) % SLOT_CAST.length
  return SLOT_CAST[i]
}

export function castFileForName(name) {
  return CAST[hashOf(String(name ?? '')) % CAST.length]
}

export function randomCast() {
  return CAST[Math.floor(Math.random() * CAST.length)]
}

export function isCast(file) {
  return typeof file === 'string' && CAST.includes(file)
}

export function castHtml({ slot = null, name = '', cast = null, size = null, fitH = null, fitW = null, anim = 'walk' } = {}) {
  let file = isCast(cast) ? cast : null
  if (!file) file = slot === null || slot === undefined ? castFileForName(name) : castFileForSlot(slot)
  const meta = META[file] ?? META.elf_f
  let s = size
  if (!s && fitH) s = Math.max(1, Math.min(Math.floor(fitH / meta.fh), Math.floor((fitW ?? fitH) / meta.fw)))
  if (!s) s = 3
  const style =
    `--s:${s};--fw:${meta.fw};--fh:${meta.fh};--frames:4;` +
    `--sheet:url('/img/cast/${file}.png')`
  return `<span class="cast ${anim}" style="${style}" aria-hidden="true"></span>`
}

export function castCss() {
  return `<style>
  .cast{
    display:inline-block;
    width:calc(var(--fw) * var(--s) * 1px);
    height:calc(var(--fh) * var(--s) * 1px);
    background-image:var(--sheet);
    background-repeat:no-repeat;
    background-size:calc(var(--fw) * var(--frames) * var(--s) * 1px) calc(var(--fh) * var(--s) * 1px);
    image-rendering:pixelated;
  }
  .cast.walk{animation:castWalk .5s steps(var(--frames)) infinite}
  @keyframes castWalk{
    from{background-position-x:0}
    to{background-position-x:calc(-1px * var(--fw) * var(--frames) * var(--s))}
  }
  .cast.idle{animation:castBob 1.2s ease-in-out infinite}
  @keyframes castBob{
    0%,100%{transform:translateY(0)}
    50%{transform:translateY(-3px)}
  }
  </style>`
}
