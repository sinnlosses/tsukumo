// いまの行と進み具合の置き場の見本。URL の検索引数から形・場面を読み、進み具合・会話の流れ・入力欄・立ち絵を組む。
// 今の形（form=now）は、2026-11-18 の main を疑似セッション（work-plan・delegated-range）で撮って測った形に合わせてある。
// 案A は進行の帯に、案B は入力欄の頭に、案C は立ち絵の手元に、進み具合といまの手順を1か所にまとめる。
// 練った案（form=d）は、進行の帯を、2026-11-15 に戻した器（履歴 b789339c9）の紙の頭の判定・灯り・計画の一覧の形に育て、
// 走っている手順を今の段の行の中へ入れる。
// 中身はすべて架空で、実物の会話ではない。

const FORMS = ["now", "a", "b", "c", "d", "e"]
const MOMENTS = ["work", "long", "late", "deleg", "ask", "stop", "away", "done"]
const PACK = { id: "shirasuzu", name: "白鈴", accent: "#f9c3cd", face: { x: 0.5, y: 0.36 } }

const params = new URLSearchParams(location.search)

function pick(name, allowed) {
  const value = params.get(name)
  return allowed.includes(value) ? value : allowed[0]
}

const form = pick("form", FORMS)
const moment = pick("moment", MOMENTS)
const open = params.get("open") === "steps"
const up = params.get("up") === "1"
const fold = params.get("fold") === "1"

document.body.dataset.p = "spec goal"
document.body.dataset.form = form
document.body.dataset.moment = moment
if (params.get("bar") === "0") {
  document.body.dataset.bar = "0"
}
if (open) {
  document.body.dataset.open = "steps"
}

function one(selector) {
  return document.querySelector(selector)
}

function icon(name, extra = "") {
  return `<svg viewBox="0 0 24 24" class="icon${extra}" aria-hidden="true"><use href="#i-${name}" /></svg>`
}

function asset(file) {
  return `../../../../characters/${PACK.id}/${file}`
}

const REQUEST = "タスク一覧の並び替えを、開き直しても残るようにしたい"

const PHASES = [
  {
    name: "今の一覧を調べる",
    time: "48秒",
    note: "並び順は画面のメモリだけにあり、開き直すと既定に戻っていた。保存先の候補は2つある。",
    steps: [
      ["Read", "task-list.tsx"],
      ["Grep", "sortOrder"],
      ["Read", "local-preference.ts"],
    ],
  },
  {
    name: "保存の仕組みを足す",
    time: "2分10秒",
    note: "並び順を端末ごとの好みに保存し、読み込みで戻す仕組みを足した。単体テスト 6 件が通った。",
    steps: [
      ["Read", "sort-order.ts"],
      ["Edit", "sort-order.ts"],
      ["Bash", "pnpm run test sort-order"],
    ],
  },
  {
    name: "一覧の画面に反映する",
    time: "1分32秒",
    note: "",
    steps: [
      ["Read", "task-list.tsx"],
      ["Edit", "task-list.tsx"],
    ],
  },
  { name: "検証する", time: "2分10秒", note: "", steps: [["Bash", "pnpm run check"]] },
]

const SAY = {
  got: {
    text: "並びを覚えさせるんですね。保存の仕組みが要りそうなので、まず今の作りを見ます。",
    time: "14:25",
    expression: "thinking",
  },
  found: {
    text: "……ん、保存する所がそもそも無いんです。思ったより手前から作りますね。",
    time: "14:26",
    expression: "curious",
  },
  hand: {
    text: "実装役に任せました。20分ほどかかるので、そのあいだ休んでいてくださいな。",
    time: "14:26",
    expression: "default",
  },
  ask: {
    text: "ひとつだけ決めてほしいです。ほかの設定とそろえるなら「端末ごと」です。",
    time: "14:27",
    expression: "curious",
  },
  shape: {
    text: "端末ごとにしますね。古い形の値が残っていても読めるように、読み込みの側で直します。",
    time: "14:28",
    expression: "default",
  },
  test: {
    text: "単体テストを先に書きました。壊れた値を渡すと既定の並びに戻ることも確かめます。",
    time: "14:29",
    expression: "thinking",
  },
  saved: {
    text: "ふふ、すんなり入りました。残りは画面につなぐだけです。",
    time: "14:30",
    expression: "proud",
  },
  done: {
    text: "ふふ、できました。まず「値が壊れていたとき」の行だけ、見てくださいな。",
    time: "14:32",
    expression: "proud",
  },
}

const QUESTION = {
  label: "保存先",
  text: "並び順はどこに保存しますか？",
  options: [
    ["端末ごとに保存", "この端末のブラウザにだけ残す。ほかの端末には引き継がない。"],
    ["設定ファイルに保存", "プロジェクトの設定に書く。端末をまたいで同じ並びになる。"],
  ],
}

/**
 * 場面ごとの進み具合。current は今のフェーズ（0始まり。4 は全部済み）。
 * now は走っている手順（動詞・対象・経過）で、作業中だけ持つ。対象の字は道具の入力の要約のまま。
 */
const STATUS = {
  work: {
    state: "作業中",
    current: 1,
    elapsed: ["経過", "1分52秒"],
    phaseTime: "52秒〜",
    steps: 5,
    now: { verb: "書き換えている", target: "sort-order.ts", time: "18秒", mono: true },
    running: 1,
  },
  long: {
    state: "作業中",
    current: 1,
    elapsed: ["経過", "4分40秒"],
    phaseTime: "3分40秒〜",
    steps: 5,
    now: {
      verb: "コマンドを走らせている",
      target: "pnpm run test sort-order",
      time: "2分18秒",
      mono: true,
      remark: "長く掛かっている",
    },
    running: 1,
  },
  late: {
    state: "作業中",
    current: 2,
    elapsed: ["経過", "5分12秒"],
    phaseTime: "40秒〜",
    steps: 8,
    now: { verb: "書き換えている", target: "task-list.tsx", time: "6秒", mono: true },
    running: 1,
  },
  deleg: {
    state: "背景で作業中",
    current: 1,
    elapsed: ["経過", "7分02秒"],
    phaseTime: "6分14秒〜",
    steps: 4,
    now: {
      verb: "背景で 委譲先に任せている",
      target: "実装役 · 保存の仕組みを足す",
      time: "6分12秒",
      mono: false,
    },
    running: 0,
  },
  ask: {
    state: "答え待ち",
    current: 1,
    asking: true,
    elapsed: ["経過", "2分20秒"],
    phaseTime: "1分20秒〜",
    steps: 4,
  },
  // 今の形は、止めたやり取りでも帯の札が「完了」と言う（2026-11-18 の main で見つかった食い違い）。
  stop: { state: "完了", current: 1, elapsed: ["経過", "2分02秒"], phaseTime: "1分02秒", steps: 4 },
  // 答えたあと離れ、そのあいだに2段目が済んだ。unseen は見ていないあいだに済んだ段。
  away: {
    state: "作業中",
    current: 2,
    elapsed: ["経過", "16分40秒"],
    phaseTime: "38秒〜",
    steps: 8,
    now: { verb: "書き換えている", target: "task-list.tsx", time: "12秒", mono: true },
    running: 1,
    unseen: [1],
  },
  done: { state: "完了", current: 4, elapsed: ["所要", "6分40秒"], steps: 9 },
}

const status = STATUS[moment]
const finished = status.current >= PHASES.length
const STATE_COLOR = {
  作業中: "var(--accent)",
  背景で作業中: "var(--accent)",
  答え待ち: "var(--warn)",
  完了: "var(--ok)",
}

