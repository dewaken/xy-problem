const form = document.querySelector('#analyze-form')
const input = document.querySelector('#question')
const button = document.querySelector('#submit-button')
const buttonLabel = document.querySelector('#button-label')
const result = document.querySelector('#result')
const card = document.querySelector('#result-card')
const empty = document.querySelector('#empty-state')
const loading = document.querySelector('#loading-state')
const error = document.querySelector('#error')
const live = document.querySelector('#live-status')
const staleNote = document.querySelector('#stale-note')
const exampleButtons = document.querySelectorAll('[data-example]')
const langButtons = document.querySelectorAll('[data-lang]')

const MIN_LENGTH = 10
const MAX_LENGTH = 3000
// 判定サービス側のタイムアウト（20秒）より少し長く待ち、サーバーからのエラーを優先して表示する。
const CLIENT_TIMEOUT_MS = 25000
const LANGS = ['ja', 'en']
const LANG_STORAGE_KEY = 'xy-lang'

// ---- 表示の言語 ----
// 日本語の静的な文言は index.html にだけ書き、読み込み時に DOM から集める（二重に持たない）。
// ここには、英語の静的な文言と、スクリプトが作る文言（両言語）を持つ。
// 例文は scripts/eval-cases.ts のケースと揃えている。変えたら eval で判定を確かめる。
const dynamic = {
  ja: {
    title: 'XY問題チェッカー — 問いを、ひとつ手前から。',
    check: 'チェックする',
    checking: 'チェック中…',
    stale: '文章が変わりました。もう一度チェックすると、結果が更新されます。',
    staleLanguage: '表示の言語を切り替えました。もう一度チェックすると、結果もこの言語になります。',
    stated: '書かれている',
    notStated: '書かれていない',
    likely: (probability) => `書かれている可能性 ${probability}%`,
    heading: (label) => `【${label}】`,
    lengthError: '10〜3,000文字で入力してください。',
    timeout: '応答に時間がかかっています。少し待ってから、もう一度お試しください。',
    network: '通信できませんでした。接続を確認して、もう一度お試しください。',
    fallbackError: '判定できませんでした。時間をおいてもう一度お試しください。',
    liveChecking: '質問をチェックしています。',
    liveDone: (label) => `判定が終わりました。${label}`,
    liveFailed: '判定できませんでした。入力欄の下のメッセージを確認してください。',
    examples: {
      technical: '文字列の最後の3文字を取り出す方法を教えてください。',
      infra: '最近、CDNの設定周りに何か変更はありましたでしょうか。不正Bot対策で出力するCookieのサイズが大きいようなのですが、これは以前からのものかどうか、ご存知でしょうか。',
      infraRevised: 'Salesforceにアップした画像をサイト内から呼び出すと読み込めないことがあります。S3から RequestHeaderSectionTooLarge（上限8192バイト）が返っており、Cookieの合計がヘッダー上限を超えているのではないかと見ていますが、切り分けはできていません。確認すべき点があれば教えていただけますか。',
    },
  },
  en: {
    title: 'XY Problem Checker — Question your question first.',
    check: 'Check',
    checking: 'Checking…',
    stale: 'Your text has changed. Check again to update the result.',
    staleLanguage: 'You switched the language. Check again to see the result in this language.',
    stated: 'Written',
    notStated: 'Not written',
    likely: (probability) => `${probability}% likely to be written`,
    heading: (label) => `[${label}]`,
    lengthError: 'Enter 10 to 3,000 characters.',
    timeout: 'The response is taking a while. Wait a moment and try again.',
    network: 'Could not connect. Check your connection and try again.',
    fallbackError: 'Could not check your text. Please try again later.',
    liveChecking: 'Checking your question.',
    liveDone: (label) => `Check complete. ${label}`,
    liveFailed: 'Could not check your text. See the message below the input.',
    examples: {
      technical: 'How do I get the last three characters of a string?',
      infra: 'Has anything changed recently in the CDN settings? The cookies set by our bot protection seem to be large. Do you know whether they have always been this size?',
      infraRevised: 'Images uploaded to Salesforce sometimes fail to load when our site requests them. S3 returns RequestHeaderSectionTooLarge (limit: 8192 bytes). We suspect the total size of the cookies exceeds the header limit, but we have not isolated the cause yet. Could you tell us what we should check?',
    },
  },
}

