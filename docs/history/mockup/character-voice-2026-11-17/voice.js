// キャラクターの振る舞いと吹き出しの見本。URL の検索引数から形・場面・パックを読み、会話の流れ・声の定位置・立ち絵の表情と動きを組む。
// 今の形（form=now）の振る舞いは、2026-11-17 の main を疑似セッションで撮って測ったものに合わせてある。
// 中身はすべて架空で、実物の会話ではない。

const MOMENTS = ["greet", "work", "quiet", "ask", "late", "idle"]
const PACKS = {
  shirasuzu: { name: "白鈴", accent: "#f9c3cd" },
  tsukumo: { name: "つくも", accent: "#6fe3cd" },
}
// パックの character.json の表情の語（2つのパックで同じ）。
const LABELS = {
  default: "にっと",
  thinking: "ふむ",
  proud: "えへん",
  flustered: "あわわ",
  serious: "きりっ",
  curious: "きょとん",
  sad: "しょんぼり",
  excited: "わくわく",
  bored: "たいくつ",
}

const params = new URLSearchParams(location.search)

function pick(name, allowed) {
  const value = params.get(name)
  return allowed.includes(value) ? value : allowed[0]
}

const form = pick("form", ["now", "next"])
const moment = pick("moment", MOMENTS)
const packId = pick("pack", Object.keys(PACKS))
const pack = PACKS[packId]
const next = form === "next"
const touched = next && moment === "late" && params.get("touch") === "1"
// 撮影用。届いた瞬間の1回だけの動き（うなずく・呼ぶ）を掛けずに、続く動きから始める。
const still = params.get("still") === "1"
// 提案 A: 流れの外に届く声（迎えの挨拶・待ちの一言）を、入力欄の上の定位置に出す場面。
const voiced = next && (moment === "greet" || moment === "idle")

document.body.dataset.p = "spec goal"
document.body.dataset.form = form
document.body.dataset.moment = moment
if (voiced) {
  document.body.dataset.voice = "1"
}
if (params.get("bar") === "0") {
  document.body.dataset.bar = "0"
}

function one(selector) {
  return document.querySelector(selector)
}

function icon(name, extra = "") {
  return `<svg viewBox="0 0 24 24" class="icon${extra}" aria-hidden="true"><use href="#i-${name}" /></svg>`
}

function asset(file) {
  return `../../../../characters/${packId}/${file}`
}

const REQUEST = "タスク一覧の並び替えを、開き直しても残るようにしたい"

const PHASES = [
  {
    name: "今の一覧を調べる",
    time: "48秒",
    note: "並び順は画面のメモリだけにあり、開き直すと既定に戻っていた。保存先の候補は2つある。",
  },
  {
    name: "保存の仕組みを足す",
    time: "2分10秒",
    note: "並び順を端末ごとの好みに保存し、読み込みで戻す仕組みを足した。単体テスト 6 件が通った。",
  },
  { name: "画面に反映する", time: "1分32秒", note: "" },
  { name: "検証する", time: "2分10秒", note: "" },
]

// セリフ。long は今の形の言い方（済んだフェーズの札と同じ中身の言い直し）で、提案 D では text（受け取り方と合図）だけにする。
const SAY = {
  hello: { text: "おはようございます、ぬしさま。T-105 から始めませんか。", time: "9:02", expression: "excited" },
  got: { text: "並び替えの保存ですね。まず今の一覧の作りを見てきます。", time: "14:25", expression: "thinking" },
  found: {
    text: "……ん、保存する所がどこにも無かったんですね。足していきます。",
    long: "フェーズ1が済みました。並び順は画面のメモリだけにあって、開き直すと既定に戻っていました。保存先の候補は2つあります。",
    time: "14:26",
    expression: "curious",
  },
  hand: { text: "保存の仕組みは実装役に任せます。20分ほど待ちますね。", time: "14:26", expression: "default" },
  ask: { text: "保存先が2通りあります。どちらにするか決めてください。", time: "14:27", expression: "curious" },
  saved: {
    text: "ふふ、すんなり入りました。次は画面につなぎます。",
    long: "フェーズ2が済みました。並び順を端末ごとの好みに保存して、読み込みで戻す仕組みが入りました。単体テストも6件通っています。次は一覧の画面につなぎます。",
    time: "14:30",
    expression: "proud",
  },
  done: { text: "ふふ、開き直しても並びが残るようになりました。", time: "14:32", expression: "proud" },
  wait: { text: "次に進めるときは、呼んでくださいね。", time: "14:34", expression: "default" },
}

