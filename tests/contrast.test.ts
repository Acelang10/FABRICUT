import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../app/globals.css'), 'utf8')

const vars: Record<string, string> = {
  '--home-navy': '#0F1F4A',
  '--home-ink': '#0B1630',
  '--home-yellow': '#FFE34D',
  '--home-blue': '#1D4ED8',
  '--n': '#0F1F4A',
  '--y': '#FFE34D',
  '--b': '#1D4ED8',
  '--i': '#0B1630',
  '--s': '#E8F0FF',
  '--p': '#FFFEF6',
}

function specificity(selector: string) {
  const parts = selector.split(',').map(s => s.trim())
  return parts.map(part => {
    let tokens = part.replace(/::?[a-z-]+/gi, m => (m.startsWith('::') ? '' : '.pseudo'))
    const ids = (tokens.match(/#[\w-]+/g) || []).length
    const cls = (tokens.match(/\.[\w-]+/g) || []).length
    tokens = tokens.replace(/#[\w-]+/g, ' ').replace(/\.[\w-]+/g, ' ').replace(/\[[^\]]*]/g, ' ')
    const els = (tokens.match(/[a-zA-Z][\w-]*/g) || []).length
    return [ids, cls, els] as const
  })
}

function beats(winner: string, loser: string) {
  const a = specificity(winner)[0]
  const b = specificity(loser)[0]
  if (a[0] !== b[0]) return a[0] > b[0]
  if (a[1] !== b[1]) return a[1] > b[1]
  return a[2] > b[2]
}

function hexLum(hex: string) {
  const raw = hex.replace('#', '')
  const n = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw
  const ch = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255)
  const lin = ch.map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

function contrast(fg: string, bg: string) {
  const L1 = hexLum(fg)
  const L2 = hexLum(bg)
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1]
  return (hi + 0.05) / (lo + 0.05)
}

function resolveColor(value: string) {
  const trimmed = value.trim()
  const fromVar = trimmed.match(/^var\((--[\w-]+)\)$/)
  if (fromVar) {
    assert.ok(vars[fromVar[1]], `unknown CSS variable ${fromVar[1]}`)
    return vars[fromVar[1]]
  }
  assert.match(trimmed, /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  return trimmed
}

function declaration(selectorNeedle: string, property: string) {
  const escaped = selectorNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`${escaped}(?:\\s*,\\s*[^,{]+)*\\s*\\{([^}]+)\\}`, 'g')
  let match: RegExpExecArray | null
  let value = ''
  while ((match = re.exec(css))) {
    const prop = match[1].match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;}]+)`))
    if (prop) value = prop[1].trim()
  }
  assert.ok(value, `missing ${property} for ${selectorNeedle}`)
  return value
}

function hasStates(base: string) {
  for (const state of [':hover', ':focus-visible', ':visited']) {
    assert.match(css, new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + state))
  }
}

test('navy homepage buttons keep white text against .home-page a inherit', () => {
  assert.ok(beats('.home-page a.home-btn-navy', '.home-page a'))
  assert.ok(beats('.home-page a.home-chip', '.home-page a'))
  assert.equal(resolveColor(declaration('.home-page a.home-btn-navy', 'color')), '#fff')
  assert.equal(resolveColor(declaration('.home-page a.home-chip', 'color')), '#fff')
  hasStates('.home-page a.home-btn-navy')
  hasStates('.home-page a.home-chip')
  hasStates('.home-page a.home-btn-ghost')
  const navy = vars['--home-navy']
  const yellow = vars['--home-yellow']
  const ghost = resolveColor(declaration('.home-page a.home-btn-ghost', 'color'))
  assert.ok(contrast('#ffffff', navy) >= 4.5, 'white on navy must meet WCAG AA')
  assert.ok(contrast(ghost, yellow) >= 4.5, 'ghost navy on yellow must meet WCAG AA')
})

test('atelier and shop link buttons keep intended contrast against inherit', () => {
  assert.ok(beats('.atelier a.atelier-btn-b', '.atelier a'))
  assert.ok(beats('.atelier a.atelier-btn-y', '.atelier a'))
  assert.ok(beats('.atelier a.atelier-admin-link', '.atelier a'))
  assert.equal(resolveColor(declaration('.atelier a.atelier-btn-b', 'color')), '#fff')
  assert.equal(resolveColor(declaration('.atelier a.atelier-btn-y', 'color')), vars['--n'])
  assert.equal(resolveColor(declaration('.atelier a.atelier-admin-link', 'color')), vars['--b'])
  hasStates('.atelier a.atelier-btn-b')
  hasStates('.atelier a.atelier-btn-y')
  hasStates('.atelier a.atelier-admin-link')
  assert.ok(contrast('#ffffff', vars['--b']) >= 4.5, 'white on blue must meet WCAG AA')
  assert.ok(contrast(vars['--n'], vars['--y']) >= 4.5, 'navy on yellow must meet WCAG AA')
  assert.ok(contrast(vars['--b'], '#ffffff') >= 4.5, 'admin link blue on white must meet WCAG AA')
})

test('sign-in page uses a readable yellow, navy, and white combination', () => {
  assert.equal(resolveColor(declaration('.signin-page', 'background')), '#FFE34D')
  assert.equal(resolveColor(declaration('.signin-page', 'color')), '#0B1630')
  assert.equal(resolveColor(declaration('.signin-shell', 'background')), '#fff')
  assert.equal(resolveColor(declaration('.signin-left h1', 'color')), '#0B1630')
  assert.equal(resolveColor(declaration('.signin-submit', 'background')), '#0F1F4A')
  assert.equal(resolveColor(declaration('.signin-submit', 'color')), '#fff')
  assert.equal(resolveColor(declaration('.signin-submit:focus-visible', 'color')), '#fff')
  assert.equal(resolveColor(declaration('.signin-role button', 'background')), '#fff')
  assert.equal(resolveColor(declaration('.signin-role button', 'color')), '#0F1F4A')
  assert.equal(resolveColor(declaration('.signin-role button.on', 'background')), '#0F1F4A')
  assert.equal(resolveColor(declaration('.signin-role button.on', 'color')), '#fff')
  assert.equal(resolveColor(declaration('.signin-google', 'background')), '#fff')
  assert.equal(resolveColor(declaration('.signin-google', 'color')), '#0B1630')
  assert.equal(resolveColor(declaration('.signin-field input', 'background')), '#fff')
  assert.equal(resolveColor(declaration('.signin-field input', 'color')), '#0B1630')
  assert.match(declaration('.signin-field input', 'border'), /#7B869C/i)
  assert.equal(resolveColor(declaration('.signin-forgot', 'color')), '#1D4ED8')
  assert.equal(resolveColor(declaration('.signin-switch button', 'color')), '#1D4ED8')
  assert.equal(resolveColor(declaration('.signin-footer a', 'color')), '#1D4ED8')
  assert.ok(contrast('#0B1630', '#FFE34D') >= 4.5, 'ink on yellow page must meet WCAG AA')
  assert.ok(contrast('#0B1630', '#ffffff') >= 4.5, 'ink on white card must meet WCAG AA')
  assert.ok(contrast('#0F1F4A', '#ffffff') >= 4.5, 'navy on white must meet WCAG AA')
  assert.ok(contrast('#ffffff', '#0F1F4A') >= 4.5, 'white on navy button must meet WCAG AA')
  assert.ok(contrast('#1D4ED8', '#ffffff') >= 4.5, 'blue links on white must meet WCAG AA')
  assert.ok(contrast('#3E4A68', '#ffffff') >= 4.5, 'muted text on white must meet WCAG AA')
  assert.ok(contrast('#D6E2FF', '#1D4ED8') >= 4.5, 'right-panel text on blue must meet WCAG AA')
})

test('login back button is navy on yellow and metadata uses the Fabricut logo icons', () => {
  assert.equal(resolveColor(declaration('.signin-back', 'color')), '#0F1F4A')
  assert.equal(resolveColor(declaration('.signin-page a.signin-back', 'color')), '#0F1F4A')
  assert.match(declaration('.signin-back', 'background'), /transparent|#FFE34D/i)
  assert.ok(contrast('#0F1F4A', '#FFE34D') >= 4.5, 'back button navy on yellow must meet WCAG AA')
  hasStates('.signin-page a.signin-back')
  const login = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../components/Login.tsx'), 'utf8')
  assert.match(login, /href="\/"/)
  assert.match(login, /className="signin-back"/)
  assert.match(login, /aria-label="Back to home"/)
  const layout = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../app/layout.tsx'), 'utf8')
  assert.match(layout, /title:\s*'Fabricut'/)
  assert.match(layout, /\/icon-32\.png/)
  assert.match(layout, /\/icon-512\.png/)
  assert.match(layout, /\/apple-icon\.png/)
})
