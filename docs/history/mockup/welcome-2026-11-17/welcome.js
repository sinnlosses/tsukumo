// 初期表示（迎える場面）の見本。URL の検索引数から形・状態・パックを読み、中央の列（流れ・始め方・入力欄）を組む。
// 今の形（form=now）は、2026-11-18 の main（209efdcb5）を疑似セッションで撮って測った形を写している
// （カード3枚・「ほかの始め方」・広い画面では迎えの挨拶の行が出ない・やり取りの列は「やり取り 0」の見出しの帯）。
// 3つの案は、迎えの挨拶を声の定位置（入力欄のすぐ上・立ち絵の頭の横。character-voice-2026-11-17 の提案 A で採用済み）に出し、
// 始め方をそのすぐ上へ寄せる点が共通。
// 候補はフォーカスを入力欄に置いたまま選ぶ（空の入力欄の ↑ で選び、⏎ で送り、Tab で入力欄へ入れて直す）。
// 中身はすべて架空で、実物の会話ではない。

const FORMS = ["now", "a", "b", "c"]
const STATES = ["full", "tasks", "none", "writing", "loading", "unwritten"]
const PACKS = {
  shirasuzu: { name: "白鈴", accent: "#f9c3cd", ratio: 1 },
  tsukumo: { name: "つくも", accent: "#6fe3cd", ratio: 1145 / 1374 },
}

const params = new URLSearchParams(location.search)

function pick(name, allowed) {
  const value = params.get(name)
  return allowed.includes(value) ? value : allowed[0]
}

const form = pick("form", FORMS)
const state = pick("state", STATES)
const packId = pick("pack", Object.keys(PACKS))
const pack = PACKS[packId]
const long = params.get("long") === "1"
let open = params.get("open") === "1"

// pane.css の左の列は今の形（data-design="now"）のまま使う。この見本の形は data-form。
document.body.dataset.design = "now"
document.body.dataset.form = form
document.body.dataset.moment = form === "now" ? "first" : "greet"
document.body.dataset.bar = params.get("bar") === "0" ? "0" : "1"

const icon = (id, cls = "icon") =>
  `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true"><use href="#i-${id}" /></svg>`

// ───────── 架空の部屋 ─────────

// 前回のセッションの要約（SessionDigest の summary・remaining・requestCount と、一覧の行の見出し・更新時刻）。
// long=1 は、切れ方を見るための長い字。
const PREVIOUS = {
  heading: long
    ? "成果の画面の日ごとの件数から、その日の振り返りへ移る口を置いて、週の区切りでも同じ口を出したい"
    : "成果の画面に振り返りの口を置きたい",
  when: "昨日 23:41",
  requests: 6,
  summary: long
    ? "成果の画面の日ごとの件数に、振り返りへ移る口を足した。件数の集計は1か所にまとめ、単体テスト 12件が通っている。週の区切りの見出しにも同じ口を置く案を試したが、件数が0の週の扱いが決まらず、見出しの側は元へ戻してある。画面の確認は 1400px と 1920px で済ませた。"
    : "成果の画面の日ごとの件数に、振り返りへ移る口を足した。件数の集計は1か所にまとめ、単体テスト 12件が通っている。",
  remaining: long
    ? "数が0の日の見せ方と、週の区切りをまたぐ日の件数の出し方を、次のセッションで決める"
    : "数が0の日の見せ方を決める",
}
// 前回のセッションの要約があるのは、前回の残りがある状態だけ（タスクだけ・候補なしは、要約の無い部屋）。
const hasPrevious = state !== "tasks" && state !== "none"