const QUESTION = {
  label: "保存先",
  text: "並び順はどこに保存しますか？",
  why: "並び順をほかの端末にも引き継ぎたいかどうかが分からない。",
  facts: ["並び順はいま画面のメモリだけにあり、開き直すと既定に戻る。", "ほかの好みの設定は端末ごとに保存している。"],
  reason: "ほかの好みの設定と同じ置き場にそろう。",
  options: [
    ["端末ごとに保存", "この端末のブラウザにだけ残す。ほかの端末には引き継がない。"],
    ["設定ファイルに保存", "プロジェクトの設定に書く。端末をまたいで同じ並びになる。"],
  ],
}

// 場面ごとの進行の帯。current は今のフェーズ（0始まり。4 は全部済み）。
const STRIP = {
  work: { state: "作業中", current: 1, time: ["経過", "52秒"], steps: 4 },
  quiet: { state: "背景で作業中", current: 1, time: ["経過", "7分02秒"], steps: 9 },
  ask: { state: "答え待ち", current: 1, asking: true, time: ["経過", "2分20秒"], steps: 5 },
  late: { state: "作業中", current: 2, time: ["経過", "5分12秒"], steps: 12 },
  idle: { state: "完了", current: 4, time: ["所要", "6分40秒"], steps: 14 },
}

// 立ち絵が従っているセリフ（その場面でいちばん新しいセリフか反応）。表情はこのセリフのもの。
const FOLLOWED = { greet: "hello", work: "found", quiet: "hand", ask: "ask", late: "saved", idle: "wait" }[moment]

// 立ち絵の動き。base は続く動き、intro は届いた瞬間の1回だけの動き。
// 今の形: 作業中は歩く、ターンが閉じて背景の作業だけを待つあいだは呼吸、答え待ちは歩く（作業中と同じ）。
// 提案 B: 局面に従う。背景の作業を待つあいだも歩き、答え待ちは呼び、セリフが届いた瞬間にうなずく。
const MOTION = {
  now: {
    greet: { base: "breathe" },
    work: { base: "walk" },
    quiet: { base: "breathe" },
    ask: { base: "walk" },
    late: { base: "walk" },
    idle: { base: "breathe" },
  },
  next: {
    greet: { base: "breathe", intro: "nod" },
    work: { base: "walk", intro: "nod" },
    quiet: { base: "walk" },
    ask: { base: "breathe", intro: "beckon" },
    late: { base: "walk", intro: "nod" },
    idle: { base: "breathe", intro: "nod" },
  },
}[form][moment]

const TAIL =
  '<svg class="tail" viewBox="0 0 14 12" aria-hidden="true"><path d="M3 0 0.5 11.5 13 0" /></svg>'

// 時刻は分が変わった行だけに出す。表情の語（提案 E）は、表情が前のセリフから変わった行だけに出す。
let lastMinute = ""
let lastExpression = ""

function timeOf(time) {
  const changed = time !== lastMinute
  lastMinute = time
  return `<time class="v-time${changed ? "" : " is-quiet"}">${time}</time>`
}

function post(text, time, label) {
  const lead = label === undefined ? "" : `<span class="post-label">${label}</span>`
  return `<div class="row row-user"><div class="bubble bubble-post${label === undefined ? "" : " is-short"}"><span class="visually-hidden">あなた: </span>${lead}${text}</div><span class="v-meta">${timeOf(time)}</span></div>`
}

