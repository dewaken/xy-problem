import type { Verdict } from './analysis'

// 利用者に見せる文言（画面の API と Discord）。判定ロジックとは分け、言語ごとに持つ。
// 画面の決まり（AGENTS.md「UI の決まり」）は両方の言語で守る。「Jev」を出さず、%は「書かれている可能性」にする。
export type Locale = 'ja' | 'en'

type Copy = { label: string; title: string; description: string }
type Element = { label: string; hint: string; question: string }

export type Messages = {
  verdicts: Record<Verdict, Copy>
  notRequest: Copy
  elements: { symptom: Element; goal: Element }
  tried: { label: string; question: string }
  errors: {
    tooLarge: string
    crossOrigin: string
    notJson: string
    length: string
    notConfigured: string
    rateLimiterDown: string
    busy: string
    invalidResponse: string
    badInput: string
    notFound: string
    failed: string
    jevConfig: string
    jevUpstream: string
    jevTimeout: string
    jevFailed: string
  }
  discord: {
    notAllowed: string
    unreadableMessage: string
    notOwnMessage: string
    noText: string
    length: string
    notConfigured: string
    missingField: string
    questionsField: string
    elementsField: string
    elementRow: (label: string, probability: number) => string
    footer: string
  }
}

const ja: Messages = {
  verdicts: {
    strong: {
      label: 'XY問題の疑いが強い',
      title: '手段は具体的なのに、起きている問題が書かれていません。',
      description: '調べる対象がすでに絞り込まれています。その絞り込みが外れていると、回答者がいくら調べても本当の原因に届きません。',
    },
    suspected: {
      label: 'XY問題の疑いあり',
      title: 'その手段で、何を実現したいのでしょうか。',
      description: '特定のやり方について尋ねていますが、最終的に何をしたいのかが書かれていません。目的が分かると、別のより良い方法が見つかることがあります。',
    },
    borderline: {
      label: '目的も問題も、まだ形になっていません',
      title: '何に困っているのかを、先に言葉にしてみましょう。',
      description: '問題や目的には触れていますが、具体的に何が起きていて、どうなれば解決なのかが読み取れません。',
    },
    unlikely: {
      label: 'XY問題の可能性は低い',
      title: '起きていることや目的が書かれています。',
      description: '回答者が手段の良し悪しから検討できる材料があります。下の要素で欠けているものがあれば、補うとさらに伝わりやすくなります。',
    },
  },
  notRequest: {
    label: '判定対象外',
    title: '質問や相談ではないようです。',
    description: '回答や説明、情報の依頼として読めるため、XY問題の対象外と判断しました。相談したい側の文章を入力してください。',
  },
  elements: {
    symptom: {
      label: '実際に起きている問題',
      hint: 'エラー、表示されない、遅いなど、実際に何が起きているかを書いてください。',
      question: '実際にどんな現象が起きていますか？（エラー、画面の状態、影響を受けている人や作業）',
    },
    goal: {
      label: '最終的に実現したいこと',
      hint: 'それが実現すると何ができるようになるのかを書いてください。',
      question: 'それが実現したら、最終的に何ができるようになりますか？',
    },
  },
  tried: {
    label: '試したこと・切り分けの結果',
    question: 'すでに試したことや、確認して原因ではないと分かったことはありますか？',
  },
  errors: {
    tooLarge: '入力が大きすぎます。3,000文字以内で入力してください。',
    crossOrigin: 'このサイトの入力欄から送信してください。',
    notJson: 'JSON形式で送信してください。',
    length: '10〜3,000文字で入力してください。',
    notConfigured: '判定サービスの設定が完了していません。',
    rateLimiterDown: '判定サービスに接続できません。時間をおいてお試しください。',
    busy: '利用が集中しています。1分ほど待ってから、もう一度お試しください。',
    invalidResponse: '判定結果を読み取れませんでした。時間をおいてもう一度お試しください。',
    badInput: '入力を読み取れませんでした。',
    notFound: 'ページが見つかりません。',
    failed: '処理に失敗しました。時間をおいてお試しください。',
    jevConfig: '判定サービスの設定を確認してください。',
    jevUpstream: '判定サービスに接続できませんでした。時間をおいてお試しください。',
    jevTimeout: '応答に時間がかかっています。少し待ってからお試しください。',
    jevFailed: '判定を取得できませんでした。時間をおいてもう一度お試しください。',
  },
  discord: {
    notAllowed: 'このアプリを使えるユーザーとして登録されていません。',
    unreadableMessage: 'チェックするメッセージを読み取れませんでした。',
    notOwnMessage: '自分が投稿したメッセージだけチェックできます。',
    noText: '本文のないメッセージはチェックできません（画像だけの投稿など）。',
    length: '10〜3,000文字のメッセージだけチェックできます。',
    notConfigured: '判定サービスの設定が完了していません。',
    missingField: 'この文章に書かれていないこと',
    questionsField: '回答する人から、こう聞き返されそうです',
    elementsField: '読み取った要素',
    elementRow: (label, probability) => `${label}：書かれている可能性 ${probability}%`,
    footer: '判定のため Cloudflare・TypeSafe AI に送信しました。%は各要素が文章に書かれているとAIが推定した確率で、判定の正解率ではありません。',
  },
}