// おすすめのカード（RecommendationCard）。name は迎えの挨拶に差し込む名前、request は押すと送られる依頼。
const RESUME = {
  kind: "resume",
  id: PREVIOUS.heading,
  name: "前回の続き",
  title: PREVIOUS.remaining,
  reason: "前の作業の続きで、そのまま入れる",
  request: `前回の続き: ${PREVIOUS.remaining}`,
}
const task = (id, title, reason) => ({
  kind: "task",
  id,
  name: id,
  title,
  reason,
  request: `タスク ${id} を進めて`,
})
const T102 = task(
  "T-102",
  long
    ? "設定の保存先を、利用者の設定と作業ツリーの設定の2か所から1つにまとめる"
    : "設定の保存先を1つにまとめる",
  long
    ? "軽い。触るファイルが2つで済み、ほかのタスクの前提にもなっている"
    : "軽い。触るファイルが2つで済む",
)
const T105 = task(
  "T-105",
  long
    ? "起動時の読み込みを遅らせて、最初の画面が出るまでの待ち時間を短くする"
    : "起動時の読み込みを遅らせる",
  "効き目が大きい。起動が体感で速くなる",
)
// 理由がまだ届いていないカード（既定の並びで埋めた枠）。
const T106 = task("T-106", "検査の重複を1本にする", "")

const WITH_PREVIOUS = [RESUME, T102, T105]
const PICKS = {
  full: WITH_PREVIOUS,
  tasks: [T102, T105, T106],
  none: [],
  writing: WITH_PREVIOUS,
  loading: WITH_PREVIOUS,
  unwritten: WITH_PREVIOUS,
}
const picks = PICKS[state]
// いちばんのおすすめが決まるまでは候補を出さない（届いたあとで順が替わると、読んだものと違う依頼が送られる）。
const ready = state !== "loading"

const GREETING = {
  full: "おかえりなさい。前回の続きから始めませんか。",
  tasks: "おはようございます。T-102 から始めませんか。",
  none: "おはようございます。今日は何から始めましょうか。",
}

// ───────── 部品 ─────────

// 尾は吹き出しの左の辺から、左下の立ち絵へ向ける（尾の先をどこへ向けるかは、character-voice の提案 G の採否に従う）。
const TAIL = `<svg class="voice-tail" viewBox="0 0 12 14" aria-hidden="true"><path d="M12 0.5 0.5 11 12 13.5" /></svg>`

// 声の定位置に出す迎えの挨拶。いちばんのおすすめの名前を差し込むので、おすすめが決まるまで「…」で待つ。
// 書けなかったとき（unwritten）は中身を出さない（定位置の高さは取ったままにして、上の候補を動かさない）。
function voiceLine() {
  if (state === "unwritten") {
    return ""
  }
  if (state === "writing" || state === "loading") {
    return `<div class="row" id="greeting"><div class="bubble bubble-say is-live is-writing"><span class="visually-hidden">${pack.name}が挨拶を書いている</span><span aria-hidden="true">…</span>${TAIL}</div></div>`
  }
  return `<div class="row" id="greeting"><div class="bubble bubble-say is-live"><span class="visually-hidden">${pack.name}: </span>${GREETING[state]}${TAIL}</div><span class="stamp">9:02</span></div>`
}

// 候補の行。行を押すと選ぶだけで、送るのは右端の口（と、選んだあとの ⏎）。
function row(item, index) {
  const top = index === 0
  const kind = item.kind === "resume" ? `${icon("history", "icon icon-sm")}続き` : item.id
  const go = top ? (item.kind === "resume" ? "続きを頼む" : "これを頼む") : "頼む"
  const reason =
    item.reason === "" ? "" : `<span class="pick-reason" title="${item.reason}">${item.reason}</span>`
  // 案 A は、前回の続きの行から前回のやり取りを開ける（案 B は紙に同じ口がある）。
  const previous =
    top && item.kind === "resume" && form === "a"
      ? `<button class="text-button" type="button" data-previous>前回を開く${icon("chevron-right", "icon icon-sm")}</button>`
      : ""
  const sub = reason === "" && previous === "" ? "" : `<span class="pick-sub">${reason}${previous}</span>`
  return `<div class="pick${top ? " is-top" : " is-compact"}" data-pick="${index}" id="pick-${index}">
    <span class="pick-kind">${kind}</span>
    <span class="pick-text"><span class="pick-title" title="${item.title}">${item.title}</span>${sub}</span>
    <button class="pick-go" type="button" data-send="${index}" aria-label="「${item.request}」と送る">${go}</button>
  </div>`
}