/** セリフの行。live はいまの一言（明るさと尾）、age は届いてからの経過（提案 C。あれば明るさを落として時刻の代わりに出す）。 */
function say(key, options = {}) {
  const line = SAY[key]
  const text = !next && line.long !== undefined ? line.long : line.text
  const live = options.live === true
  const aged = next && options.age !== undefined
  const stamp = timeOf(line.time)
  // 既定の表情（default）には語を添えない。添えるのは、表情が動いた行だけ。
  const face =
    next && line.expression !== lastExpression && line.expression !== "default"
      ? `<span class="v-face">${LABELS[line.expression]}</span>`
      : ""
  lastExpression = line.expression
  const meta = aged ? `<span class="v-age" title="${line.time}">${options.age}</span>` : stamp
  const reply = next
    ? `<button class="v-reply" type="button" data-reply="${key}">${icon("reply", " icon-sm")}返す</button>`
    : ""
  const press = next
    ? ` role="button" tabindex="0" aria-pressed="false" data-expression="${line.expression}"`
    : ""
  const shape = `bubble bubble-say${live ? " is-live" : ""}${aged ? " is-calm" : ""}`
  return `<div class="row row-say" data-say="${key}">
    <div class="${shape}"${press}><span class="visually-hidden">${pack.name}: </span>${text}${live ? TAIL : ""}</div>
    <span class="v-meta">${face}${meta}${reply}</span>
  </div>`
}

function slip(index) {
  const phase = PHASES[index]
  return `<section class="thing slip">
    <header class="slip-head"><span class="phase-dot is-done">${icon("check")}</span><span>${index + 1}/${PHASES.length} ${phase.name}</span><time class="slip-time">${phase.time}</time></header>
    <p class="slip-note">${phase.note}</p>
  </section>`
}

function group(...items) {
  return `<div class="group">${items.join("")}</div>`
}

function disclose(summary, body, extra = "") {
  return `<details class="disclose${extra}"><summary>${icon("chevron-right", " icon-sm")}<span>${summary}</span></summary><div class="disclose-body">${body}</div></details>`
}

function nowPill(verb, detail, time) {
  return `<p class="now-pill scroll-target"><span class="spinner"></span><b>${verb}</b><code>${detail}</code><time>${time}</time></p>`
}

function briefOf() {
  const facts = QUESTION.facts
    .map(
      (fact) =>
        `<div class="brief-fact"><span><span class="chip chip-ok">確かめた</span></span><span>${fact}</span></div>`,
    )
    .join("")
  return `<dl class="brief">
      <div class="brief-line"><dt>聞く理由</dt><dd>${QUESTION.why}</dd></div>
      <dt>事実</dt>
      <dd>${facts}</dd>
      <div class="brief-line"><dt>おすすめの理由</dt><dd><span class="chip chip-line">確度 中</span> ${QUESTION.reason}</dd></div>
    </dl>`
}

function inquiry() {
  const options = QUESTION.options
    .map(
      ([label, note], index) => `<li class="option">
        <div class="option-head"><kbd class="key">${index + 1}</kbd><span class="radio"></span>${label}${index === 0 ? '<span class="chip chip-line">おすすめ</span>' : ""}</div>
        <p class="option-note">${note}</p>
      </li>`,
    )
    .join("")
  return `<section class="inquiry thing wide scroll-target">
    <header class="inquiry-head">
      <span class="inquiry-kind">質問</span><span class="inquiry-label">${QUESTION.label}</span>
      <span class="inquiry-wait">待って 0:42</span><button class="expand-button" type="button">${icon("expand")}広げる</button>
    </header>
    <h3 class="inquiry-title">${QUESTION.text}</h3>
    ${briefOf()}
    <ol class="options">${options}</ol>
    <footer class="inquiry-foot"><button class="quiet-button" type="button">おすすめに任せる（${QUESTION.options[0][0]}）</button><span class="inquiry-foot-gap"></span><button class="answer-button" type="button">これで答える ${icon("enter", " icon-sm")}</button></footer>
  </section>`
}

function questionSlip() {
  return `<section class="thing slip">
    <header class="slip-head"><span class="slip-mark">${icon("question")}</span><span>${QUESTION.label}: ${QUESTION.text}</span></header>
    ${disclose("聞いたときの詳細", briefOf())}
  </section>`
}

