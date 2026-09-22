const form = document.querySelector('#analyze-form')
const input = document.querySelector('#question')
const button = document.querySelector('#submit-button')
const result = document.querySelector('#result')
const card = document.querySelector('#result-card')
const empty = document.querySelector('#empty-state')
const loading = document.querySelector('#loading-state')
const error = document.querySelector('#error')
const live = document.querySelector('#live-status')
const examples = {
  technical: '文字列の最後の3文字を取り出す方法を教えてください。',
  infra: '最近、CDNの設定周りに何か変更はありましたでしょうか。不正Bot対策で出力するCookieのサイズが大きいようなのですが、これは以前からのものかどうか、ご存知でしょうか。',
  infraRevised: 'Salesforceにアップした画像をサイト内から呼び出すと読み込めないことがあります。S3から RequestHeaderSectionTooLarge（上限8192バイト）が返っており、Cookieの合計がヘッダー上限を超えているのではないかと見ていますが、切り分けはできていません。確認すべき点があれば教えていただけますか。',
}
function updateCount() {
  document.querySelector('#character-count').textContent = `${input.value.length.toLocaleString()} / 3,000`
  input.setCustomValidity('')
}
input.addEventListener('input', updateCount)
document.querySelectorAll('[data-example]').forEach((element) => {
  element.addEventListener('click', () => {
    input.value = examples[element.dataset.example]
    updateCount()
    input.focus()
  })
})
function render(data) {
  card.dataset.verdict = data.verdict
  document.querySelector('#verdict-badge').textContent = data.label
  document.querySelector('#result-title').textContent = data.title
  document.querySelector('#result-description').textContent = data.description
  const missing = document.querySelector('#missing-list')
  missing.replaceChildren()
  for (const item of data.missing) {
    const row = document.createElement('li')
    const label = document.createElement('b')
    label.textContent = `「${item.label}」`
    row.append(label, item.hint)
    missing.append(row)
  }
  document.querySelector('#missing').hidden = !data.missing.length
  const signals = document.querySelector('#signals')
  signals.replaceChildren()
  for (const element of data.elements) {
    const row = document.createElement('div')
    row.className = 'signal-heading'
    row.dataset.stated = element.stated
    const label = document.createElement('span')
    label.textContent = element.label
    const value = document.createElement('span')
    value.textContent = `書かれている可能性 ${element.probability}%`
    row.append(label, value)
    signals.append(row)
  }
  const questions = document.querySelector('#follow-up-questions')
  questions.replaceChildren()
  for (const text of data.questions) {
    const item = document.createElement('li')
    item.textContent = text
    questions.append(item)
  }
  result.hidden = false
  live.textContent = `判定が終わりました。${data.label}`
  document.querySelector('.follow-up').hidden = !data.questions.length
  document.querySelector('#result-title').focus({ preventScroll: true })
  if (matchMedia('(max-width: 720px)').matches) card.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
}
form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (button.disabled) return
  const text = input.value.trim()
  if (text.length < 10 || text.length > 3000) {
    input.setCustomValidity('10〜3,000文字で入力してください。')
    input.reportValidity()
    return
  }
  button.disabled = true
  input.readOnly = true
  document.querySelectorAll('[data-example]').forEach((el) => { el.disabled = true })
  document.querySelector('#button-label').textContent = 'チェック中…'
  card.setAttribute('aria-busy', 'true')
  delete card.dataset.verdict
  error.hidden = true
  result.hidden = true
  empty.hidden = true
  loading.hidden = false
  live.textContent = '質問をチェックしています。'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: controller.signal })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '判定できませんでした。時間をおいてもう一度お試しください。')
    render(data)
  } catch (cause) {
    error.textContent = cause.name === 'AbortError' ? '応答に時間がかかっています。少し待ってから、もう一度お試しください。' : cause instanceof TypeError || cause instanceof SyntaxError ? '通信できませんでした。接続を確認して、もう一度お試しください。' : cause.message
    error.hidden = false
    empty.hidden = false
    live.textContent = '判定できませんでした。入力欄の下のメッセージを確認してください。'
  } finally {
    clearTimeout(timer)
    loading.hidden = true
    card.setAttribute('aria-busy', 'false')
    button.disabled = false
    input.readOnly = false
    document.querySelectorAll('[data-example]').forEach((el) => { el.disabled = false })
    document.querySelector('#button-label').textContent = '問いをチェック'
  }
})