// おすすめを選んでいるあいだの骨組み。いちばんのおすすめの行と同じ高さを先に取り、届いても下の物を動かさない。
const SKELETON = `<div class="pick-line"><div class="pick is-top is-skeleton" aria-busy="true">
    <span class="pick-kind">${icon("refresh", "icon icon-sm")}</span>
    <span class="pick-text"><span class="pick-wait">おすすめを選んでいる</span></span>
  </div></div>`

// 案 A・B の始め方。いちばんのおすすめを入力欄のすぐ上に1行で出し、ほかの候補はその上へ向けて開く
// （開いても、押した口といちばんのおすすめの行は動かない）。
function stack() {
  if (!ready) {
    return SKELETON
  }
  const [first, ...rest] = picks
  if (first === undefined) {
    return ""
  }
  if (rest.length === 0) {
    return `<div class="pick-line">${row(first, 0)}</div>`
  }
  const above = rest
    .map((item, index) => row(item, index + 1))
    .toReversed()
    .join("")
  return `<div class="pick-others" id="others"${open ? "" : " hidden"}>${above}</div>
    <div class="pick-line">${row(first, 0)}<button class="pick-more" id="more" type="button" aria-expanded="${open}" aria-controls="others">ほか ${rest.length}件${icon("chevron", "icon icon-sm")}</button></div>`
}

// 案 B: 前回のセッションの要約があるとき、流れの頭に前回のまとめを紙で置く。挨拶と始め方は案 A と同じ。
function handoff() {
  if (!hasPrevious) {
    return ""
  }
  return `<article class="handoff" aria-labelledby="handoff-title">
    <div class="handoff-head">
      <h2 class="handoff-title" id="handoff-title" title="${PREVIOUS.heading}">${PREVIOUS.heading}</h2>
      <button class="text-button" type="button" data-previous>前回のやり取りを開く${icon("chevron-right", "icon icon-sm")}</button>
    </div>
    <p class="handoff-meta">${icon("history", "icon icon-sm")}前回のセッション・${PREVIOUS.when}・依頼 ${PREVIOUS.requests}件</p>
    <p class="handoff-summary">${PREVIOUS.summary}</p>
  </article>`
}

// 案 C: おすすめを、まだ送っていない自分の投稿として右に並べる。入力欄にいちばん近いのが、いちばんのおすすめ。
// 題と理由は送られないので、投稿の外（下）に添える。
function repliesC() {
  if (!ready) {
    return `<div class="replies" id="replies"><div class="reply-item"><div class="reply is-skeleton" aria-busy="true"><span class="reply-wait">おすすめを選んでいる</span></div></div></div>`
  }
  if (picks.length === 0) {
    return ""
  }
  const items = picks
    .map((item, index) => {
      const note =
        item.kind === "resume" ? item.reason : [item.title, item.reason].filter(Boolean).join("・")
      return `<div class="reply-item${index === 0 ? " is-top" : ""}" data-pick="${index}" id="pick-${index}">
        <div class="reply">
          <span class="reply-text">${item.request}</span>
          <button class="reply-send" type="button" data-send="${index}" aria-label="「${item.request}」と送る">${icon("up", "icon icon-sm")}</button>
        </div>
        ${note === "" ? "" : `<span class="reply-note" title="${note}">${note}</span>`}
      </div>`
    })
    .toReversed()
  return `<div class="replies" id="replies" role="group" aria-label="返事の候補">${items.join("")}</div>`
}