function paper() {
  return `<section class="thing paper wide">
    <span class="paper-tools"><button class="expand-button" type="button">${icon("expand")}広げる</button></span>
    <div class="report">
      <p class="conclusion">タスク一覧の並び替えが、開き直しても残るようになった。</p>
      <div class="checks">
        <div class="checks-line"><span class="checks-total">確かめたこと 2件</span><span class="checks-figure">通った 2</span><span class="checks-figure">単体 3152・E2E 71</span></div>
        <div class="checks-line checks-row"><span><span class="chip chip-ok">${icon("check")}通った</span></span><div><b>pnpm run check</b><span class="chip chip-line">記録あり・1回</span></div></div>
        <div class="checks-line checks-row"><span><span class="chip chip-ok">${icon("check")}通った</span></span><div><b>開き直したあとの並び</b><span class="chip chip-line">記録あり・1回</span></div></div>
      </div>
      <h2>並び順は端末ごとに保存する</h2>
      <p>並び替えるたびに端末ごとの好みへ保存し、一覧を開いたときに読み戻す。保存した値が壊れていたら既定の並びで開く。</p>
      <table class="report-table">
        <caption><small>表 1</small>並び順の扱い</caption>
        <thead><tr><th>場面</th><th>前</th><th>後</th></tr></thead>
        <tbody>
          <tr><td>並び替えた直後</td><td>メモリだけ</td><td>端末に保存</td></tr>
          <tr><td>開き直したとき</td><td>既定に戻る</td><td>保存した並び</td></tr>
          <tr><td>値が壊れていたとき</td><td>—</td><td>既定の並び</td></tr>
        </tbody>
      </table>
      <h2>ほかの端末には引き継がない</h2>
      <p>保存先は端末ごとなので、別の端末では既定の並びから始まる。引き継ぎたくなったら、設定ファイルへ移す道が残っている。</p>
      <h2>読み込みで失敗しても一覧は開く</h2>
      <p>保存した値の形が合わなければ捨てて、既定の並びで開く。捨てたことは診断ログに1行残す。</p>
    </div>
  </section>`
}

/** 迎える場面の始め方の一覧。提案では、挨拶が見出しの役をするので「何から始める？」を出さない。 */
function welcome() {
  const title = next ? "" : '<h2 class="welcome-title">何から始める？</h2>'
  return `<section class="welcome">
    ${title}
    <p class="welcome-lead">tsukumo のおすすめ。「始める」を押すと、カードに書いた依頼がそのまま送られて作業が始まる。</p>
    <article class="welcome-card">
      <p class="welcome-card-head"><span>T-105</span><span class="welcome-badge">いちばんのおすすめ</span></p>
      <p class="welcome-card-title">一覧の絞り込みの文言を見直す</p>
      <p class="welcome-card-reason"><img src="${asset("face.png")}" alt="" />前の作業の続きで、そのまま入れる</p>
      <div class="welcome-card-request"><span>送られる依頼</span><p>/next-task T-105</p></div>
      <p class="welcome-card-foot"><kbd class="key">1</kbd><button class="welcome-start" type="button">始める${icon("arrow-right")}</button></p>
    </article>
    <p class="welcome-others"><span>ほかの始め方</span><button type="button">${icon("pencil")}自分で書く<kbd class="key">/</kbd></button><button type="button">${icon("list")}タスクの一覧から選ぶ</button></p>
  </section>`
}

function flowRows() {
  const request = () => post(REQUEST, "14:25")
  switch (moment) {
    case "greet":
      return [welcome()]
    case "work":
      return [
        request(),
        say("got"),
        group(slip(0), say("found", { live: true })),
        nowPill("読んでいる", "sort-order.ts", "4秒"),
      ]
    case "quiet":
      return [
        request(),
        say("got"),
        group(slip(0), say("hand", { live: true, age: "6分前" })),
        nowPill("背景で 委譲先に任せている", "実装役 · 保存の仕組みを足す", "6分12秒"),
      ]
    case "ask":
      return [
        request(),
        say("got"),
        group(slip(0), say("found")),
        group(say("ask", { live: true }), inquiry()),
      ]
    case "late":
      return [
        request(),
        say("got"),
        group(slip(0), say("found")),
        group(say("ask"), questionSlip()),
        post(QUESTION.options[0][0], "14:28", "答え"),
        group(slip(1), say("saved", { live: true })),
        nowPill("書き換えている", "task-list.tsx", "18秒"),
      ]
    default: {
      const journey = [say("got"), group(slip(0), say("found")), group(slip(1), say("saved"))].join("")
      lastMinute = ""
      lastExpression = ""
      const head = [
        request(),
        disclose("作業の経過　4フェーズ・6分40秒・セリフ 6件・質問 1件", journey, " fold-pill"),
        group(say("done"), paper()),
      ]
      // 今の形: 待ちの一言は記録の位置（紙の後ろ＝流れの末尾）に積まれ、頭から読んでいる画面の外に出る。
      return next ? head : [...head, say("wait")]
    }
  }
}

