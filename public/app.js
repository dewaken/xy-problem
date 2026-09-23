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

// 例文は scripts/eval-cases.ts のケースと揃えている。変えたら eval で判定を確かめる。
const examples = {
  technical: '文字列の最後の3文字を取り出す方法を教えてください。',
  infra: '最近、CDNの設定周りに何か変更はありましたでしょうか。不正Bot対策で出力するCookieのサイズが大きいようなのですが、これは以前からのものかどうか、ご存知でしょうか。',
  infraRevised: 'Salesforceにアップした画像をサイト内から呼び出すと読み込めないことがあります。S3から RequestHeaderSectionTooLarge（上限8192バイト）が返っており、Cookieの合計がヘッダー上限を超えているのではないかと見ていますが、切り分けはできていません。確認すべき点があれば教えていただけますか。',
}

const MIN_LENGTH = 10
const MAX_LENGTH = 3000
// 判定サービス側のタイムアウト（20秒）より少し長く待ち、サーバーからのエラーを優先して表示する。
const CLIENT_TIMEOUT_MS = 25000

// 直近の判定結果。「入力欄に項目を追加」で、書かれていない要素を見出しとして使う。
let lastResult = null

function updateCount() {
  document.querySelector('#character-count').textContent = `${input.value.length.toLocaleString()} / 3,000`
  input.setCustomValidity('')
}

// 結果を出したあとに文章を直したら、表示中の結果が古いことを知らせる。
function markStale() {
  if (result.hidden) return
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
    input.value = examples[element.dataset.example]
    updateCount()
    markStale()
    input.focus()
  })
})

// 書かれていない要素を【見出し】として入力欄の末尾に足し、書き直しを始めやすくする。
document.querySelector('#add-headings').addEventListener('click', () => {
  if (!lastResult) return
  const headings = lastResult.missing
    .map((item) => `【${item.label}】`)
    .filter((heading) => !input.value.includes(heading))
  if (headings.length) {
    const separator = input.value.trimEnd() ? '\n\n' : ''
    input.value = `${input.value.trimEnd()}${separator}${headings.join('\n\n\n')}\n`
    updateCount()
    markStale()
  }
  // 最初に足した見出しの次の行にカーソルを置く。
  const firstHeading = headings[0] ?? `【${lastResult.missing[0]?.label ?? ''}】`
  const position = input.value.indexOf(firstHeading)
  const caret = position >= 0 ? position + firstHeading.length + 1 : input.value.length
  input.focus({ preventScroll: true })
  input.setSelectionRange(caret, caret)
  input.scrollIntoView({ behavior: scrollBehavior(), block: 'center' })
})

function scrollBehavior() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
}

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
    status.textContent = element.stated ? '書かれている' : '書かれていない'
    heading.append(label, status)

    const meter = document.createElement('div')
    meter.className = 'meter'
    meter.setAttribute('aria-hidden', 'true')
    const fill = document.createElement('span')
    fill.style.width = `${element.probability}%`
    meter.append(fill)

    const value = document.createElement('span')
    value.className = 'signal-value'
    value.textContent = `書かれている可能性 ${element.probability}%`

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
  live.textContent = `判定が終わりました。${data.label}`
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
  buttonLabel.textContent = busy ? 'チェック中…' : 'チェックする'
  card.setAttribute('aria-busy', String(busy))
}

function errorMessage(cause) {
  if (cause.name === 'AbortError') {
    return '応答に時間がかかっています。少し待ってから、もう一度お試しください。'
  }
  // fetch の失敗と、JSON でない応答（途中のプロキシのエラーページなど）は通信の問題として扱う。
  if (cause instanceof TypeError || cause instanceof SyntaxError) {
    return '通信できませんでした。接続を確認して、もう一度お試しください。'
  }
  return cause.message
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (button.disabled) return
  const text = input.value.trim()
  if (text.length < MIN_LENGTH || text.length > MAX_LENGTH) {
    input.setCustomValidity('10〜3,000文字で入力してください。')
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
  live.textContent = '質問をチェックしています。'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS)
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || '判定できませんでした。時間をおいてもう一度お試しください。')
    }
    render(data)
  } catch (cause) {
    error.textContent = errorMessage(cause)
    error.hidden = false
    empty.hidden = false
    live.textContent = '判定できませんでした。入力欄の下のメッセージを確認してください。'
  } finally {
    clearTimeout(timer)
    loading.hidden = true
    setBusy(false)
  }
})