// 今の形: 見出し・説明・カード3枚・「ほかの始め方」。迎えの挨拶の行は出ない。
function nowWelcome() {
  const lead =
    picks.length > 0
      ? "tsukumo のおすすめ。「始める」を押すと、カードに書いた依頼がそのまま送られて作業が始まる。"
      : "下の入力欄から頼める。"
  const card = (item, index) => `<div class="welcome-card${index === 0 ? " is-top" : ""}">
    <p class="welcome-card-id"><span>${item.id}</span>${index === 0 ? `<span class="welcome-badge">いちばんのおすすめ</span>` : ""}</p>
    <p class="welcome-card-title">${item.title}</p>
    ${item.reason === "" ? "" : `<p class="welcome-card-reason"><img src="../../../../characters/${packId}/face.png" alt="" />${item.reason}</p>`}
    <p class="welcome-card-send"><span>送られる依頼</span>${item.request}</p>
    <p class="welcome-card-foot"><kbd class="key">${index + 1}</kbd><span class="welcome-start">始める${icon("arrow-right", "icon icon-sm")}</span></p>
  </div>`
  const cards =
    picks.length > 0 ? `<div class="welcome-cards">${picks.map(card).join("")}</div>` : ""
  return `<section class="welcome">
    <h1>何から始める？</h1>
    <p class="welcome-lead">${lead}</p>
    ${cards}
    <p class="ways">${picks.length > 0 ? `<span class="ways-label">ほかの始め方</span>` : ""}
      <span class="way">${icon("pencil", "icon icon-sm")}自分で書く<kbd class="key">/</kbd></span>
      <span class="way">${icon("list", "icon icon-sm")}タスクの一覧から選ぶ</span>
      <span class="way">${icon("history", "icon icon-sm")}前のやり取りを見る<kbd class="key">←</kbd></span>
    </p>
  </section>`
}

// ───────── 組み立て ─────────

const flow = document.querySelector("#flow")
const start = document.querySelector("#start")
const voice = document.querySelector("#voice")
const strip = document.querySelector("#strip")
const draft = document.querySelector("#draft")
const hint = document.querySelector("#hint")
const note = document.querySelector("#selection-note")
const composer = document.querySelector("#composer")
const portrait = document.querySelector("#portrait")
const left = document.querySelector("#left")
const placeholder = `${pack.name} への依頼を書く`
const stacked = form === "a" || form === "b"
// 選べる候補。今の形はカードを写しているだけで、選ぶ操作は無い。
const choices = form === "now" || !ready ? [] : picks
// 選んでいる候補の位置（-1 は選んでいない）。フォーカスは入力欄に置いたまま。
let selected = -1
let sent = false

// 見比べのページの枠の中ではフォーカスを取れない（取ると枠どうしで奪い合う）ので、入力欄の枠の色だけ data-pose で写す。
const embedded = window.top !== window

function focusDraft() {
  if (embedded) {
    composer.dataset.pose = "focus"
    return
  }
  draft.focus({ preventScroll: true })
}

// 枠の中を実際に押したら、写した見た目を外して本物のフォーカスに任せる。
document.addEventListener("focusin", () => {
  delete composer.dataset.pose
})

// 入力欄の右上の手がかり。空の入力欄で候補があるあいだだけ出す（字を打つと ↑ はカーソルの移動に戻る）。
function renderHint() {
  if (sent || choices.length === 0 || draft.value !== "") {
    hint.innerHTML = ""
    return
  }
  hint.innerHTML =
    selected === -1
      ? `<kbd class="key">${icon("up")}</kbd>${form === "c" ? "返事を選ぶ" : "おすすめを選ぶ"}`
      : `<kbd class="key">${icon("enter")}</kbd>送る<kbd class="key is-wide">Tab</kbd>直す`
}