function stripInner(strip) {
  const dots = PHASES.map((_, index) => {
    if (index < strip.current) {
      return `<span class="phase-dot is-done">${icon("check")}</span>`
    }
    if (index === strip.current) {
      return strip.asking === true
        ? '<span class="phase-dot is-asking">?</span>'
        : `<span class="phase-dot is-current">${index + 1}</span>`
    }
    return `<span class="phase-dot">${index + 1}</span>`
  })
    .map((dot, index) =>
      index === 0 ? dot : `<i class="phase-link${index <= strip.current ? " is-done" : ""}"></i>${dot}`,
    )
    .join("")
  const name =
    strip.current >= PHASES.length
      ? `<span class="strip-name is-plain">${PHASES.length}フェーズすべて済み</span>`
      : `<span class="strip-name">${PHASES[strip.current].name}</span>`
  const state = {
    作業中: "var(--accent)",
    背景で作業中: "var(--accent)",
    答え待ち: "var(--warn)",
    完了: "var(--ok)",
  }[strip.state]
  return `
    <span class="strip-state" style="--state: ${state}">${strip.state}</span>
    <span class="strip-phases">${dots}</span>
    ${name}
    <span class="strip-time">${strip.time[0]}<b>${strip.time[1]}</b></span>
    <button class="strip-steps" type="button">${icon("chevron-right", " icon-sm")}手順 ${strip.steps}件</button>`
}

function buildStrip() {
  const strip = STRIP[moment]
  if (strip !== undefined) {
    one("#strip").innerHTML = stripInner(strip)
  }
}

function buildLane() {
  const sub = {
    late: '<p class="lane-sub is-current"><span>レポート</span><b>2/4 保存の仕組…</b></p>',
    idle: '<p class="lane-sub is-current"><span>最終</span><b>タスク一覧の…</b><span class="lane-keys"><kbd class="key">{</kbd><kbd class="key">}</kbd></span></p>',
  }[moment]
  const report = '<p class="lane-sub is-current"><span>レポート</span><b>1/4 今の一覧を…</b></p>'
  one("#lane-turns").innerHTML =
    `<li class="lane-turn"><p class="lane-title">タスク一覧の並び替えを…</p>${sub ?? report}</li>`
}

function buildFlow() {
  lastMinute = ""
  lastExpression = ""
  one("#flow").innerHTML = flowRows().join("")
  const voice = one("#voice")
  voice.hidden = !voiced
  if (voiced) {
    lastMinute = ""
    lastExpression = ""
    voice.innerHTML = say(FOLLOWED, { live: true })
  }
  if (touched) {
    pin(one('[data-say="found"]'))
    one('[data-say="found"]').classList.add("is-touched")
  }
  const target = one(".scroll-target")
  if (moment === "idle") {
    one("#scroller").scrollTop = 0
  } else if (target !== null) {
    target.scrollIntoView({ block: "end" })
  }
}

function buildDock() {
  const band = one("#band")
  const draft = one("#draft")
  const working = moment === "work" || moment === "quiet" || moment === "late"
  draft.placeholder = working ? `${pack.name} への補足を書く` : `${pack.name} への依頼を書く`
  if (moment === "work" || moment === "late") {
    one("#send").classList.add("is-stop")
    one("#send").setAttribute("aria-label", "止める")
    one("#send-icon").setAttribute("href", "#i-stop")
  }
  if (moment === "ask") {
    draft.placeholder = "選択肢以外の答えを書く…"
    band.hidden = false
    band.innerHTML = `<span>${pack.name} が質問しています。選択肢から選ぶか、ここに書いて答えられます</span><button class="quiet-button" type="button">選択肢へ<kbd class="key">↑</kbd></button>`
    document.documentElement.style.setProperty("--dock-h", "148px")
  }
}

