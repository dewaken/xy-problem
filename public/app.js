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
  technical: 'ファイル形式を判定したいので、ファイル名の末尾3文字を取得する方法を教えてください。',
  work: '会議の日程調整を効率化したいです。全員のカレンダーを毎朝スクリーンショットで集めて、Excelに貼り付ける作業を自動化するにはどうすればいいですか？',
  clear: '問い合わせへの初回返信を24時間以内にしたいです。現在は担当者が不明な問い合わせが放置されています。予算をかけず、5人のチームで担当を決めて対応状況を共有する方法を比較したいです。',
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
  document.querySelector('#confidence').textContent = `${data.confidence}%`
  document.querySelector('#result-title').textContent = data.title
  document.querySelector('#result-description').textContent = data.description
  const signals = document.querySelector('#signals')
  signals.replaceChildren()
  for (const signal of data.signals) {
    const row = document.createElement('div')
    const heading = document.createElement('div')
    heading.className = 'signal-heading'
    const label = document.createElement('span')
    label.textContent = signal.label
    const value = document.createElement('span')
    value.textContent = `${signal.value}%`
    heading.append(label, value)
    const track = document.createElement('div')
    track.className = 'signal-track'
    const fill = document.createElement('div')
    fill.className = 'signal-fill'
    fill.style.width = `${Math.max(0, Math.min(100, signal.value))}%`
    track.append(fill)
    row.append(heading, track)
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