const englishStatic = {
  brandHome: 'XY Problem Checker home',
  brand: 'XY Problem Checker',
  aboutLink: 'About',
  eyebrow: 'A self-check before you ask',
  heroTitle: 'Question your<br /><span>question first.</span>',
  lead: 'AI reads whether your question says what is actually happening and what you want to achieve,<br class="wide-break" /> and checks whether it has turned into an XY problem.',
  conceptLabel: 'X is your real goal and Y is the method you came up with. Step back from the method to the goal.',
  conceptX: 'Your real goal',
  conceptY: 'Your idea',
  conceptCaption: 'Come back here',
  workspaceLabel: 'Check your question',
  step1: 'Write your question',
  inputLabel: 'Paste your question or request as it is.',
  placeholder: 'e.g. How do I get the last three characters of a string?',
  inputHint: 'Say what is happening, what you want to achieve, and what you have tried.',
  examplesLabel: 'Try an example',
  exTechnical: 'Dev question',
  exInfra: 'Infra request',
  exInfraRevised: 'Infra request (rewritten)',
  privacy: 'Your text is sent to Cloudflare and TypeSafe AI to be checked. This app does not keep a history.',
  kbdHint: 'or press <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>Enter</kbd>',
  step2: 'How it reads to someone answering',
  emptyTitle: 'We read these three things from your text.',
  cp1Title: 'What is actually happening',
  cp1Body: 'An error, something not showing, slowness: what is happening right now',
  cp2Title: 'What you ultimately want',
  cp2Body: 'What you will be able to do once it works',
  cp3Title: 'What you have tried or ruled out',
  cp3Body: 'What you checked and found was not the cause',
  emptyNote: 'If neither 1 nor 2 can be read, an XY problem becomes more likely.',
  loadingTitle: 'Reading your text',
  loadingBody: 'Checking what is happening, what you want, and what you have tried.',
  missingTitle: 'Not written in this text',
  missingFooter: 'Adding these makes it easier to get a useful answer.',
  addHeadings: 'Add them to your text',
  elementsTitle: 'What we read',
  elementsNote: 'The percentages are the AI’s estimate of how likely each item is written in your text.',
  followUpTitle: 'Someone answering will probably ask you',
  resultNote: 'The verdict comes from the combination of the items above. The percentages are the AI’s estimates for each item, not the accuracy of the verdict. The follow-up questions are fixed templates for the missing items.',
  aboutEyebrow: 'What is the XY problem?',
  aboutTitle: 'Before “how,”<br />ask “what for.”',
  aboutP1: 'You really want to solve <strong>X</strong>, but you <strong>only ask how to do Y</strong>, a method you came up with yourself. That is the XY problem. People answering can only talk about Y, so the conversation drags on while X stays unsolved.',
  aboutP2: 'This checker does not grade your question. It helps you check, before you send it, whether your goal and situation come across.',
  exampleCaption: 'A common example',
  exampleYTag: 'What was asked',
  exampleYText: 'How do I get the last three characters of a string?',
  exampleXTag: 'What they really wanted',
  exampleXText: 'To find out a file’s extension from its name.',
  exampleNote: '“The last three characters” fails for four-letter extensions like <code>photo.jpeg</code>. Once the goal is known, people can suggest a proper way to get the extension.',
  footerTagline: 'Small rethinks, big steps forward.',
}

// index.html にある日本語の文言を、キーごとに集める。
function collectJapanese() {
  const texts = {}
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    texts[element.dataset.i18n] = element.textContent
  })
  document.querySelectorAll('[data-i18n-html]').forEach((element) => {
    texts[element.dataset.i18nHtml] = element.innerHTML
  })
  eachAttribute((element, attribute, key) => {
    texts[key] = element.getAttribute(attribute)
  })
  return texts
}

// data-i18n-attr="placeholder:key,aria-label:key" の組を1つずつ渡す。
function eachAttribute(callback) {
  document.querySelectorAll('[data-i18n-attr]').forEach((element) => {
    for (const pair of element.dataset.i18nAttr.split(',')) {
      const [attribute, key] = pair.split(':')
      callback(element, attribute, key)
    }
  })
}

const staticTexts = { ja: collectJapanese(), en: englishStatic }
let lang = initialLang()
let t = dynamic[lang]