const portrait = one("#portrait")
let pinned = null

function showExpression(expression) {
  portrait.src = asset(`${expression}.png`)
}

/** 提案 E: セリフを押すと、立ち絵がそのセリフの表情に戻る。もう一度押すか、別のセリフを押すと解ける。 */
function pin(row) {
  const bubble = row?.querySelector('.bubble-say[role="button"]')
  if (bubble === null || bubble === undefined) {
    return
  }
  const same = pinned === bubble
  pinned?.setAttribute("aria-pressed", "false")
  pinned = same ? null : bubble
  pinned?.setAttribute("aria-pressed", "true")
  showExpression(pinned === null ? SAY[FOLLOWED].expression : bubble.dataset.expression)
}

/** 提案 F: 「返す」を押すと、入力欄の頭に返す先の札が付く（送らない）。 */
function reply(key) {
  const quote = one("#quote")
  const text = SAY[key].text
  quote.hidden = false
  quote.innerHTML = `<span>${pack.name} の一言に返す</span><b>${text}</b><button class="icon-button" type="button" aria-label="返す先を外す" id="quote-clear">×</button>`
  one("#draft").placeholder = "この一言への補足を書く"
  one("#draft").focus()
}

function wireRows() {
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null
    if (target === null) {
      return
    }
    const replyButton = target.closest("[data-reply]")
    if (replyButton !== null) {
      reply(replyButton.dataset.reply)
      return
    }
    if (target.closest("#quote-clear") !== null) {
      one("#quote").hidden = true
      return
    }
    if (target.closest('.bubble-say[role="button"]') !== null) {
      pin(target.closest(".row"))
    }
  })
  document.addEventListener("keydown", (event) => {
    const target = event.target instanceof Element ? event.target : null
    if (target?.matches('.bubble-say[role="button"]') === true && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault()
      pin(target.closest(".row"))
    }
  })
}

/** 立ち絵の動き。届いた瞬間の1回だけの動きのあと、続く動きへ移る。 */
function playMotion() {
  portrait.removeAttribute("data-motion")
  // 同じ動きをもう一度掛け直すために、いちど描かせる。
  void portrait.offsetWidth
  if (MOTION.intro === undefined || still) {
    portrait.dataset.motion = MOTION.base
    return
  }
  portrait.dataset.motion = MOTION.intro
  portrait.addEventListener(
    "animationend",
    () => {
      portrait.dataset.motion = MOTION.base
    },
    { once: true },
  )
}

function applyPack() {
  const root = document.documentElement
  root.style.setProperty("--accent", pack.accent)
  root.style.setProperty("--art", `url("${asset("background.png")}")`)
  for (const image of document.querySelectorAll("[data-pack-src]")) {
    image.src = asset(image.dataset.packSrc)
  }
  showExpression(SAY[FOLLOWED].expression)
}

function markBar() {
  for (const bar of document.querySelectorAll(".mock-bar-group")) {
    const name = bar.dataset.param
    for (const link of bar.querySelectorAll("a")) {
      const query = new URLSearchParams(location.search)
      query.set(name, link.dataset.value)
      link.href = `?${query.toString()}`
      if ((name === "form" ? form : moment) === link.dataset.value) {
        link.setAttribute("aria-current", "true")
      }
    }
  }
}

applyPack()
buildStrip()
buildLane()
// 入力欄の側の高さを先に決めてから、流れを末尾へ送る。
buildDock()
buildFlow()
markBar()
wireRows()
playMotion()

one("#replay").addEventListener("click", () => {
  pinned = null
  showExpression(SAY[FOLLOWED].expression)
  buildFlow()
  playMotion()
})

// 提案 B: 答え待ちのままタブへ戻ったとき、呼ぶ動きをもう一度だけ掛ける。
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && MOTION.intro === "beckon") {
    playMotion()
  }
})