// 立ち絵が従っているセリフ（その場面でいちばん新しいセリフ）。表情はこのセリフのもの。
const FOLLOWED = {
  work: "found",
  long: "found",
  late: "saved",
  deleg: "hand",
  ask: "ask",
  stop: "found",
  away: "saved",
  done: "done",
}[moment]

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

/** セリフの行。live はいまの一言（明るさ）、follow は立ち絵が従っているセリフ（尾が付く）。 */
function say(key, options = {}) {
  const line = SAY[key]
  const live = options.live === true
  const follow = options.follow === true
  const shape = `bubble bubble-say${live ? " is-live" : ""}${follow ? " is-followed" : ""}`
  return `<div class="row row-say" data-say="${key}">
    <div class="${shape}" data-expression="${line.expression}" role="button" tabindex="0" aria-pressed="false"><span class="visually-hidden">${PACK.name}: </span>${line.text}</div>
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

/** 今の形の、流れの末尾のいまの行（左寄せの小さな札）。 */
function nowPill() {
  const now = status.now
  const target = now.mono ? `<code>${now.target}</code>` : `<span class="now-target">${now.target}</span>`
  const remark = now.remark === undefined ? "" : `<span class="now-remark">${now.remark}</span>`
  return `<p class="now-pill scroll-target${now.remark === undefined ? "" : " is-slow"}"><span class="spinner"></span><b>${now.verb}</b>${target}<time>${now.time}</time>${remark}</p>`
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
    <ol class="options">${options}</ol>
    <footer class="inquiry-foot"><button class="quiet-button" type="button">おすすめに任せる（${QUESTION.options[0][0]}）</button><span class="inquiry-foot-gap"></span><button class="answer-button" type="button">これで答える ${icon("enter", " icon-sm")}</button></footer>
  </section>`
}

/** 止めたやり取りの末尾の札（今の画面と同じく、流れの札は「止めた」と言う）。 */
function stopSlip() {
  return `<section class="thing slip is-stopped">
    <header class="slip-head"><span class="slip-mark">${icon("stop")}</span><span>止めた　2/${PHASES.length} ${PHASES[1].name} の途中</span></header>
  </section>`
}

/** 離れていたあいだに足された行の手前の境目の線（今の画面の固定の文）。 */
function awaySeam() {
  return '<p class="away-seam"><span>離れていた 12分のあいだに、フェーズが1つ済んだ</span></p>'
}

function questionSlip() {
  return `<section class="thing slip">
    <header class="slip-head"><span class="slip-mark">${icon("question")}</span><span>${QUESTION.label}: ${QUESTION.text}</span></header>
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
      <h2>ほかの端末には引き継がない</h2>
      <p>保存先は端末ごとなので、別の端末では既定の並びから始まる。引き継ぎたくなったら、設定ファイルへ移す道が残っている。</p>
    </div>
  </section>`
}

function flowRows() {
  const request = () => post(REQUEST, "14:25")
  const followed = (key) => say(key, { live: true, follow: true })
  // 今の形だけ、流れの末尾にいまの行を置く。
  const tail = form === "now" && status.now !== undefined ? [nowPill()] : []
  switch (moment) {
    case "work":
    case "long":
      return [request(), say("got"), group(slip(0), followed("found")), ...tail]
    case "deleg":
      return [request(), say("got"), group(slip(0), followed("hand")), ...tail]
    case "ask":
      return [request(), say("got"), group(slip(0), say("found")), group(followed("ask"), inquiry())]
    case "late":
      return [
        request(),
        say("got"),
        group(slip(0), say("found")),
        group(say("ask"), questionSlip()),
        post(QUESTION.options[0][0], "14:28", "答え"),
        say("shape"),
        say("test"),
        group(slip(1), followed("saved")),
        ...tail,
      ]
    case "stop":
      return [request(), say("got"), group(slip(0), followed("found")), stopSlip()]
    case "away":
      return [
        request(),
        say("got"),
        group(slip(0), say("found")),
        group(say("ask"), questionSlip()),
        post(QUESTION.options[0][0], "14:28", "答え"),
        awaySeam(),
        say("shape"),
        say("test"),
        group(slip(1), followed("saved")),
        ...tail,
      ]
    default: {
      const journey = [say("got"), group(slip(0), say("found")), group(slip(1), say("saved"))].join("")
      lastMinute = ""
      return [
        request(),
        disclose("作業の経過　4フェーズ・6分40秒・セリフ 6件・質問 1件", journey, " fold-pill"),
        group(say("done", { follow: true }), paper()),
      ]
    }
  }
}

/** フェーズの丸の並び。済んだ丸は印、今の丸は枠、答え待ちは「?」。 */
function dots() {
  if (many !== "") {
    return longDots()
  }
  return PHASES.map((_, index) => {
    if (index < status.current) {
      return `<span class="phase-dot is-done">${icon("check")}</span>`
    }
    if (index === status.current) {
      return status.asking === true
        ? '<span class="phase-dot is-asking">?</span>'
        : `<span class="phase-dot is-current">${index + 1}</span>`
    }
    return `<span class="phase-dot">${index + 1}</span>`
  })
    .map((dot, index) =>
      index === 0 ? dot : `<i class="phase-link${index <= status.current ? " is-done" : ""}"></i>${dot}`,
    )
    .join("")
}

/**
 * ?many=fold|window で、帯の丸と今のフェーズの名前だけを12段の計画（委譲の範囲がある並び。前1・本9・後2）に替える。at は今の段（1始まり。既定 3）。
 * 丸の番号は群（前・本・後）ごとに1から数える（本物の帯と同じ）。
 * fold は今の決まり: 9段以上で、今の段の前に3つ以上済んでいれば、済んだ丸を「✓n」に畳む（今の段より先は畳まない。n は群をまたいだ数）。
 * window は提案: 今いる群の名を頭に置き、その群の済んだ丸を「✓n」に、次の丸より先を「あと n」に畳む。丸の並びの幅は段の数によらず一定になる。
 * 見本は12段で畳むが、提案の決まりでは丸を全部並べた幅が畳んだ幅を越える6段から畳む。
 */
const LONG_PLAN = [
  ["前", "計画を確かめる"],
  ["本", "型を足す"],
  ["本", "保存の仕組みを足す"],
  ["本", "読み込みで並びを戻す"],
  ["本", "一覧の画面に反映する"],
  ["本", "並べ替えの口を足す"],
  ["本", "設定の画面に足す"],
  ["本", "古い値を読み替える"],
  ["本", "E2E を足す"],
  ["本", "文書をそろえる"],
  ["後", "受け入れ"],
  ["後", "振り返り"],
]
const many = ["fold", "window"].includes(params.get("many")) ? params.get("many") : ""
const longAt = Math.min(Math.max(Number(params.get("at") ?? "3") || 3, 1), LONG_PLAN.length) - 1
const longCurrent = finished ? LONG_PLAN.length : longAt

function isSpanHead(index) {
  return index === 0 || LONG_PLAN[index - 1][0] !== LONG_PLAN[index][0]
}

function spanStart(index) {
  let start = index
  while (!isSpanHead(start)) {
    start -= 1
  }
  return start
}