// URL の ?lang= → 前回選んだ言語 → ブラウザの言語、の順に決める。日本語以外のブラウザには英語を出す。
function initialLang() {
  const fromUrl = new URLSearchParams(location.search).get('lang')
  if (LANGS.includes(fromUrl)) return fromUrl
  // 保存できない環境（プライベートブラウズなど）でも表示は続ける。
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY)
    if (LANGS.includes(saved)) return saved
  } catch {}
  const browser = (navigator.languages?.[0] || navigator.language || 'ja').toLowerCase()
  return browser.startsWith('ja') ? 'ja' : 'en'
}

function applyLang(next) {
  const previous = lang
  lang = next
  t = dynamic[lang]
  const texts = staticTexts[lang]
  document.documentElement.lang = lang
  document.title = t.title
  // 文言はすべてこのファイルと index.html にある固定の文字列で、利用者の入力は含まない。
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = texts[element.dataset.i18n]
  })
  document.querySelectorAll('[data-i18n-html]').forEach((element) => {
    element.innerHTML = texts[element.dataset.i18nHtml]
  })
  eachAttribute((element, attribute, key) => {
    element.setAttribute(attribute, texts[key])
  })
  langButtons.forEach((element) => {
    element.setAttribute('aria-pressed', String(element.dataset.lang === lang))
  })
  buttonLabel.textContent = button.disabled ? t.checking : t.check

  // 入力欄が例文のままなら、同じ例文の切り替え後の言語版にする。
  const exampleKey = Object.keys(t.examples).find((key) => dynamic[previous].examples[key] === input.value)
  if (exampleKey && previous !== lang) {
    input.value = t.examples[exampleKey]
    updateCount()
  }
  // 表示中の結果は、判定した時の言語のまま。もう一度チェックすれば切り替わることを知らせる。
  if (previous !== lang) {
    markStale(t.staleLanguage)
  }
}

langButtons.forEach((element) => {
  element.addEventListener('click', () => {
    if (element.dataset.lang === lang) return
    applyLang(element.dataset.lang)
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang)
    } catch {}
    // 共有した URL でも同じ言語で開けるように、?lang= を今の言語にする。
    const url = new URL(location.href)
    url.searchParams.set('lang', lang)
    history.replaceState(null, '', url)
  })
})

// ---- 入力 ----

// 直近の判定結果。「入力欄に項目を追加」で、書かれていない要素を見出しとして使う。
let lastResult = null

function updateCount() {
  document.querySelector('#character-count').textContent = `${input.value.length.toLocaleString()} / 3,000`
  input.setCustomValidity('')
}

// 結果を出したあとに文章や言語を変えたら、表示中の結果が古いことを知らせる。
function markStale(message = t.stale) {
  if (result.hidden) return
  staleNote.textContent = message
  staleNote.hidden = false
  card.dataset.stale = 'true'
}

input.addEventListener('input', () => {
  updateCount()
  markStale()
})

// Ctrl+Enter（Mac は ⌘+Enter）でも送信できるようにする。
input.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return
  if (!event.ctrlKey && !event.metaKey) return
  if (event.isComposing) return
  event.preventDefault()
  form.requestSubmit()
})

exampleButtons.forEach((element) => {
  element.addEventListener('click', () => {
    input.value = t.examples[element.dataset.example]
    updateCount()
    markStale()
    input.focus()
  })
})

// 書かれていない要素を見出しとして入力欄の末尾に足し、書き直しを始めやすくする。
document.querySelector('#add-headings').addEventListener('click', () => {
  if (!lastResult) return
  const headings = lastResult.missing
    .map((item) => t.heading(item.label))
    .filter((heading) => !input.value.includes(heading))
  if (headings.length) {
    const separator = input.value.trimEnd() ? '\n\n' : ''
    input.value = `${input.value.trimEnd()}${separator}${headings.join('\n\n\n')}\n`
    updateCount()
    markStale()
  }
  // 最初に足した見出しの次の行にカーソルを置く。
  const firstHeading = headings[0] ?? t.heading(lastResult.missing[0]?.label ?? '')
  const position = input.value.indexOf(firstHeading)
  const caret = position >= 0 ? position + firstHeading.length + 1 : input.value.length
  input.focus({ preventScroll: true })
  input.setSelectionRange(caret, caret)
  input.scrollIntoView({ behavior: scrollBehavior(), block: 'center' })
})