// 候補を選ぶ。選んだ候補の依頼を、入力欄の置き字の位置に見せる（送られる場所で、送られる文を見せる）。
function select(index) {
  selected = index
  for (const element of document.querySelectorAll("[data-pick]")) {
    element.toggleAttribute("data-selected", Number(element.dataset.pick) === index)
  }
  const item = choices[index]
  draft.placeholder = item === undefined ? placeholder : item.request
  composer.toggleAttribute("data-preview", item !== undefined)
  note.textContent =
    item === undefined
      ? ""
      : `「${item.request}」を選んだ。Enter で送る。Tab で入力欄へ入れて直す。Esc で選ぶのをやめる。`
  renderHint()
}

function renderStart() {
  start.innerHTML = stacked ? stack() : ""
  if (selected !== -1) {
    select(selected)
  }
}

function render() {
  // やり取りが無いあいだ、やり取りの列の置き場には「やり取り 0」の見出しの帯が出る（GH-2465。今の形にもある）。
  left.insertAdjacentHTML(
    "afterbegin",
    `<nav class="lane lane-bar is-empty" aria-label="やり取り" title="依頼を送ると、ここに並ぶ">
      <div class="lane-head"><span class="lane-title">やり取り</span><span class="lane-count" id="lane-count">0</span></div>
    </nav>`,
  )
  // 今の形は、広い画面では迎えの挨拶の行を出さない（声の定位置はまだ無い）。
  if (form === "now") {
    flow.innerHTML = nowWelcome()
    voice.hidden = true
    return
  }
  // 流れに置くのは、案 B の紙と案 C の返事だけ。挨拶は流れの外（声の定位置）に出す。
  flow.innerHTML = (form === "b" ? handoff() : "") + (form === "c" ? repliesC() : "")
  voice.innerHTML = voiceLine()
  renderStart()
}

const escapeText = (text) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

// 送った直後。候補と声が引いて、流れに投稿と「いまの行」が入る（声の定位置は、働く場面では出ない）。
// 案 B の紙は流れの頭に残る。今の形は、始め方の一覧ごと流れに入れ替わる。
function send(text) {
  sent = true
  select(-1)
  start.innerHTML = ""
  voice.innerHTML = ""
  voice.hidden = true
  document.querySelector("#replies")?.remove()
  document.querySelector(".welcome")?.remove()
  document.body.dataset.moment = "work"
  flow.insertAdjacentHTML(
    "beforeend",
    `<div class="row row-user is-arriving"><div class="bubble bubble-post">${escapeText(text)}</div><span class="stamp">9:03</span></div>
     <span class="now-line is-arriving">依頼を読んでいる　0:02</span>`,
  )
  strip.hidden = false
  strip.innerHTML = `<span class="strip-state">作業中</span><span class="strip-name">依頼を読んでいる</span><span class="strip-time">経過<b>0:02</b></span>`
  const count = document.querySelector("#lane-count")
  if (count !== null) {
    count.textContent = "1"
  }
  portrait.src = `../../../../characters/${packId}/thinking.png`
  // 候補の口から送ったときは、書きかけの字を残す。
  if (draft.value.trim() === text) {
    draft.value = ""
  }
  renderHint()
  focusDraft()
}

draft.placeholder = placeholder
render()

// ───────── キーと押す操作 ─────────

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null
  if (target === null) {
    return
  }
  // 送るのは、行の右端の口だけ。
  const go = target.closest("[data-send]")
  if (go !== null) {
    const item = picks[Number(go.dataset.send)]
    if (item !== undefined) {
      send(item.request)
    }
    return
  }
  if (target.closest("#more") !== null) {
    open = !open
    if (!open && selected > 0) {
      select(-1)
    }
    renderStart()
    document.querySelector("#more")?.focus()
    return
  }
  // 前回のやり取りを開く口は、見本では開かない。
  if (target.closest("[data-previous]") !== null) {
    return
  }
  // 行そのものを押すと選ぶだけ（入力欄が空のあいだ）。送るのは ⏎ か右端の口。
  const picked = target.closest("[data-pick]")
  if (picked !== null && choices.length > 0 && !sent && draft.value === "") {
    select(Number(picked.dataset.pick))
    focusDraft()
  }
})