/** 帯に並べる要素。head は前に群の名を置くか（置いた要素は前の要素と線でつながない）。 */
function longItems() {
  const total = LONG_PLAN.length
  const cur = longCurrent
  if (many === "fold") {
    const all = LONG_PLAN.map((_, index) => ({ kind: "dot", index, head: isSpanHead(index) }))
    return cur >= total || cur <= 2 ? all : [{ kind: "fold", count: cur, head: false }, ...all.slice(cur)]
  }
  if (cur >= total) {
    return [{ kind: "fold", count: total, head: false }]
  }
  const start = spanStart(cur)
  const items = []
  if (cur - start >= 2) {
    items.push({ kind: "fold", count: cur - start, head: true })
  } else if (cur - start === 1) {
    items.push({ kind: "dot", index: start, head: true })
  }
  items.push({ kind: "dot", index: cur, head: start === cur })
  if (cur + 1 < total) {
    items.push({ kind: "dot", index: cur + 1, head: isSpanHead(cur + 1) })
  }
  // 残りが1つなら「あと 1」より丸のほうが狭く、名前も読めるので丸のまま置く。
  const rest = total - cur - 2
  if (rest === 1) {
    items.push({ kind: "dot", index: total - 1, head: isSpanHead(total - 1) })
  } else if (rest > 1) {
    items.push({ kind: "rest", count: rest, head: false })
  }
  return items
}

function longDot(index) {
  const cur = longCurrent
  if (index < cur) {
    return `<span class="phase-dot is-done">${icon("check")}</span>`
  }
  const number = index - spanStart(index) + 1
  if (index === cur) {
    return status.asking === true
      ? '<span class="phase-dot is-asking">?</span>'
      : `<span class="phase-dot is-current">${number}</span>`
  }
  return `<span class="phase-dot">${number}</span>`
}

/** 12段の計画の丸の並び。群の名の前は線でつながず、「あと n」の前は点線でつなぐ。 */
function longDots() {
  const items = longItems()
  const currentSpan = LONG_PLAN[longCurrent]?.[0]
  return items
    .map((item, position) => {
      if (item.kind === "rest") {
        return `<i class="phase-link is-more"></i><span class="phase-rest" title="残り ${item.count} フェーズ">あと<b>${item.count}</b></span>`
      }
      const previous = items[position - 1]
      const span = item.kind === "fold" ? currentSpan : LONG_PLAN[item.index][0]
      const label =
        item.head && span !== undefined
          ? `<span class="phase-span${span === currentSpan ? " is-current" : ""}">${span}</span>`
          : ""
      const done = previous !== undefined && (previous.kind === "fold" || previous.index < longCurrent)
      const link =
        previous === undefined || item.head ? "" : `<i class="phase-link${done ? " is-done" : ""}"></i>`
      const body =
        item.kind === "fold"
          ? `<span class="phase-fold" title="済んだ ${item.count} フェーズ">${icon("check")}${item.count}</span>`
          : longDot(item.index)
      return `${link}${label}${body}`
    })
    .join("")
}

function phaseName() {
  if (many !== "") {
    return finished ? `${LONG_PLAN.length}フェーズすべて済み` : LONG_PLAN[longCurrent][1]
  }
  return finished ? `${PHASES.length}フェーズすべて済み` : PHASES[status.current].name
}

/** 状態の札（点と字）。案A〜C では、作業中は走っている手順がこの位置に入り、札は出さない。 */
function stateChip() {
  return `<span class="strip-state" style="--state: ${STATE_COLOR[status.state]}">${status.state}</span>`
}

/** 案A〜C の、いまの手順の1かたまり（回る印・動詞・対象・経過）。作業中でなければ状態の札。 */
function nowUnit(extra = "") {
  const now = status.now
  if (now === undefined) {
    const note = status.asking === true ? '<span class="now-sub">質問 1件</span>' : ""
    return `<span class="now-unit is-state${extra}">${stateChip()}${note}</span>`
  }
  const target = `<span class="now-target${now.mono ? " is-mono" : ""}">${now.target}</span>`
  const remark = now.remark === undefined ? "" : `<span class="now-remark">${now.remark}</span>`
  const slow = now.remark === undefined ? "" : " is-slow"
  return `<span class="now-unit${slow}${extra}"><span class="spinner"></span><b class="now-verb">${now.verb}</b>${target}<time class="now-time">${now.time}</time>${remark}</span>`
}

function stepsButton() {
  return `<button class="strip-steps" type="button" aria-expanded="${open}">${icon(open ? "chevron" : "chevron-right", " icon-sm")}手順 ${status.steps}件</button>`
}

/** 今の形の進行の帯（2026-11-18 の main と同じ並び）。 */
function stripNow() {
  return `
    ${stateChip()}
    <span class="strip-phases">${dots()}</span>
    <span class="strip-name${finished ? " is-plain" : ""}">${phaseName()}</span>
    <span class="strip-time">${status.elapsed[0]}<b>${status.elapsed[1]}</b></span>
    ${stepsButton()}`
}

/**
 * 案A・B の、位置（丸と今のフェーズ）と、そのフェーズの中で走っている手順を「›」でつないだかたまり。
 * 全部済んだら手順は無いので、今の形と同じく状態の札を頭に置き、「›」でつながない。
 */
function crumb() {
  if (finished) {
    return `${stateChip()}<span class="strip-phases">${dots()}</span><span class="crumb"><span class="strip-name is-plain">${phaseName()}</span></span>`
  }
  return `
    <span class="strip-phases">${dots()}</span>
    <span class="crumb">
      <span class="strip-name">${phaseName()}</span>
      <span class="crumb-sep" aria-hidden="true">›</span>
      ${nowUnit()}
    </span>`
}

/** 案A: 帯の1行に、位置と、その下で走っている手順を並べる。 */
function stripA() {
  return `
    ${crumb()}
    <span class="strip-time">${status.elapsed[0]}<b>${status.elapsed[1]}</b></span>
    ${stepsButton()}`
}

/** 案B: 入力欄の頭の1行。答え待ちは知らせと「選択肢へ」の口もここに入る（入力欄の上の帯は出さない）。 */
function railB() {
  const ask =
    status.asking === true
      ? `<button class="status-rail-go" type="button">選択肢へ<kbd class="key">↑</kbd></button>`
      : ""
  return `
    ${crumb()}
    ${ask}
    <span class="strip-time">${status.elapsed[0]}<b>${status.elapsed[1]}</b></span>
    ${stepsButton()}`
}

/** 案C: 立ち絵の頭の上の札。丸と経過、今のフェーズ、走っている手順、手順の口を縦に積む。 */
function tagC() {
  const now = status.now
  const body =
    now === undefined
      ? `<p class="tag-now is-state">${stateChip()}${status.asking === true ? '<span class="now-sub">質問 1件</span>' : ""}</p>`
      : `<p class="tag-now${now.remark === undefined ? "" : " is-slow"}"><span class="spinner"></span><b class="now-verb">${now.verb}</b></p>
         <p class="tag-target${now.mono ? " is-mono" : ""}"><span>${now.target}</span><time class="now-time">${now.time}</time></p>
         ${now.remark === undefined ? "" : `<p class="tag-target"><span class="now-remark">${now.remark}</span></p>`}`
  return `
    <p class="tag-head"><span class="strip-phases">${dots()}</span></p>
    <p class="tag-name${finished ? " is-plain" : ""}">${phaseName()}</p>
    ${body}
    <p class="tag-foot"><span class="strip-time">${status.elapsed[0]}<b>${status.elapsed[1]}</b></span>${stepsButton()}</p>`
}