function scrollBehavior() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
}

// ---- 結果 ----

function renderMissing(items) {
  const list = document.querySelector('#missing-list')
  list.replaceChildren()
  for (const item of items) {
    const row = document.createElement('li')
    const label = document.createElement('b')
    label.textContent = item.label
    const hint = document.createElement('span')
    hint.textContent = item.hint
    row.append(label, hint)
    list.append(row)
  }
  document.querySelector('#missing').hidden = !items.length
}

// 3行とも「書かれている可能性」（stated の確率）で表示する。行ごとに数値の意味を変えない（issue #2）。
function renderSignals(elements) {
  const list = document.querySelector('#signals')
  list.replaceChildren()
  for (const element of elements) {
    const row = document.createElement('li')
    row.className = 'signal'
    row.dataset.stated = element.stated

    const heading = document.createElement('div')
    heading.className = 'signal-heading'
    const label = document.createElement('span')
    label.className = 'signal-label'
    label.textContent = element.label
    const status = document.createElement('span')
    status.className = 'signal-status'
    status.textContent = element.stated ? t.stated : t.notStated
    heading.append(label, status)

    const meter = document.createElement('div')
    meter.className = 'meter'
    meter.setAttribute('aria-hidden', 'true')
    const fill = document.createElement('span')
    fill.style.width = `${element.probability}%`
    meter.append(fill)

    const value = document.createElement('span')
    value.className = 'signal-value'
    value.textContent = t.likely(element.probability)

    row.append(heading, meter, value)
    list.append(row)
  }
}

function renderQuestions(questions) {
  const list = document.querySelector('#follow-up-questions')
  list.replaceChildren()
  for (const text of questions) {
    const item = document.createElement('li')
    item.textContent = text
    list.append(item)
  }
  document.querySelector('.follow-up').hidden = !questions.length
}

function render(data) {
  lastResult = data
  card.dataset.verdict = data.verdict
  card.dataset.excluded = Boolean(data.excluded)
  delete card.dataset.stale
  staleNote.hidden = true

  document.querySelector('#verdict-badge').textContent = data.label
  document.querySelector('#result-title').textContent = data.title
  document.querySelector('#result-description').textContent = data.description
  renderMissing(data.missing)
  renderSignals(data.elements)
  renderQuestions(data.questions)

  result.hidden = false
  live.textContent = t.liveDone(data.label)
  document.querySelector('#result-title').focus({ preventScroll: true })
  // 1列表示では結果が入力欄の下に出るため、結果まで移動する。
  if (matchMedia('(max-width: 720px)').matches) {
    card.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
  }
}

function setBusy(busy) {
  button.disabled = busy
  input.readOnly = busy
  exampleButtons.forEach((element) => {
    element.disabled = busy
  })
  buttonLabel.textContent = busy ? t.checking : t.check
  card.setAttribute('aria-busy', String(busy))
}

function errorMessage(cause) {
  if (cause.name === 'AbortError') {
    return t.timeout
  }
  // fetch の失敗と、JSON でない応答（途中のプロキシのエラーページなど）は通信の問題として扱う。
  if (cause instanceof TypeError || cause instanceof SyntaxError) {
    return t.network
  }
  return cause.message
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (button.disabled) return
  const text = input.value.trim()
  if (text.length < MIN_LENGTH || text.length > MAX_LENGTH) {
    input.setCustomValidity(t.lengthError)
    input.reportValidity()
    return
  }

  setBusy(true)
  delete card.dataset.verdict
  delete card.dataset.excluded
  error.hidden = true
  result.hidden = true
  empty.hidden = true
  loading.hidden = false
  live.textContent = t.liveChecking

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS)
  try {
    // 判定結果とエラーの文言を、表示中の言語で返してもらう。
    const response = await fetch(`/api/analyze?lang=${lang}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || t.fallbackError)
    }
    render(data)
  } catch (cause) {
    error.textContent = errorMessage(cause)
    error.hidden = false
    empty.hidden = false
    live.textContent = t.liveFailed
  } finally {
    clearTimeout(timer)
    loading.hidden = true
    setBusy(false)
  }
})

// 日本語は index.html のままなので、英語のときだけ書き換える。
if (lang !== 'ja') {
  applyLang(lang)
}