draft.addEventListener("keydown", (event) => {
  if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return
  }
  const list = sent ? [] : choices
  // 空の入力欄の ↑ で、いちばんのおすすめを選ぶ。続けて押すと、上の候補へ移る（畳んであれば開く）。
  if (event.key === "ArrowUp" && draft.value === "" && list.length > 0) {
    event.preventDefault()
    if (selected < list.length - 1) {
      if (selected >= 0 && stacked && !open) {
        open = true
        renderStart()
      }
      select(selected + 1)
    }
    return
  }
  if (selected !== -1) {
    // ↓ で入力欄に近い候補へ戻り、いちばんのおすすめの次は選ぶのをやめる。
    if (event.key === "ArrowDown") {
      event.preventDefault()
      select(selected - 1)
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      select(-1)
      return
    }
    // Tab で、選んだ依頼を入力欄へ入れる（直してから送る）。
    if (event.key === "Tab") {
      event.preventDefault()
      draft.value = list[selected].request
      select(-1)
      return
    }
  }
  if (event.key === "Enter") {
    event.preventDefault()
    if (selected !== -1) {
      send(list[selected].request)
    } else if (draft.value.trim() !== "") {
      send(draft.value.trim())
    }
  }
})

// 字を打ち始めたら、選ぶのをやめて字をそのまま入れる。
draft.addEventListener("input", () => {
  if (selected === -1) {
    renderHint()
    return
  }
  select(-1)
})

document.querySelector("#send").addEventListener("click", () => {
  if (selected !== -1) {
    send(choices[selected].request)
  } else if (draft.value.trim() !== "") {
    send(draft.value.trim())
  }
})
composer.addEventListener("submit", (event) => {
  event.preventDefault()
})

// ───────── パックの素材と切り替えの帯 ─────────

const root = document.documentElement
root.style.setProperty("--accent", pack.accent)
root.style.setProperty("--art", `url("../../../../characters/${packId}/background.png")`)
root.style.setProperty("--art-ratio", String(pack.ratio))
for (const image of document.querySelectorAll("[data-pack-src]")) {
  image.src = `../../../../characters/${packId}/${image.dataset.packSrc}`
}
// 今の画面でも、迎えの挨拶が書けると表情だけは替わる。
const greeted = state === "full" || state === "tasks" || state === "none"
portrait.src = `../../../../characters/${packId}/${greeted ? "excited" : "default"}.png`

const current = { form, state, pack: packId, open: open ? "1" : "0", long: long ? "1" : "0" }
for (const group of document.querySelectorAll(".mock-bar-group")) {
  const name = group.dataset.param
  for (const link of group.querySelectorAll("a")) {
    const next = new URLSearchParams(location.search)
    next.set(name, link.dataset.value)
    next.delete("sent")
    next.delete("select")
    link.href = `?${next.toString()}`
    if (link.dataset.value === current[name]) {
      link.setAttribute("aria-current", "true")
    }
  }
}
document.querySelector("#reset").addEventListener("click", () => {
  const next = new URLSearchParams(location.search)
  next.delete("sent")
  next.delete("select")
  location.search = next.toString()
})

// 開いた直後は、今の画面と同じく入力欄にフォーカスがある。
if (params.get("sent") === "1") {
  send(picks[0]?.request ?? "設定の読み込みの順を調べて")
} else {
  focusDraft()
  const wanted = Number(params.get("select") ?? "-1")
  if (Number.isInteger(wanted) && wanted >= 0 && wanted < choices.length) {
    if (wanted > 0 && stacked && !open) {
      open = true
      renderStart()
    }
    select(wanted)
  } else {
    renderHint()
  }
}