/**
 * 新案（form=e）ステータスピル。1本のピルが、状態の灯り・今のフェーズ・いまの手順の一文・手順の秒・位置・目安の残りを持ち、
 * ピルの下線が全フェーズを等分した進み具合になる（フェーズが何個でも下線の長さは変わらない）。働くあいだは、今の区間の中を線が始端から終端へ伸びて、また始端に戻る。
 * 下線の区間を押すとそのフェーズの詳細、右端の「手順」を押すと全体の詳細が、ピルの下に重なって出る（外を押すと閉じる。Popover API の auto）。
 * 答え待ち・止めた・完了は、ピルの灯りと語で言う。完了で緑になるのはチェックの印だけで、下線は差し色のまま。
 * 同じことを流れ（質問の札・作業の経過・離席の境目）が言う場面では、ピルは状態の語だけにして繰り返さない。
 * ?open=steps で全体の詳細を、?phase=1〜 でその区間の詳細を開いた形にする（撮影用）。
 * ?place=dock で、ピルを入力欄の真上に置き、詳細を上へ出す（既定は上端）。
 * ?many=fold|window のとき（どちらでも）、計画を12フェーズにする。at は今のフェーズ（1始まり）。
 */
const ISLAND = {
  work: { now: ["sort-order.ts", "を書き換えています"], time: "18秒", eta: [3, 5] },
  long: { now: ["pnpm run test sort-order", "を走らせています"], time: "2分18秒", eta: [4, 7] },
  late: { now: ["task-list.tsx", "を書き換えています"], time: "6秒", eta: [1, 3] },
  deleg: { now: ["", "実装役に任せています"], time: "6分12秒", aside: "最後の動きは 14秒前", eta: [5, 9] },
  ask: { tone: "ask", title: "返事を待っています", now: ["", "質問 1件"] },
  stop: { tone: "stop", title: "止めました", action: ["続きを頼む", "enter"] },
  away: { now: ["task-list.tsx", "を書き換えています"], time: "12秒", eta: [1, 2] },
  done: { tone: "done", title: "できました" },
}
const place = params.get("place") === "dock" ? "dock" : "top"
document.body.dataset.place = place

/** 新案が使う計画（名前の並び）と今の位置。済んだフェーズの所要は4フェーズの計画だけが持つ。 */
function islandPlan() {
  if (many !== "") {
    return { names: LONG_PLAN.map(([, name]) => name), current: longCurrent, unseen: [] }
  }
  return { names: PHASES.map((phase) => phase.name), current: status.current, unseen: status.unseen ?? [] }
}

/**
 * いまの手順の一文。対象（等幅）が長いときは、末尾の語を残して中ほどを「…」で縮める（コマンドやパスは末尾が見分けの手がかり）。
 */
function islandNow(parts) {
  const [code, rest] = parts
  if (code === "") {
    return `<span class="isl-verb">${rest}</span>`
  }
  const cut = code.lastIndexOf(" ")
  const target =
    cut < 0
      ? `<code class="isl-code"><span class="isl-code-head">${code}</span></code>`
      : `<code class="isl-code"><span class="isl-code-head">${code.slice(0, cut)}</span><span class="isl-code-tail is-split">${code.slice(cut + 1)}</span></code>`
  return `${target}<span class="isl-verb">${rest}</span>`
}

/** 区間の状態（済んだ・今・まだ）。完了したら全部が済んだ。 */
function islandSegState(plan, tone, index) {
  return tone === "done" || index < plan.current ? "done" : index === plan.current ? "current" : "todo"
}

/**
 * ピルの下線。フェーズを等分し、済んだ・今・まだを塗り分ける。見ていないあいだに済んだフェーズは濃く塗る。
 * 区間ごとにボタンで、押すとそのフェーズの詳細を開く（線は細いので、押せる高さは線の上下に広げる）。
 */
function islandTrack(plan, tone) {
  const total = plan.names.length
  const items = plan.names
    .map((name, index) => {
      const state = islandSegState(plan, tone, index)
      const unseen = plan.unseen.includes(index) ? " is-unseen" : ""
      const word = { done: "済み", current: "いま", todo: "これから" }[state]
      return `<li><button class="isl-hit" type="button" popovertarget="isl-phase-${index}" aria-label="フェーズ ${index + 1}/${total} ${name}（${word}）"><span class="isl-seg${unseen}" data-state="${state}"></span></button></li>`
    })
    .join("")
  return `<ol class="isl-track">${items}</ol>`
}

/** 区間を押したときの、そのフェーズの詳細。済んだフェーズはまとめと手順、今のフェーズはいまの手順、まだのフェーズは名前だけ。 */
function islandPhase(plan, data, tone, index) {
  const total = plan.names.length
  const state = islandSegState(plan, tone, index)
  const phase = many === "" ? PHASES[index] : undefined
  const mark =
    state === "done"
      ? icon("check")
      : state === "current"
        ? '<span class="isl-ring"></span>'
        : '<span class="isl-hollow"></span>'
  const time =
    state === "done"
      ? (phase?.time ?? "")
      : state === "current"
        ? `${status.phaseTime ?? ""}`
        : ""
  const word = { done: "済み", current: tone === "ask" ? "返事待ち" : tone === "stop" ? "止めた" : "いま", todo: "これから" }[state]
  const head = `<header class="isl-pop-head"><span class="isl-mark">${mark}</span><b>${plan.names[index]}</b><span class="isl-pop-meta">${index + 1}/${total} · ${word}${time === "" ? "" : ` · <time>${time}</time>`}</span></header>`
  if (state === "todo") {
    return `${head}<p class="isl-pop-note">${index === plan.current + 1 ? "今のフェーズが済んだら始めます。" : "まだ始めていません。"}</p>`
  }
  // まとめはフェーズが済んだときに書かれるので、今のフェーズにはまだ無い。
  const note = state === "done" && phase?.note ? `<p class="isl-pop-note">${phase.note}</p>` : ""
  const steps = phase?.steps ?? [
    ["Read", "settings-panel.tsx"],
    ["Grep", "sortOrder"],
  ]
  const live =
    state === "current" && tone === "run"
      ? `<li class="is-live"><span class="isl-mark"><span class="isl-lamp"></span></span>${islandNow(data.now)}<time>${data.time}</time></li>`
      : ""
  const past = steps
    .filter(([tool]) => state === "done" || tool === "Read" || tool === "Grep")
    .map(
      ([tool, target]) =>
        `<li><span class="isl-mark">${icon("check")}</span><code>${target}</code><span>を${TOOL_VERB[tool]}</span></li>`,
    )
    .join("")
  return `${head}${note}<ul class="isl-acts">${live}${past}</ul>`
}

/** 目安の残り（分の幅）。12フェーズの見本は、残りのフェーズの数から決める。 */
function islandEta(plan, data) {
  if (data.eta === undefined) {
    return undefined
  }
  if (many === "") {
    return data.eta
  }
  const left = plan.names.length - plan.current - 1
  return [Math.max(1, Math.round(left * 0.7)), Math.max(2, Math.round(left * 1.2))]
}

/** 依頼全体の経過。12フェーズの見本は、畳んだ済みのフェーズの所要と今のフェーズの所要を足した値。 */
function islandElapsed() {
  return many === "" ? status.elapsed[1] : "9分22秒"
}

/** タブの題。別のタブにいても、位置と状態が読める。 */
function islandTitle(plan, data, tone) {
  const total = plan.names.length
  const head =
    tone === "run"
      ? `${plan.current + 1}/${total} ${plan.names[plan.current]}`
      : tone === "ask"
        ? "返事待ち"
        : data.title
  return `${head} · tsukumo`
}

