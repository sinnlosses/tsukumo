// キャラクターの振る舞いと吹き出しの見本。URL の検索引数から形・場面・パックを読み、会話の流れ・声の定位置・立ち絵の表情と動き・尻尾を組む。
// 今の形（form=now）の振る舞いは、2026-11-17 の main を疑似セッションで撮って測ったものに合わせてある。
// 提案（form=next）は、採用済みの A（声の定位置）・B（姿は局面に従う）の上に、G〜M を重ねた形。
// 中身はすべて架空で、実物の会話ではない。

const MOMENTS = ["greet", "work", "quiet", "ask", "late", "done", "idle"]
// face は立ち絵の絵の中の顔の位置（幅と高さに対する割合）。提案 G ではパックの定義に任意で持たせ、無ければ既定（中央・上から4分の1）を使う。
const PACKS = {
  shirasuzu: { name: "白鈴", accent: "#f9c3cd", face: { x: 0.5, y: 0.36 } },
  tsukumo: { name: "つくも", accent: "#6fe3cd", face: { x: 0.5, y: 0.2 } },
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
// 撮影用。提案の働く（後半）で、過去のセリフを押して留めた状態を出す。
const touched = next && moment === "late" && params.get("touch") === "1"
// 撮影用。届いた瞬間の1回だけの動き（表情ごとの動き・呼ぶ・祝う）を掛けずに、続く動きから始める。
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

// セリフ。now は今の言い方（していること・済んだことの実況）、text は提案 J・K の言い方（画面が言わないこと・利用者の助けになること・嬉しいこと）。
// now が無い行は、どちらの形でも同じ文。
const SAY = {
  hello: {
    text: "こんばんは。夜更けですから、軽い T-105 からにしませんか。",
    time: "23:10",
    expression: "excited",
  },
  got: {
    now: "並び替えの保存ですね。まず今の一覧の作りを見てきます。",
    text: "並びを覚えさせるんですね。保存の仕組みが要りそうなので、まず今の作りを見ます。",
    time: "14:25",
    expression: "thinking",
  },
  found: {
    now: "フェーズ1が済みました。並び順は画面のメモリだけにあって、開き直すと既定に戻っていました。保存先の候補は2つあります。",
    text: "……ん、保存する所がそもそも無いんです。思ったより手前から作りますね。",
    time: "14:26",
    expression: "curious",
  },
  hand: {
    now: "保存の仕組みは実装役に任せます。戻りを待ちますね。",
    text: "実装役に任せました。20分ほどかかるので、そのあいだ休んでいてくださいな。",
    time: "14:26",
    expression: "default",
  },
  ask: {
    now: "保存先が2通りあります。どちらにするか決めてください。",
    text: "ひとつだけ決めてほしいです。ほかの設定とそろえるなら「端末ごと」です。",
    time: "14:27",
    expression: "curious",
  },
  saved: {
    now: "フェーズ2が済みました。並び順を端末ごとの好みに保存して、読み込みで戻す仕組みが入りました。単体テストも6件通っています。次は一覧の画面につなぎます。",
    text: "ふふ、すんなり入りました。残りは画面につなぐだけです。",
    time: "14:30",
    expression: "proud",
  },
  done: {
    now: "ふふ、開き直しても並びが残るようになりました。",
    text: "ふふ、できました。まず「値が壊れていたとき」の行だけ、見てくださいな。",
    time: "14:32",
    expression: "proud",
  },
  wait: {
    now: "次に進めるときは、呼んでくださいね。",
    text: "今日はこれで5件目です。次は T-107 が着手できますよ。",
    time: "14:34",
    expression: "excited",
  },
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
  done: { state: "完了", current: 4, time: ["所要", "6分40秒"], steps: 14 },
  idle: { state: "完了", current: 4, time: ["所要", "6分40秒"], steps: 14 },
}

// 立ち絵が従っているセリフ（その場面でいちばん新しいセリフか反応）。表情はこのセリフのもの。
const FOLLOWED = {
  greet: "hello",
  work: "found",
  quiet: "hand",
  ask: "ask",
  late: "saved",
  done: "done",
  idle: "wait",
}[moment]

// 提案 I: セリフが届いた瞬間の、表情に合った1回だけの動き（立ち絵）と出方（吹き出し）。
// 表情の名前は tsukumo が持つ9つで、パックの中身には触れない。
const ARRIVAL = {
  default: { body: "nod", bubble: "pop" },
  thinking: { body: "lean", bubble: "ease" },
  proud: { body: "bounce", bubble: "swell" },
  excited: { body: "bounce", bubble: "swell" },
  flustered: { body: "flinch", bubble: "shake" },
  curious: { body: "tilt", bubble: "ease" },
  sad: { body: "sink", bubble: "sink" },
  bored: { body: "sink", bubble: "sink" },
  serious: { body: "still", bubble: "snap" },
}

// 立ち絵の続く動き（base）と、届いた瞬間の1回だけの動き（intro）。
// 今の形: 作業中は歩く、ターンが閉じて背景の作業だけを待つあいだは呼吸、答え待ちは歩く、完了は跳ねる。
// 提案 B: 局面に従う（背景の作業を待つあいだも歩く・答え待ちは呼ぶ）。提案 I: 届いた瞬間は表情に合った動き。提案 M: 作業の完了は祝う。
const BASE = {
  now: { greet: "breathe", work: "walk", quiet: "breathe", ask: "walk", late: "walk", done: "breathe", idle: "breathe" },
  next: { greet: "breathe", work: "walk", quiet: "walk", ask: "breathe", late: "walk", done: "breathe", idle: "breathe" },
}[form][moment]

function introMotion() {
  if (!next) {
    return moment === "done" ? "bounce" : undefined
  }
  if (moment === "quiet") {
    return undefined
  }
  if (moment === "ask") {
    return "beckon"
  }
  if (moment === "done") {
    return "celebrate"
  }
  return ARRIVAL[SAY[FOLLOWED].expression].body
}

const TAIL =
  '<svg class="tail" viewBox="0 0 14 12" aria-hidden="true"><path d="M3 0 0.5 11.5 13 0" /></svg>'

// 時刻は分が変わった行だけに出す（今の画面と同じ）。
let lastMinute = ""

function timeOf(time) {
  const changed = time !== lastMinute
  lastMinute = time
  return `<time class="v-time${changed ? "" : " is-quiet"}">${time}</time>`
}

function post(text, time, label) {
  const lead = label === undefined ? "" : `<span class="post-label">${label}</span>`
  return `<div class="row row-user"><div class="bubble bubble-post${label === undefined ? "" : " is-short"}"><span class="visually-hidden">あなた: </span>${lead}${text}</div><span class="v-meta">${timeOf(time)}</span></div>`
}

/**
 * セリフの行。live はいまの一言（明るさ）、follow は立ち絵が従っているセリフ（尻尾が付く）。
 * 今の形の尻尾は、吹き出しの左下から下へ向く決まった形。提案 G の尻尾は aimTail が立ち絵の顔へ向けて描く。
 */
function say(key, options = {}) {
  const line = SAY[key]
  const text = !next && line.now !== undefined ? line.now : line.text
  const live = options.live === true
  const follow = options.follow === true
  // 提案 H: 押すと、立ち絵がそのセリフの表情になる。
  const press = next ? ' role="button" tabindex="0" aria-pressed="false"' : ""
  const arrival = next && follow ? ` data-arrival="${ARRIVAL[line.expression].bubble}"` : ""
  const shape = `bubble bubble-say${live ? " is-live" : ""}${follow ? " is-followed" : ""}`
  const oldTail = !next && live ? TAIL : ""
  return `<div class="row row-say" data-say="${key}">
    <div class="${shape}" data-expression="${line.expression}"${press}${arrival}><span class="visually-hidden">${pack.name}: </span>${text}${oldTail}</div>
    <span class="v-meta">${timeOf(line.time)}</span>
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

/** 迎える場面の始め方の一覧。提案 A では、挨拶が見出しの役をするので「何から始める？」を出さない。 */
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
  // 立ち絵が従っているセリフ。働く・答えるあいだは明るくする（今の画面と同じ）。
  const followed = (key, live) => say(key, { live, follow: true })
  switch (moment) {
    case "greet":
      return [welcome()]
    case "work":
      return [
        request(),
        say("got"),
        group(slip(0), followed("found", true)),
        nowPill("読んでいる", "sort-order.ts", "4秒"),
      ]
    case "quiet":
      return [
        request(),
        say("got"),
        group(slip(0), followed("hand", true)),
        nowPill("背景で 委譲先に任せている", "実装役 · 保存の仕組みを足す", "6分12秒"),
      ]
    case "ask":
      return [
        request(),
        say("got"),
        group(slip(0), say("found")),
        group(followed("ask", true), inquiry()),
      ]
    case "late":
      return [
        request(),
        say("got"),
        group(slip(0), say("found")),
        group(say("ask"), questionSlip()),
        post(QUESTION.options[0][0], "14:28", "答え"),
        group(slip(1), followed("saved", true)),
        nowPill("書き換えている", "task-list.tsx", "18秒"),
      ]
    default: {
      const journey = [say("got"), group(slip(0), say("found")), group(slip(1), say("saved"))].join("")
      lastMinute = ""
      // 完了した直後は、立ち絵が締めのセリフに従う。2分たつと待ちの一言に従う。
      const head = [
        request(),
        disclose("作業の経過　4フェーズ・6分40秒・セリフ 6件・質問 1件", journey, " fold-pill"),
        group(moment === "done" ? followed("done", false) : say("done"), paper()),
      ]
      if (moment === "done") {
        return head
      }
      // 今の形: 待ちの一言は記録の位置（紙の後ろ＝流れの末尾）に積まれ、頭から読んでいる画面の外に出る。
      return next ? head : [...head, followed("wait", false)]
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
  const final =
    '<p class="lane-sub is-current"><span>最終</span><b>タスク一覧の…</b><span class="lane-keys"><kbd class="key">{</kbd><kbd class="key">}</kbd></span></p>'
  const sub = {
    late: '<p class="lane-sub is-current"><span>レポート</span><b>2/4 保存の仕組…</b></p>',
    done: final,
    idle: final,
  }[moment]
  const report = '<p class="lane-sub is-current"><span>レポート</span><b>1/4 今の一覧を…</b></p>'
  one("#lane-turns").innerHTML =
    `<li class="lane-turn"><p class="lane-title">タスク一覧の並び替えを…</p>${sub ?? report}</li>`
}

const portrait = one("#portrait")
let pinned = null

function buildFlow() {
  lastMinute = ""
  pinned = null
  one("#flow").innerHTML = flowRows().join("")
  const voice = one("#voice")
  voice.hidden = !voiced
  if (voiced) {
    lastMinute = ""
    voice.innerHTML = say(FOLLOWED, { live: true, follow: true })
  }
  const target = one(".scroll-target")
  if (moment === "idle" || moment === "done") {
    one("#scroller").scrollTop = 0
  } else if (target !== null) {
    target.scrollIntoView({ block: "end" })
  }
  if (touched) {
    pin(one('[data-say="found"] .bubble-say'))
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

function showExpression(expression) {
  portrait.src = asset(`${expression}.png`)
}

/** 立ち絵がいま従っているセリフの吹き出し。押して留めたセリフがあればそれ、無ければその場面でいちばん新しいセリフ。 */
function followedBubble() {
  return pinned ?? one(".bubble-say.is-followed")
}

/** 立ち絵の絵の中の顔の位置（画面の座標）。絵は箱の下端に寄せて、縦横比を保って収まっている。 */
function facePoint() {
  const box = portrait.getBoundingClientRect()
  const ratio = portrait.naturalWidth > 0 ? portrait.naturalWidth / portrait.naturalHeight : 1
  const width = Math.min(box.width, box.height * ratio)
  const height = width / ratio
  return {
    x: box.left + (box.width - width) / 2 + width * pack.face.x,
    y: box.bottom - height + height * pack.face.y,
  }
}

const TAIL_LENGTH = 20
const TAIL_HALF = 6

/** 吹き出しのすぐ下に続く物までの空き（px）。下に何も無ければ十分に大きい数。 */
function gapBelow(bubble, rect) {
  if (bubble.closest(".voice") !== null) {
    return 0
  }
  const row = bubble.closest(".row")
  const below = row.nextElementSibling ?? row.parentElement.nextElementSibling
  return below === null ? Number.POSITIVE_INFINITY : below.getBoundingClientRect().top - rect.bottom
}

/**
 * 提案 G: 尻尾を、立ち絵がいま従っているセリフ1件にだけ描き、立ち絵の顔へ向ける。
 * 根元は吹き出しの左下の角のそば（角の丸みが小さい所）に置く。顔が横にあれば左の辺から、下にあれば下の辺から出す。
 * すぐ下に物が続くときは下の辺を使わず、少し空いているときは空きに収まる長さにする（物の縁と重ねない）。
 */
function aimTail() {
  for (const old of document.querySelectorAll(".aim")) {
    old.remove()
  }
  for (const bubble of document.querySelectorAll(".bubble-say.has-aim")) {
    bubble.classList.remove("has-aim")
  }
  const bubble = followedBubble()
  if (!next || bubble === null) {
    return
  }
  const rect = bubble.getBoundingClientRect()
  const face = facePoint()
  const gap = gapBelow(bubble, rect)
  const corner = { x: rect.left, y: rect.bottom }
  const sideways = Math.abs(face.x - corner.x) >= Math.abs(face.y - corner.y)
  const fromLeft = sideways || gap < 12
  // 左下の角は丸みが 4px なので、根元をその内側の真っすぐな所に置く。
  const root = fromLeft
    ? {
        x: rect.left,
        y: Math.min(rect.bottom - 4 - TAIL_HALF, Math.max(rect.top + 16 + TAIL_HALF, face.y)),
      }
    : { x: rect.left + 4 + TAIL_HALF + 4, y: rect.bottom }
  const distance = Math.hypot(face.x - root.x, face.y - root.y)
  const unit = { x: (face.x - root.x) / distance, y: (face.y - root.y) / distance }
  // 先が下の物の縁を越えない長さ。左の辺から出すときも、下へ向くぶんだけ縮める。
  const reach = fromLeft ? rect.bottom + gap - 2 - root.y : gap - 3
  const room = unit.y > 0.2 && Number.isFinite(gap) ? reach / unit.y : TAIL_LENGTH
  const length = Math.max(8, Math.min(TAIL_LENGTH, room, distance - 12))
  const tip = { x: root.x + unit.x * length, y: root.y + unit.y * length }
  // 根元の2点は縁の線の 1.5px 内側に置き、塗りで縁の線を覆う。線は外へ出る2辺だけに引く。
  const base = fromLeft
    ? [
        { x: rect.left + 1.5, y: root.y - TAIL_HALF },
        { x: rect.left + 1.5, y: root.y + TAIL_HALF },
      ]
    : [
        { x: root.x + TAIL_HALF, y: rect.bottom - 1.5 },
        { x: root.x - TAIL_HALF, y: rect.bottom - 1.5 },
      ]
  const local = (point) => `${(point.x - rect.left).toFixed(1)} ${(point.y - rect.top).toFixed(1)}`
  bubble.classList.add("has-aim")
  bubble.insertAdjacentHTML(
    "beforeend",
    `<svg class="aim" aria-hidden="true"><path d="M${local(base[0])} L${local(tip)} L${local(base[1])}" /></svg>`,
  )
}

/** 提案 H: セリフを押すと、立ち絵がそのセリフの表情になり、尻尾もそのセリフへ移る。もう一度押すと最新へ戻る。 */
function pin(bubble) {
  if (bubble === null || bubble.getAttribute("role") !== "button") {
    return
  }
  const same = pinned === bubble
  pinned?.setAttribute("aria-pressed", "false")
  pinned = same || bubble.classList.contains("is-followed") ? null : bubble
  pinned?.setAttribute("aria-pressed", "true")
  document.body.classList.toggle("is-pinned", pinned !== null)
  showExpression((pinned ?? one(".bubble-say.is-followed")).dataset.expression)
  aimTail()
}

/** 提案 L: 立ち絵を押すと、留めたセリフを解いて、いまの一言へ戻る（流れを送り、届いた瞬間の出方と動きをもう一度掛ける）。 */
function returnToLatest() {
  if (pinned !== null) {
    pin(pinned)
  }
  const latest = one(".bubble-say.is-followed")
  if (latest === null) {
    return
  }
  latest.scrollIntoView({ block: "nearest", behavior: "smooth" })
  latest.classList.remove("is-arriving")
  void latest.offsetWidth
  latest.classList.add("is-arriving")
  playMotion(ARRIVAL[latest.dataset.expression].body)
}

/** 立ち絵の動き。届いた瞬間の1回だけの動きのあと、続く動きへ移る。 */
function playMotion(intro) {
  portrait.removeAttribute("data-motion")
  one("#sparkle").hidden = true
  // 同じ動きをもう一度掛け直すために、いちど描かせる。
  void portrait.offsetWidth
  if (intro === undefined || intro === "still" || still) {
    portrait.dataset.motion = BASE
    return
  }
  portrait.dataset.motion = intro
  // 提案 M: 作業の完了は、2回跳ねて、差し色の光を散らす。
  one("#sparkle").hidden = intro !== "celebrate"
  portrait.addEventListener(
    "animationend",
    () => {
      portrait.dataset.motion = BASE
      aimTail()
    },
    { once: true },
  )
}

function arrive() {
  const latest = one(".bubble-say.is-followed")
  if (next && latest !== null && !still) {
    latest.classList.add("is-arriving")
  }
  playMotion(introMotion())
}

function wire() {
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null
    const bubble = target?.closest('.bubble-say[role="button"]') ?? null
    if (bubble !== null) {
      pin(bubble)
    }
  })
  document.addEventListener("keydown", (event) => {
    const target = event.target instanceof Element ? event.target : null
    // 留めたセリフは Esc でも解ける。
    if (event.key === "Escape" && pinned !== null) {
      pin(pinned)
      return
    }
    if (event.key !== "Enter" && event.key !== " ") {
      return
    }
    if (target?.matches('.bubble-say[role="button"]') === true) {
      event.preventDefault()
      pin(target)
    }
    if (target === portrait && next) {
      event.preventDefault()
      returnToLatest()
    }
  })
  if (!next) {
    return
  }
  portrait.setAttribute("role", "button")
  portrait.setAttribute("tabindex", "0")
  portrait.setAttribute("aria-label", `${pack.name}（押すと、いまの一言へ戻る）`)
  portrait.addEventListener("click", returnToLatest)
  // 提案 L: 入力欄に書いているあいだ、立ち絵が入力欄の側へ身を寄せて聞く。
  one("#draft").addEventListener("input", (event) => {
    portrait.toggleAttribute("data-listening", event.target.value !== "")
  })
  one("#scroller").addEventListener("scroll", aimTail, { passive: true })
  window.addEventListener("resize", aimTail)
  portrait.addEventListener("load", aimTail)
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
wire()
arrive()
aimTail()

one("#replay").addEventListener("click", () => {
  showExpression(SAY[FOLLOWED].expression)
  document.body.classList.remove("is-pinned")
  buildFlow()
  arrive()
  aimTail()
})

// 提案 B: 答え待ちのままタブへ戻ったとき、呼ぶ動きをもう一度だけ掛ける。
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && next && moment === "ask") {
    playMotion("beckon")
  }
})