const en: Messages = {
  verdicts: {
    strong: {
      label: 'Strong sign of an XY problem',
      title: 'The method is specific, but the problem itself is not written.',
      description: 'You have already narrowed down where to look. If that guess is wrong, people answering will never reach the real cause, however hard they look.',
    },
    suspected: {
      label: 'Possible XY problem',
      title: 'What do you want to achieve with that method?',
      description: 'You ask about a specific way of doing something, but not what you ultimately want. Once the goal is known, there may be a different, better way.',
    },
    borderline: {
      label: 'Neither the goal nor the problem is clear yet',
      title: 'Start by putting what is bothering you into words.',
      description: 'You touch on a problem or a goal, but it is not clear what is actually happening or what would count as solved.',
    },
    unlikely: {
      label: 'Unlikely to be an XY problem',
      title: 'What is happening or what you want is written.',
      description: 'People answering have enough to judge whether your method is a good one. If an item below is missing, adding it will make your question even clearer.',
    },
  },
  notRequest: {
    label: 'Not checked',
    title: 'This does not look like a question or a request.',
    description: 'It reads as an answer, an explanation, or a request for information, so the XY problem does not apply. Enter the text from the side asking for help.',
  },
  elements: {
    symptom: {
      label: 'What is actually happening',
      hint: 'Write what is actually happening, such as an error, something not showing, or slowness.',
      question: 'What exactly is happening? (errors, what the screen shows, who or what work is affected)',
    },
    goal: {
      label: 'What you ultimately want',
      hint: 'Write what you will be able to do once this works.',
      question: 'Once this works, what will you ultimately be able to do?',
    },
  },
  tried: {
    label: 'What you have tried or ruled out',
    question: 'Have you already tried anything, or checked and ruled anything out as the cause?',
  },
  errors: {
    tooLarge: 'Your text is too long. Enter 3,000 characters or fewer.',
    crossOrigin: 'Please send your text from the input on this site.',
    notJson: 'Please send the request as JSON.',
    length: 'Enter 10 to 3,000 characters.',
    notConfigured: 'The checking service is not set up yet.',
    rateLimiterDown: 'Cannot reach the checking service. Please try again later.',
    busy: 'Too many requests. Wait about a minute and try again.',
    invalidResponse: 'Could not read the result. Please try again later.',
    badInput: 'Could not read your input.',
    notFound: 'Page not found.',
    failed: 'Something went wrong. Please try again later.',
    jevConfig: 'Check the settings of the checking service.',
    jevUpstream: 'Could not connect to the checking service. Please try again later.',
    jevTimeout: 'The response is taking a while. Wait a moment and try again.',
    jevFailed: 'Could not get a result. Please try again later.',
  },
  discord: {
    notAllowed: 'You are not registered as a user of this app.',
    unreadableMessage: 'Could not read the message to check.',
    notOwnMessage: 'You can only check messages you posted yourself.',
    noText: 'Messages without text cannot be checked (for example, image-only posts).',
    length: 'Only messages of 10 to 3,000 characters can be checked.',
    notConfigured: 'The checking service is not set up yet.',
    missingField: 'Not written in this text',
    questionsField: 'Someone answering will probably ask',
    elementsField: 'What we read',
    elementRow: (label, probability) => `${label}: ${probability}% likely to be written`,
    footer: 'Sent to Cloudflare and TypeSafe AI to be checked. The percentages are the AI’s estimate of how likely each item is written, not the accuracy of the verdict.',
  },
}

const catalogs: Record<Locale, Messages> = { ja, en }

export function messages(locale: Locale): Messages {
  return catalogs[locale]
}

// 画面の API の ?lang=。英語は明示されたときだけにし、既定は今までどおり日本語にする。
export function localeFromQuery(value: string | undefined): Locale {
  return value === 'en' ? 'en' : 'ja'
}

// Discord の locale（例：ja、en-US）。日本語以外の言語を設定している人には英語で返す。
// locale が無いときは、画面の API と同じく既定の日本語にする。
export function localeFromDiscord(value: string | undefined): Locale {
  if (!value) return 'ja'
  return value === 'ja' ? 'ja' : 'en'
}