function islandRow(plan, data, tone) {
  const total = plan.names.length
  const phase = plan.names[Math.min(plan.current, total - 1)]
  const mark =
    tone === "done"
      ? icon("check")
      : tone === "stop"
        ? '<span class="isl-stop-mark"></span>'
        : '<span class="isl-lamp"></span>'
  const lamp = `<span class="isl-lamp-box">${mark}</span>`
  const head = data.title !== undefined ? data.title : phase
  const now = tone === "stop" ? ["", `${phase}の途中`] : data.now
  // 手順の秒は一文と同じ枠に入れ、手順が替わるときは一文ごと入れ替える（秒だけが横へ跳ばない）。
  const time = data.time === undefined ? "" : `<time class="isl-time">${data.time}</time>`
  const nowPart =
    now === undefined
      ? ""
      : `<span class="isl-rule" aria-hidden="true"></span><span class="isl-now">${islandNow(now)}${time}</span>`
  const aside = data.aside === undefined ? "" : `<span class="isl-aside">${data.aside}</span>`
  const minutes = islandEta(plan, data)
  const eta = minutes === undefined ? "" : `<span class="isl-eta">あと${minutes[0]}〜${minutes[1]}分</span>`
  const position = tone === "done" ? "" : `<span class="isl-pos"><b>${plan.current + 1}</b>/${total}</span>`
  const action =
    data.action === undefined
      ? ""
      : `<button class="isl-action" type="button">${data.action[0]}${icon(data.action[1], " icon-sm")}</button>`
  const toggle = `<button class="isl-toggle" type="button" popovertarget="isl-plan">手順${icon("chevron", " icon-sm")}</button>`
  return `<div class="isl-row">
    ${lamp}
    <span class="isl-head">${head}</span>
    ${nowPart}${aside}
    <span class="isl-end">${position}${eta}${action}${toggle}</span>
  </div>`
}

/**
 * 開いたときの計画の一覧。作業中は、済んだフェーズが3つ以上なら1行に畳み、まだのフェーズは3つまで見せて残りを数で言う。
 * 完了したら畳まずに全フェーズを所要つきで並べる。
 */
function islandCard(plan, data, tone) {
  const total = plan.names.length
  const rows = []
  const doneCount = tone === "done" ? total : plan.current
  if (doneCount >= 3 && tone !== "done") {
    rows.push(
      `<li class="isl-plan-row" data-state="fold"><span class="isl-mark">${icon("chevron-right")}</span><span class="isl-name">済んだ ${doneCount} フェーズ</span><time>${many === "" ? "4分12秒" : "8分30秒"}</time></li>`,
    )
  } else {
    for (let index = 0; index < doneCount; index += 1) {
      const time = many === "" ? PHASES[index].time : ""
      const note = many === "" && PHASES[index].note !== "" ? `<p class="isl-plan-note">${PHASES[index].note}</p>` : ""
      rows.push(
        `<li class="isl-plan-row" data-state="done"><span class="isl-mark">${icon("check")}</span><span class="isl-name">${plan.names[index]}</span><time>${time}</time>${note}</li>`,
      )
    }
  }
  if (doneCount < total) {
    const steps = many === "" ? PHASES[plan.current].steps : [["Read", "settings-panel.tsx"], ["Grep", "sortOrder"]]
    const past = steps
      .filter(([tool]) => tool === "Read" || tool === "Grep")
      .slice(0, 2)
      .map(
        ([tool, target]) =>
          `<li><span class="isl-mark">${icon("check")}</span><code>${target}</code><span>を${TOOL_VERB[tool]}</span></li>`,
      )
      .join("")
    const live =
      tone === "run"
        ? `<li class="is-live"><span class="isl-mark"><span class="isl-lamp"></span></span>${islandNow(data.now)}<time>${data.time}</time></li>`
        : tone === "ask"
          ? `<li class="is-live"><span class="isl-mark"><span class="isl-lamp"></span></span><span>「保存先」の質問への返事を待っています</span></li>`
          : ""
    const acts = `<ul class="isl-acts">${live}${past}</ul><button class="isl-more" type="button">手順 ${status.steps}件をすべて見る</button>`
    rows.push(
      `<li class="isl-plan-row" data-state="current"><span class="isl-mark"><span class="isl-ring"></span></span><span class="isl-name">${plan.names[plan.current]}</span><time>${status.phaseTime ?? ""}</time>${acts}</li>`,
    )
    const rest = plan.names.slice(plan.current + 1)
    for (const name of rest.slice(0, 3)) {
      rows.push(
        `<li class="isl-plan-row" data-state="todo"><span class="isl-mark"><span class="isl-hollow"></span></span><span class="isl-name">${name}</span></li>`,
      )
    }
    if (rest.length > 3) {
      rows.push(
        `<li class="isl-plan-row" data-state="rest"><span class="isl-mark"></span><span class="isl-name">ほか ${rest.length - 3} フェーズ</span></li>`,
      )
    }
  }
  const minutes = islandEta(plan, data)
  const eta =
    minutes === undefined
      ? ""
      : `<span title="済んだフェーズの所要の幅から出した目安">目安の残り<b>${minutes[0]}〜${minutes[1]}分</b></span>`
  const head = `<header class="isl-pop-head"><b>依頼の手順</b><span class="isl-pop-meta">${total} フェーズ</span></header>`
  return `${head}<ol class="isl-plan">${rows.join("")}</ol><footer class="isl-foot"><span>${status.elapsed[0]}<b>${islandElapsed()}</b></span>${eta}</footer>`
}

/**
 * ピル（行と下線）と、2種類の詳細。詳細は popover="auto" で最上層に出し、外を押すか Esc で閉じる。
 * 入力欄の真上に置くときは、下線を入力欄の側に置き、詳細を上へ出す。
 */
function island() {
  const data = ISLAND[moment]
  const tone = data.tone ?? "run"
  const plan = islandPlan()
  document.title = islandTitle(plan, data, tone)
  const row = islandRow(plan, data, tone)
  const track = islandTrack(plan, tone)
  const phases = plan.names
    .map(
      (_, index) =>
        `<section class="isl-pop is-phase" id="isl-phase-${index}" popover="auto" data-index="${index}" aria-label="フェーズ ${index + 1} の詳細">${islandPhase(plan, data, tone, index)}</section>`,
    )
    .join("")
  const whole = `<section class="isl-pop is-plan" id="isl-plan" popover="auto" aria-label="依頼の手順">${islandCard(plan, data, tone)}</section>`
  return `<div class="isl" data-tone="${tone}" data-place="${place}">${row}${track}${phases}${whole}</div>`
}

/**
 * 詳細を開く直前に、押したボタンの下（入力欄の真上に置くときは上）へ置く（開いてから動かすと1コマ跳ぶ）。
 * フェーズの詳細は区間の中央に、全体の詳細はピルの右端にそろえ、ピルの左右の端（とビューポートの端から 8px）の内に収める。
 * 幅は CSS の inline-size（px）から読む。開く前は描かれていないので、offsetWidth はまだ 0。
 */
