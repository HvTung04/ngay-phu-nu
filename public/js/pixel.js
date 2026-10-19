const SKIN = ['#f6d2a8', '#eab98a', '#d19a6f', '#b57a4d']
const HAIR = ['#2b1b17', '#4a2c1a', '#8a4b2a', '#d9a441', '#1f2a44', '#7a2f5a', '#c4553b']
const SHIRT = ['#e5484d', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16']
const PANTS = ['#1f2937', '#374151', '#0f172a', '#3f3f46', '#1e3a5f']

export function hashOf(text) {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return hash
}

export function colorSet(name) {
  const hash = hashOf(String(name ?? ''))
  return {
    skin: SKIN[hash % SKIN.length],
    hair: HAIR[(hash >> 3) % HAIR.length],
    shirt: SHIRT[(hash >> 6) % SHIRT.length],
    pants: PANTS[(hash >> 9) % PANTS.length],
  }
}

const EYE = '#241a15'

export function runnerSvg(name) {
  const c = colorSet(name)
  const label = String(name ?? '').replace(/[<>&"]/g, '')
  return `<svg class="runner" viewBox="0 0 16 20" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">
  <g class="r-body">
    <g class="r-arm r-arm-a">
      <rect x="3" y="9" width="2" height="5" fill="${c.skin}"/>
    </g>
    <g class="r-arm r-arm-b">
      <rect x="11" y="9" width="2" height="5" fill="${c.skin}"/>
    </g>
    <rect x="4" y="8" width="8" height="6" fill="${c.shirt}"/>
    <rect x="7" y="8" width="2" height="6" fill="#00000018"/>
    <g class="r-leg r-leg-a">
      <rect x="5" y="14" width="2" height="4" fill="${c.pants}"/>
      <rect x="4" y="18" width="3" height="1" fill="${EYE}"/>
    </g>
    <g class="r-leg r-leg-b">
      <rect x="9" y="14" width="2" height="4" fill="${c.pants}"/>
      <rect x="9" y="18" width="3" height="1" fill="${EYE}"/>
    </g>
    <rect x="4" y="3" width="8" height="6" fill="${c.skin}"/>
    <rect x="4" y="1" width="8" height="3" fill="${c.hair}"/>
    <rect x="4" y="4" width="1" height="2" fill="${c.hair}"/>
    <rect x="11" y="4" width="1" height="2" fill="${c.hair}"/>
    <rect x="6" y="5" width="1" height="1" fill="${EYE}"/>
    <rect x="9" y="5" width="1" height="1" fill="${EYE}"/>
  </g>
</svg>`
}

export function runnerCss(extraClass = '') {
  return `<style>
  .runner{display:block;width:100%;height:100%;image-rendering:pixelated;overflow:visible}
  .runner .r-body{transform-box:fill-box;transform-origin:center bottom;animation:rnBob .24s steps(2) infinite}
  .runner .r-leg,.runner .r-arm{transform-box:fill-box;transform-origin:center top}
  .runner .r-leg-a{animation:rnSwingA .24s steps(4) infinite}
  .runner .r-leg-b{animation:rnSwingB .24s steps(4) infinite}
  .runner .r-arm-a{animation:rnSwingB .24s steps(4) infinite}
  .runner .r-arm-b{animation:rnSwingA .24s steps(4) infinite}
  @keyframes rnBob{0%{transform:translateY(0)}50%{transform:translateY(-1px)}100%{transform:translateY(0)}}
  @keyframes rnSwingA{0%{transform:rotate(-22deg)}100%{transform:rotate(18deg)}}
  @keyframes rnSwingB{0%{transform:rotate(18deg)}100%{transform:rotate(-22deg)}}
  .runner.idle .r-body{animation:rnIdle 1.2s ease-in-out infinite}
  .runner.idle .r-leg-a,.runner.idle .r-leg-b,
  .runner.idle .r-arm-a,.runner.idle .r-arm-b{animation:none;transform:rotate(0deg)}
  @keyframes rnIdle{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
  .runner.done .r-leg-a,.runner.done .r-leg-b,
  .runner.done .r-arm-a,.runner.done .r-arm-b{animation:none;transform:rotate(0deg)}
  .runner.done .r-body{animation:rnCheer .4s steps(2) infinite}
  @keyframes rnCheer{0%{transform:translateY(0)}50%{transform:translateY(-3px)}100%{transform:translateY(0)}}
  ${extraClass}
  </style>`
}