function wireIsland() {
  const pill = one(".isl")
  if (pill === null) {
    return
  }
  for (const pop of document.querySelectorAll(".isl-pop")) {
    pop.addEventListener("beforetoggle", (event) => {
      const opened = event.newState === "open"
      const invoker = pop.classList.contains("is-plan")
        ? one(".isl-toggle")
        : document.querySelector(`.isl-hit[popovertarget="${pop.id}"]`)
      invoker?.toggleAttribute("data-active", opened)
      if (!opened || invoker === null) {
        return
      }
      const box = pill.getBoundingClientRect()
      const at = invoker.getBoundingClientRect()
      const width = Math.min(Number.parseFloat(getComputedStyle(pop).inlineSize) || 360, window.innerWidth - 16)
      const wanted = pop.classList.contains("is-plan") ? box.right - width : at.left + at.width / 2 - width / 2
      const low = Math.max(box.left, 8)
      const high = Math.min(box.right, window.innerWidth - 8) - width
      pop.style.left = `${Math.min(Math.max(wanted, low), Math.max(high, low))}px`
      pop.style.top = place === "dock" ? "auto" : `${box.bottom + 8}px`
      pop.style.bottom = place === "dock" ? `${window.innerHeight - box.top + 8}px` : "auto"
    })
  }
  // 撮影用に開いた形で始めるときは、出入りの動きを飛ばす（撮る瞬間に半透明で写らない）。
  const phase = Number.parseInt(params.get("phase") ?? "", 10)
  const first = open ? one("#isl-plan") : Number.isInteger(phase) ? one(`#isl-phase-${phase - 1}`) : null
  if (first !== null) {
    first.style.transition = "none"
    first.showPopover()
  }
}

/** 手順の一覧。全フェーズを1行ずつ並べ、済んだフェーズは畳み、今のフェーズは開いて手順を並べる。 */
function stepsList() {
  const rows = PHASES.map((phase, index) => {
    const state = index < status.current ? "done" : index === status.current ? "current" : "todo"
    const mark =
      state === "done"
        ? `<span class="phase-dot is-done">${icon("check")}</span>`
        : state === "current"
          ? status.asking === true
            ? '<span class="phase-dot is-asking">?</span>'
            : `<span class="phase-dot is-current">${index + 1}</span>`
          : `<span class="phase-dot">${index + 1}</span>`
    const time = state === "done" ? phase.time : state === "current" ? status.phaseTime : ""
    const head = `<p class="steps-head" data-state="${state}">${mark}<span class="steps-name">${phase.name}</span><time>${time}</time></p>`
    if (state === "done") {
      return `<li>${head}<p class="steps-fold">${icon("chevron-right", " icon-sm")}手順 ${phase.steps.length}</p></li>`
    }
    if (state === "todo") {
      return `<li>${head}</li>`
    }
    const shown = moment === "deleg" ? [["Agent", "実装役 · 保存の仕組みを足す"]] : phase.steps.slice(0, phase.steps.length - status.running + 1)
    const items = shown
      .map(([tool, target], at) => {
        const runningRow = status.now !== undefined && at === shown.length - 1
        return `<li class="steps-step${runningRow ? " is-running" : ""}"><span class="steps-tool">${tool}</span><code>${target}</code>${runningRow ? '<span class="steps-live">走っている</span>' : ""}</li>`
      })
      .join("")
    return `<li>${head}<ol class="steps-steps">${items}</ol></li>`
  }).join("")
  const close = `<button class="icon-button steps-close" type="button" aria-label="手順の一覧を閉じる">${icon("close")}</button>`
  return `<header class="steps-title"><span>依頼の手順</span>${close}</header><ol class="steps-rows">${rows}</ol>`
}

/* ───── 練った案（form=d） ───── */

// 戻した器の狐火と同じ炎の形（履歴 b789339c9 の lamp.tsx の FLAME_PATH）。
const FLAME =
  "M12 2.5c1.6 3.7 5.5 5.6 5.5 10.6a5.5 5.5 0 0 1-11 0c0-2.7 1.4-4.2 2.6-5.6.2 1.4 1 2.3 2 2.6-.4-2.8.3-5.3.9-7.6z"

/** 判定の札の語と印。印は描いた形で、字の記号にしない。 */
const VERDICT = {
  running: { label: "働いている", mark: "dot" },
  background: { label: "背景で働いている", mark: "dot" },
  asking: { label: "あなたの番", mark: "dot" },
  finished: { label: "完了", mark: "check" },
  stopped: { label: "あなたが止めた", mark: "stop" },
}

/**
 * 場面ごとの判定と、今の段の行に開く枠の中身。
 * live の now は走っている手順（欄を書かなければ STATUS の now）、touched は書き終えたファイル、delegate は任せた役と最後の報せ。
 * tag は今の段の行の札、folded は計画を判定の行だけに畳む場面（終わったあと）。
 */
const PLAN = {
  work: { verdict: "running", live: [{ kind: "now" }] },
  long: {
    verdict: "running",
    live: [{ kind: "now" }, { kind: "touched", files: ["sort-order.ts", "sort-order.test.ts"] }],
  },
  late: { verdict: "running", live: [{ kind: "now" }] },
  deleg: {
    verdict: "background",
    live: [
      {
        kind: "delegate",
        name: "実装役",
        text: "単体テストを書き終え、読み込みの側を直している",
        since: "1分前",
      },
      { kind: "now", verb: "書き換えている", target: "local-preference.ts", time: "4秒", mono: true },
    ],
  },
  ask: { verdict: "asking", tag: "質問 1件" },
  stop: { verdict: "stopped", folded: true },
  away: { verdict: "running", live: [{ kind: "now" }] },
  done: { verdict: "finished", folded: true },
}[moment]

const TOOL_VERB = { Read: "読んだ", Grep: "探した", Edit: "書き換えた", Bash: "走らせた" }

function positionText() {
  if (PLAN.verdict === "finished") {
    return `${PHASES.length}段すべて済んだ`
  }
  const position = `${PHASES.length}段のうち${status.current + 1}段目`
  return PLAN.verdict === "stopped" ? `${position}で止めた` : position
}

function phaseState(index) {
  if (index < status.current) {
    return "done"
  }
  if (index === status.current) {
    return PLAN.verdict === "stopped" ? "stopped" : "now"
  }
  return "todo"
}

/** 段の灯り。済みは塗り、今は大きく濃く、これからは輪郭、止めた段は破線の輪郭。見ていないあいだに済んだ段は小さな点を足す。 */
function lamp(state, unseen) {
  const outlined = state === "todo" || state === "stopped"
  const dot = unseen ? '<circle class="lamp-unseen" cx="20" cy="5" r="3.2" />' : ""
  return `<svg viewBox="0 0 24 24" class="lamp is-${state}" aria-hidden="true"><path class="${outlined ? "lamp-line" : "lamp-fill"}" d="${FLAME}" />${dot}</svg>`
}

function isUnseen(index) {
  return (status.unseen ?? []).includes(index)
}

function planStamp() {
  const verdict = VERDICT[PLAN.verdict]
  const mark =
    verdict.mark === "dot" ? '<span class="plan-dot" aria-hidden="true"></span>' : icon(verdict.mark, " icon-sm")
  const closed = PLAN.folded === true
  const expanded = !closed && !fold
  const toggle = closed ? "道筋" : fold ? "計画を開く" : "畳む"
  const lamps = PHASES.map((_, index) => lamp(phaseState(index), isUnseen(index))).join("")
  return `<p class="plan-stamp">
    <span class="plan-verdict" data-verdict="${PLAN.verdict}">${mark}${verdict.label}</span>
    <span class="lamps">${lamps}</span>
    <span class="plan-position">${positionText()}</span>
    <span class="plan-elapsed">${status.elapsed[0]}<b>${status.elapsed[1]}</b></span>
    <button class="plan-toggle${expanded ? " is-open" : ""}" type="button" aria-expanded="${expanded}">${toggle}${icon("chevron", " icon-sm")}</button>
  </p>`
}

/** 今の段の行に開く枠。走っている手順・書き終えたファイル・任せた役を、語・中身・時の3列に並べる。 */
function planLive() {
  const acts = (PLAN.live ?? []).map((act) => {
    if (act.kind === "touched") {
      return `<div class="plan-act" data-kind="touched"><span class="plan-act-kind">できた</span><span class="plan-act-body"><span class="plan-act-target is-mono">${act.files.join("　")}</span></span><span></span></div>`
    }
    if (act.kind === "delegate") {
      return `<div class="plan-act" data-kind="delegate"><span class="plan-act-kind">任せた</span><span class="plan-act-body"><b>${act.name}</b><span class="plan-act-target">${act.text}</span></span><time class="plan-act-when">${act.since}</time></div>`
    }
    const now = { ...status.now, ...act }
    const remark = now.remark === undefined ? "" : `<span class="plan-act-remark">${now.remark}</span>`
    return `<div class="plan-act${now.remark === undefined ? "" : " is-slow"}" data-kind="now"><span class="plan-act-kind">いま</span><span class="plan-act-body"><span class="spinner"></span><b>${now.verb}</b><span class="plan-act-target${now.mono ? " is-mono" : ""}">${now.target}</span>${remark}</span><time class="plan-act-when">${now.time}</time></div>`
  })
  return acts.length === 0 ? "" : `<div class="plan-live">${acts.join("")}</div>`
}

/** 済んだ段の手順。手順の一覧と同じ動詞で言う。 */
function planSteps(phase) {
  const items = phase.steps
    .map(([tool, target]) => `<li><span>${TOOL_VERB[tool]}</span><code>${target}</code></li>`)
    .join("")
  return `<ol class="plan-steps">${items}</ol>`
}

function planRow(phase, index) {
  const state = phaseState(index)
  const time = state === "done" ? phase.time : state === "now" ? status.phaseTime : ""
  const tag =
    state === "now" && PLAN.tag !== undefined
      ? `<span class="plan-tag is-ask">${PLAN.tag}${icon("arrow-down", " icon-sm")}</span>`
      : ""
  const unseen = isUnseen(index) ? '<span class="plan-tag is-unseen">見ていない間に済んだ</span>' : ""
  const opened = open && state === "done" && index === 0
  const steps =
    state === "done"
      ? `<button class="plan-row-steps" type="button" aria-expanded="${opened}">${icon(opened ? "chevron" : "chevron-right", " icon-sm")}手順 ${phase.steps.length}</button>`
      : ""
  const head = `<div class="plan-row-head"><span class="plan-row-title">${phase.name}</span>${tag}${unseen}${steps}<time class="plan-row-time">${time}</time></div>`
  const body = state === "now" ? planLive() : opened ? planSteps(phase) : ""
  return `<li class="plan-row" data-state="${state}">${lamp(state, isUnseen(index))}<div class="plan-row-main">${head}${body}</div></li>`
}

/** 練った案の帯。判定の行と、計画の一覧（畳むと今の段の行だけ。終わったあとは判定の行だけ）。 */
function planCard() {
  if (PLAN.folded === true) {
    return planStamp()
  }
  const rows = PHASES.map(planRow).filter((_, index) => !fold || index === status.current)
  return `${planStamp()}<ol class="plan-list">${rows.join("")}</ol>`
}

function buildStatus() {
  const strip = one("#strip")
  const rail = one("#status-rail")
  const tag = one("#tag")
  if (form === "now") {
    strip.innerHTML = stripNow()
  } else if (form === "d") {
    strip.innerHTML = planCard()
  } else if (form === "a") {
    strip.innerHTML = stripA()
  } else if (form === "e" && place === "dock") {
    strip.hidden = true
    one("#dock").insertAdjacentHTML("afterbegin", `<div class="isl-dock">${island()}</div>`)
  } else if (form === "e") {
    strip.innerHTML = island()
  } else if (form === "b") {
    strip.hidden = true
    rail.hidden = false
    rail.innerHTML = railB()
  } else {
    strip.hidden = true
    tag.hidden = false
    tag.innerHTML = tagC()
  }
  // 練った案は、手順を計画の一覧の行の中で開く。
  const steps = one("#steps")
  steps.hidden = !open || form === "d" || form === "e"
  if (!steps.hidden) {
    steps.innerHTML = stepsList()
  }
}

/** 練った案の帯の高さを、流れの上端に渡す（流れは帯の下から始める）。 */
function measurePlan() {
  if (form === "d") {
    const height = one("#strip").getBoundingClientRect().height
    document.documentElement.style.setProperty("--plan-h", `${height.toFixed(0)}px`)
  }
}

function buildLane() {
  const sub = {
    late: '<p class="lane-sub is-current"><span>レポート</span><b>2/4 保存の仕組…</b></p>',
    done: '<p class="lane-sub is-current"><span>最終</span><b>タスク一覧の…</b><span class="lane-keys"><kbd class="key">{</kbd><kbd class="key">}</kbd></span></p>',
  }[moment]
  const report = '<p class="lane-sub is-current"><span>レポート</span><b>1/4 今の一覧を…</b></p>'
  one("#lane-turns").innerHTML =
    `<li class="lane-turn"><p class="lane-title">タスク一覧の並び替えを…</p>${sub ?? report}</li>`
}

function buildDock() {
  const band = one("#band")
  const draft = one("#draft")
  const working = status.now !== undefined
  draft.placeholder = working ? `${PACK.name} への補足を書く` : `${PACK.name} への依頼を書く`
  if (working) {
    one("#send").classList.add("is-stop")
    one("#send").setAttribute("aria-label", "止める")
    one("#send-icon").setAttribute("href", "#i-stop")
  }
  if (moment === "ask") {
    draft.placeholder = "選択肢以外の答えを書く…"
    // 案B は、答え待ちの知らせを入力欄の頭の1行が持つ。練った案は、お伺いが見えているあいだは帯を出さない（ADR 0059 論点 5 の決まりどおり）。ほかは入力欄の上の帯。
    if (form !== "b" && form !== "d" && form !== "e") {
      band.hidden = false
      band.innerHTML = `<span>${PACK.name} が質問しています。選択肢から選ぶか、ここに書いて答えられます</span><button class="quiet-button" type="button">選択肢へ<kbd class="key">↑</kbd></button>`
    }
  }
}

const portrait = one("#portrait")

function buildFlow() {
  lastMinute = ""
  one("#flow").innerHTML = flowRows().join("")
  const scroller = one("#scroller")
  if (moment === "done" || up) {
    scroller.scrollTop = 0
  } else {
    scroller.scrollTop = scroller.scrollHeight
  }
}

/** 立ち絵の絵の中の顔の位置（画面の座標）。絵は箱の下端に寄せて、縦横比を保って収まっている。 */
function facePoint() {
  const box = portrait.getBoundingClientRect()
  const ratio = portrait.naturalWidth > 0 ? portrait.naturalWidth / portrait.naturalHeight : 1
  const width = Math.min(box.width, box.height * ratio)
  const height = width / ratio
  return {
    x: box.left + (box.width - width) / 2 + width * PACK.face.x,
    y: box.bottom - height + height * PACK.face.y,
    top: box.bottom - height,
  }
}

const TAIL_LENGTH = 20
const TAIL_HALF = 6

function gapBelow(bubble, rect) {
  const row = bubble.closest(".row")
  const below = row.nextElementSibling ?? row.parentElement.nextElementSibling
  return below === null ? Number.POSITIVE_INFINITY : below.getBoundingClientRect().top - rect.bottom
}

/** 尾を、立ち絵が従っているセリフ1件にだけ描き、立ち絵の顔へ向ける（今の画面と同じ規則。ADR 0063 論点 3）。 */
function aimTail() {
  for (const old of document.querySelectorAll(".aim")) {
    old.remove()
  }
  for (const bubble of document.querySelectorAll(".bubble-say.has-aim")) {
    bubble.classList.remove("has-aim")
  }
  const bubble = one(".bubble-say.is-followed")
  if (bubble === null) {
    return
  }
  const rect = bubble.getBoundingClientRect()
  const face = facePoint()
  const gap = gapBelow(bubble, rect)
  const corner = { x: rect.left, y: rect.bottom }
  const sideways = Math.abs(face.x - corner.x) >= Math.abs(face.y - corner.y)
  const fromLeft = sideways || gap < 12
  const root = fromLeft
    ? {
        x: rect.left,
        y: Math.min(rect.bottom - 4 - TAIL_HALF, Math.max(rect.top + 16 + TAIL_HALF, face.y)),
      }
    : { x: rect.left + 4 + TAIL_HALF + 4, y: rect.bottom }
  const distance = Math.hypot(face.x - root.x, face.y - root.y)
  const unit = { x: (face.x - root.x) / distance, y: (face.y - root.y) / distance }
  const reach = fromLeft ? rect.bottom + gap - 2 - root.y : gap - 3
  const room = unit.y > 0.2 && Number.isFinite(gap) ? reach / unit.y : TAIL_LENGTH
  const length = Math.max(8, Math.min(TAIL_LENGTH, room, distance - 12))
  const tip = { x: root.x + unit.x * length, y: root.y + unit.y * length }
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

/** 案C の札を、立ち絵の頭のすぐ上に置く。頭の位置は、絵の上端と顔の位置（パックの faceAt）から求める。 */
function placeTag() {
  if (form !== "c") {
    return
  }
  const tag = one("#tag")
  const left = one(".left").getBoundingClientRect()
  const face = facePoint()
  // 頭のてっぺんは、絵の上端から顔の中心までの 3割ほどの所。そこから 8px 空けて札の下端を置く。
  const headTop = face.top + (face.y - face.top) * 0.3
  document.documentElement.style.setProperty(
    "--tag-bottom",
    `${Math.max(0, left.bottom - headTop + 8).toFixed(0)}px`,
  )
}

function markBar() {
  for (const bar of document.querySelectorAll(".mock-bar-group")) {
    const name = bar.dataset.param
    const current = {
      form,
      moment,
      open: open ? "steps" : "",
      fold: fold ? "1" : "",
      many,
      at: params.get("at") ?? "",
      place: place === "dock" ? "dock" : "",
      live: params.get("live") === "1" ? "1" : "",
    }[name]
    for (const link of bar.querySelectorAll("a")) {
      const query = new URLSearchParams(location.search)
      if (link.dataset.value === "") {
        query.delete(name)
      } else {
        query.set(name, link.dataset.value)
      }
      link.href = `?${query.toString()}`
      if (current === link.dataset.value) {
        link.setAttribute("aria-current", "true")
      }
    }
  }
}

function applyPack() {
  const root = document.documentElement
  root.style.setProperty("--accent", PACK.accent)
  root.style.setProperty("--art", `url("${asset("background.png")}")`)
  for (const image of document.querySelectorAll("[data-pack-src]")) {
    image.src = asset(image.dataset.packSrc)
  }
  portrait.src = asset(`${SAY[FOLLOWED].expression}.png`)
  portrait.dataset.motion = moment === "ask" || moment === "done" ? "breathe" : "walk"
}

/**
 * 提案の決まり（many=window）の案A で、帯の1行に収まらないときに譲る順。
 * 対象とフェーズの名前は先に「…」で縮み、それでも対象が詰まり切るなら、経過の合計を、次にフェーズの名前を、最後に対象を隠す。
 * 残した丸・回る印・動詞・手順の秒・添え書き・「手順 n件」は譲らない。
 */
function fitStrip() {
  if (form !== "a" || many !== "window") {
    return
  }
  const strip = one("#strip")
  delete strip.dataset.tight
  for (const level of ["", "1", "2", "3"]) {
    if (level !== "") {
      strip.dataset.tight = level
    }
    const unit = strip.querySelector(".now-unit")
    const target = strip.querySelector(".now-target")
    if (unit === null) {
      return
    }
    const squeezed =
      unit.scrollWidth > unit.clientWidth + 1 || (target !== null && target.clientWidth < 48)
    if (!squeezed) {
      return
    }
  }
}

function layout() {
  fitStrip()
  measurePlan()
  placeTag()
  aimTail()
}

applyPack()
buildStatus()
measurePlan()
buildLane()
buildDock()
buildFlow()
markBar()
/**
 * ?live=1 で、新案のいまの手順を数秒ごとに入れ替え、秒を毎秒進める（手触りを確かめる用。撮影では使わない）。
 * 入れ替えは古い一文が上へ抜け、新しい一文が下から入る。手順を4つ進めるごとにフェーズが1つ済み、下線の区切りが満ちる。
 */
const LIVE_ACTS = [
  ["sort-order.ts", "を読んでいます"],
  ["sortOrder", "を探しています"],
  ["sort-order.ts", "を書き換えています"],
  ["pnpm run test sort-order", "を走らせています"],
]

/** 古い中身を上へ抜き、新しい中身を下から入れる。 */
function roll(element, html) {
  element.classList.add("is-leaving")
  setTimeout(() => {
    element.innerHTML = html
    element.classList.replace("is-leaving", "is-entering")
    requestAnimationFrame(() => requestAnimationFrame(() => element.classList.remove("is-entering")))
  }, 200)
}

function startLive() {
  if (form !== "e" || params.get("live") !== "1" || ISLAND[moment].tone !== undefined) {
    return
  }
  const plan = islandPlan()
  const now = one(".isl-row .isl-now")
  const head = one(".isl-row .isl-head")
  const position = one(".isl-row .isl-pos b")
  const eta = one(".isl-row .isl-eta")
  const segments = [...document.querySelectorAll(".isl-seg")]
  // 目安の残りは、フェーズが1つ済むたびに上下の端を詰める（下の端は1分、上の端は2分より縮めない）。
  let range = islandEta(plan, ISLAND[moment]) ?? [1, 2]
  let seconds = Number.parseInt(one(".isl-row .isl-time").textContent, 10) || 0
  let index = 2
  let swaps = 0
  let current = plan.current
  setInterval(() => {
    seconds += 1
    const time = one(".isl-row .isl-time")
    if (time !== null) {
      time.textContent = `${seconds}秒`
    }
  }, 1000)
  setInterval(() => {
    index = (index + 1) % LIVE_ACTS.length
    swaps += 1
    seconds = 0
    roll(now, `${islandNow(LIVE_ACTS[index])}<time class="isl-time">0秒</time>`)
    if (swaps % 4 === 0 && current < plan.names.length - 1) {
      segments[current].dataset.state = "done"
      segments[current].classList.add("is-landing")
      current += 1
      segments[current].dataset.state = "current"
      position.textContent = String(current + 1)
      range = [Math.max(1, range[0] - 2), Math.max(2, range[1] - 2)]
      if (eta !== null) {
        eta.textContent = `あと${range[0]}〜${range[1]}分`
      }
      roll(head, plan.names[current])
      document.title = `${current + 1}/${plan.names.length} ${plan.names[current]} · tsukumo`
    }
  }, 3600)
}

portrait.addEventListener("load", layout)
window.addEventListener("resize", layout)
one("#scroller").addEventListener("scroll", aimTail, { passive: true })
layout()
wireIsland()
startLive()
