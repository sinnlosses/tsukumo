// サイドバーとタスク一覧の見本の切り替え。URL の検索引数から案と場面を読み、右のサイドバーと、
// そこから開く面（プレビュー・モーダル・左へ開く面・盤）を組む。器と中央の流れは ../report-progress-2026-11-15/ のまま。
// 印・語・行の形は3案で同じものを使い、案ごとに違うのは一覧の分け方と、詳細を開く先だけ。
// 中身はすべて架空で、実物のタスクではない。

const DESIGNS = ["a", "b", "c", "b2"]
const VIEWS = ["rest", "task", "list", "draft", "chat", "search", "typed", "none"]

const query = new URLSearchParams(location.search)

function choose(name, allowed) {
  const value = query.get(name)
  return allowed.includes(value) ? value : allowed[0]
}

// b2 は案B の仕上げ（字を締め、探す欄を常設にし、一覧モードを足したもの）。組み立ては案B を土台にする。
// 仕上げだけが読む引数: ?type=13|12（行の題の字の大きさ）、
// ?head=stack|inline（サイドバーの頭の形。題と欄を2行に積むか、欄と口を1行にまとめるか）。
const requested = choose("design", DESIGNS)
const refined = requested === "b2"
const design = refined ? "b" : requested
const view = choose("view", VIEWS)
const headForm = choose("head", ["stack", "inline"])
document.body.dataset.design = design
document.body.dataset.view = view
if (refined) {
  document.body.dataset.refine = "2"
  document.body.dataset.type = choose("type", ["13", "12"])
}

// 状態の語と並び。印は同じ名前のスプライト（#tk-<状態>）。
const STATES = {
  doing: { word: "進行中" },
  ready: { word: "着手可" },
  blocked: { word: "待ち" },
  hold: { word: "保留" },
  draft: { word: "ドラフト" },
  done: { word: "完了" },
}
const STATE_ORDER = ["doing", "ready", "blocked", "hold", "draft", "done"]

// 開いて見せる3件の本文（ほかは開かない）。
const BODIES = {
  "T-107": `<h4>目的・背景</h4>
<p>架空の本文で、実物のタスクではない。390px の幅で、設定の一覧の3行目が下端で欠ける。行の高さの計算が、折り返した見出しを数えていない。</p>
<h4>やること</h4>
<ul><li>行の高さを中身から決める</li><li>折り返した見出しの行を数える</li></ul>
<h4>完了条件</h4>
<ul><li>390px で3行目が欠けずに読める</li><li>広い幅の見た目は変わらない</li></ul>`,
  "T-109": `<h4>目的・背景</h4>
<p>架空の本文で、実物のタスクではない。知らせの切り替えは端末ごとに保存しているが、新しい端末では既定値に戻る。</p>
<h4>やること</h4>
<ul><li>既定値を <code>settings.json</code> から読む</li><li>端末に値が無いときだけ既定値を写す</li><li>切り替えた値は端末の側を優先する</li></ul>
<h4>完了条件</h4>
<ul><li>新しい端末で開くと、既定値が入っている</li><li>単体テストが通る</li></ul>`,
  "T-114": `<h4>目的・背景</h4>
<p>架空の本文で、実物のタスクではない。振り返りが兆候として積んだ。設定のテストが、日付の変わり目に1度だけ落ちた。</p>
<h4>やること</h4>
<ul><li>時計を引数で渡して、時刻に依存しない形にする</li></ul>
<h4>完了条件</h4>
<ul><li>日付の変わり目に固定した時計でも通る</li></ul>`,
}

const TASKS = [
  { id: "T-104", state: "doing", title: "設定に知らせの切り替えを足す", model: "sonnet", loop: true, labels: ["設定"], waits: [] },
  { id: "T-105", state: "ready", title: "知らせの文言を平易な語にそろえる", model: "haiku", loop: true, labels: [], waits: [] },
  { id: "T-107", state: "ready", title: "狭い幅で一覧の3行目が欠けるのを直す", model: "sonnet", loop: true, labels: ["不具合"], waits: [] },
  { id: "T-108", state: "ready", title: "成果の暦に週の区切りを入れる", model: "haiku", loop: true, labels: [], waits: [] },
  { id: "T-111", state: "ready", title: "設定の検索で変換中の Enter を見送る", model: "sonnet", loop: true, labels: ["不具合"], waits: [] },
  { id: "T-113", state: "ready", title: "知らせの音を3種から選べるようにする", model: "sonnet", loop: false, labels: [], waits: [] },
  { id: "T-106", state: "blocked", title: "知らせの切り替えの E2E を足す", model: "sonnet", loop: true, labels: [], waits: ["T-104"] },
  { id: "T-109", state: "blocked", title: "知らせの既定値を端末ごとに引き継ぐ", model: "opus", loop: false, labels: ["設定"], waits: ["T-104", "T-106"] },
  { id: "T-110", state: "hold", title: "設定の並び替えをドラッグでできるようにする", model: "opus", loop: false, labels: [], waits: [] },
  { id: "T-112", state: "hold", title: "知らせの許可を求める時機を見直す", model: "sonnet", loop: true, labels: [], waits: [] },
  { id: "T-114", state: "draft", title: "設定のテストが時刻に依存して落ちる兆候", model: "sonnet", loop: false, labels: ["振り返り"], waits: [] },
  { id: "T-115", state: "draft", title: "規約の索引に <code>notice.md</code> への行が無い", model: "haiku", loop: false, labels: ["振り返り"], waits: [] },
  { id: "T-103", state: "done", title: "設定の見出しの階層をそろえる", model: "haiku", loop: true, labels: [], waits: [] },
  { id: "T-102", state: "done", title: "知らせの音量を保存する", model: "sonnet", loop: true, labels: [], waits: [] },
  { id: "T-101", state: "done", title: "設定の検索を足す", model: "sonnet", loop: true, labels: [], waits: [] },
]

const byId = new Map(TASKS.map((task) => [task.id, task]))
const count = (state) => TASKS.filter((task) => task.state === state).length
const of = (...states) => TASKS.filter((task) => states.includes(task.state))

// 場面ごとに開いているタスク。1件を開く場面は着手できるもの、一覧を開く場面は待ちのあるもの。
// 仕分けの場面で1件の詳細を開くのは案A だけ（案B は仕分けの面、案C は列の中で仕分ける）。
const OPEN_ID = { rest: "", task: "T-107", list: "T-109", draft: design === "a" ? "T-114" : "", chat: "" }[view]
// 仕分けの場面で選んである仕分け。
const SORTED = { "T-114": "drop", "T-115": "plan" }
// 探す欄に入っている語。最初の案B は一覧を開く場面でだけ欄を出し、語が入っている。
// 仕上げの欄は常設で、語が入るのは入力中と当たりなしの場面。フォーカスを置いて見せるのは search・typed・none の3場面。
const SEARCH_WORDS = refined ? { typed: "知らせ", none: "請求" } : { list: "知らせ" }
const SEARCH_WORD = SEARCH_WORDS[view] ?? ""
const searching = refined || view in SEARCH_WORDS
const searchFocused = refined && ["search", "typed", "none"].includes(view)
// 頼む相手の名前。入力欄の「◯◯ への依頼を書く」と同じ名前で呼ぶ（`pack` は器のスクリプトが持つ）。
const ASK_LABEL = `${pack.name} に頼む`

function ic(name, extra = "") {
  return `<svg viewBox="0 0 24 24" class="tk-ic${extra}" aria-hidden="true"><use href="#tk-${name}" /></svg>`
}

function mark(state) {
  return `<span class="tk-mark" data-state="${state}" title="${STATES[state].word}">${ic(state)}</span>`
}

/** 状態の印と語。待ちは待っている相手の ID を続ける。 */
function stateWord(task) {
  const waits = task.state === "blocked" ? ` ${task.waits.join("・")}` : ""
  return `<span class="tk-state" data-state="${task.state}">${ic(task.state)}${STATES[task.state].word}${waits}</span>`
}

/** 難しさの3段の目盛り。語（モデルの名前）と必ず並べて出す。 */
function meter(model) {
  const level = { haiku: 1, sonnet: 2, opus: 3 }[model]
  const cells = [1, 2, 3].map((step) => `<i${step <= level ? ' class="on"' : ""}></i>`).join("")
  return `<span class="tk-meter" aria-hidden="true">${cells}</span>`
}

/** 行の2段目。待ちの相手・ID・ループの印・難しさの語の順。 */
function meta(task, { withMeter = false } = {}) {
  const waits = task.state === "blocked" ? `<span class="tk-wait">待ち ${task.waits.join("・")}</span>` : ""
  const loop = task.loop ? `<span class="tk-loop" title="ループ可">${ic("loop", " tk-ic-sm")}</span>` : ""
  const level = withMeter ? meter(task.model) : ""
  return `<span class="tk-meta">${waits}<span class="tk-id">${task.id}</span>${loop}<span class="tk-model">${level}${task.model}</span></span>`
}

/** 探す語に当たった所を印で囲む。語が空ならそのまま返す。 */
function withHit(text, word) {
  return word === "" ? text : text.replaceAll(word, `<mark class="tk-hit">${word}</mark>`)
}

/**
 * 一覧の1行。サイドバー・モーダルの一覧・盤の札で同じ形を使う。
 * `hit` は探す語（題の当たった所を囲む）、`cursor` は ↑↓ で選んでいる行。
 */
function row(task, { withMeter = false, tag = "", extra = "", hit = "", cursor = false } = {}) {
  const open = task.id === OPEN_ID
  return `<li class="tk-item" data-id="${task.id}"${tag}>
    <button class="tk-row" type="button" data-state="${task.state}" aria-expanded="${open}"${open ? ' data-open="true"' : ""}${cursor ? ' data-cursor="true"' : ""}>
      ${mark(task.state)}
      <span class="tk-text"><span class="tk-title">${withHit(task.title, hit)}</span>${meta(task, { withMeter })}</span>
      ${ic("right", " tk-ic-sm tk-go")}
    </button>${extra}
  </li>`
}

function tool(name, label) {
  return `<button class="tk-tool" type="button" aria-label="${label}" title="${label}">${ic(name)}</button>`
}

/** 状態の件数の帯。絞り込みを兼ね、印の意味もここで読める。 */
function counts({ pressed = "", withAll = false } = {}) {
  const all = withAll
    ? `<button class="tk-count" type="button" aria-pressed="${pressed === ""}"><span class="tk-count-label tk-count-all">すべて</span><b>${TASKS.length}</b></button>`
    : ""
  const chips = STATE_ORDER.map(
    (state) =>
      `<button class="tk-count" type="button" data-state="${state}" aria-pressed="${pressed === state}" aria-label="${STATES[state].word} ${count(state)}件" title="${STATES[state].word}">${mark(state)}<span class="tk-count-label">${STATES[state].word}</span><b>${count(state)}</b></button>`,
  ).join("")
  return `<div class="tk-counts" role="group" aria-label="状態で絞る">${all}${chips}</div>`
}

const USAGE = `<footer class="sb-usage" aria-label="使用量">
  <button class="us-item" type="button" title="コンテキスト 122k / 200k"><span class="us-label">コンテキスト</span><b>61%</b><span class="us-bar"><i style="inline-size: 61%"></i></span></button>
  <button class="us-item" type="button" title="5時間の枠。20:00 に戻る"><span class="us-label">5時間</span><b>34%</b><span class="us-bar"><i style="inline-size: 34%"></i></span></button>
  <button class="us-item" type="button" title="7日間の枠。11/18 に戻る"><span class="us-label">7日</span><b>61%</b><span class="us-bar"><i style="inline-size: 61%"></i></span></button>
</footer>`

/** サイドバーの頭。`search` は探す口の出し方（none は口なし、tool は口だけ、field は欄を開いた状態）。 */
function head({ widenLabel = "一覧を広げる", widenIcon = "widen", search = "none", hits = 0 } = {}) {
  // 仕上げの欄は常設。空のあいだは欄へ移るキーを右端に出し、語が入ると件数と語を消す口に替わる。
  const inline = refined && headForm === "inline"
  const fieldEnd = !refined
    ? `<span class="tk-search-hit">${hits} 件</span>`
    : SEARCH_WORD === ""
      ? `<kbd>/</kbd>`
      : `<span class="tk-search-hit">${hits} 件</span>${tool("close", "語を消す")}`
  const field =
    search === "field"
      ? `<label class="tk-search sb-search">${ic("search", " tk-ic-sm")}<input type="search" id="side-search" value="${SEARCH_WORD}" placeholder="${inline ? "タスクを探す" : "ID・言葉で探す"}" aria-label="タスクを探す" />${fieldEnd}</label>`
      : ""
  // 1行にまとめる形は、題を画面に出さず（読み上げには残す）、欄の薄い字が題の代わりになる。
  const title = inline
    ? `<h2 class="visually-hidden">タスク</h2>`
    : `<h2 class="sb-title">タスク<span class="sb-total">${TASKS.length}</span></h2>`
  return `<header class="sb-head"${refined ? ` data-form="${headForm}"` : ""}>
    ${title}
    <span class="sb-tools">${search === "tool" ? tool("search", "探す") : ""}${tool("refresh", "最新化")}${tool(widenIcon, widenLabel)}</span>
    ${field}
  </header>`
}

function fold(label, number, { open = false, action = "" } = {}) {
  return `<h3 class="sb-group-head"><button class="sb-fold" type="button" aria-expanded="${open}">${ic(open ? "down" : "right", " tk-ic-sm")}${label}<b>${number}</b></button>${action}</h3>`
}

function group(label, tasks, { open = true, action = "", key = "", hit = "", cursorId = "" } = {}) {
  const rows = open
    ? `<ul class="tk-list">${tasks.map((task) => row(task, { hit, cursor: task.id === cursorId })).join("")}</ul>`
    : ""
  return `<section class="sb-group"${key ? ` data-group="${key}"` : ""}>${fold(label, tasks.length, { open, action })}${rows}</section>`
}

// 案A: 一覧は1本のまま。状態の順に並べ、完了は末尾に畳む。
function sidebarA() {
  const active = of("doing", "ready", "blocked", "hold", "draft")
  return `${head()}
  <div class="sb-body">
    <div class="sb-filter">${counts()}</div>
    <ul class="tk-list">${active.map((task) => row(task)).join("")}</ul>
    <section class="sb-group sb-group-tail">${fold("完了", count("done"))}</section>
  </div>${USAGE}`
}

// 案B: 状態の段に分ける。件数の帯と凡例は持たず、段の見出しが状態を言う。
// 一覧を開く場面では、探す欄を開いて語で絞り、済みの段も開く。
function sidebarB() {
  const filtering = SEARCH_WORD !== ""
  const shown = (...states) => of(...states).filter((task) => !filtering || task.title.includes(SEARCH_WORD))
  const all = shown(...STATE_ORDER)
  const hits = all.length
  const sortAction = `<button class="tk-link" type="button"${view === "draft" ? ' aria-pressed="true"' : ""}>${ic("sort", " tk-ic-sm")}仕分ける</button>`
  // 絞っているあいだは、当たりの無い段を出さず、済みの段も開く。↑↓ の位置は最初の当たりから始まる。
  const cursorId = refined && filtering ? (all[0]?.id ?? "") : ""
  const part = (label, tasks, options = {}) =>
    filtering && tasks.length === 0 ? "" : group(label, tasks, { ...options, hit: SEARCH_WORD, cursorId })
  const groups = [
    part("いま", shown("doing"), { key: "now" }),
    part("つぎ", shown("ready")),
    part("待ち", shown("blocked", "hold")),
    part("ドラフト", shown("draft"), { action: sortAction, key: "draft" }),
    part("済み", shown("done"), { open: filtering }),
  ]
  const empty =
    filtering && hits === 0
      ? `<p class="sb-empty">「${SEARCH_WORD}」に当たるタスクは無い。ID・題・本文を探した。</p>`
      : ""
  // 最初の案B は面を広げる・狭める口、仕上げは一覧モードを開く口。
  const widen = refined
    ? { widenLabel: "一覧を見る", widenIcon: "widen" }
    : { widenLabel: searching ? "面を狭める" : "面を広げる", widenIcon: searching ? "narrow" : "widen" }
  return `${head({ search: searching ? "field" : "tool", hits, ...widen })}
  <div class="sb-body">${groups.join("")}${empty}</div>${USAGE}`
}

// 案C: サイドバーは要約。流れの帯と、いまの1件、つぎの3件だけを置く。
function sidebarC() {
  const lanes = [
    ["draft", count("draft"), "ドラフト"],
    ["blocked", count("blocked") + count("hold"), "待ち"],
    ["ready", count("ready"), "着手可"],
    ["doing", count("doing"), "進行中"],
    ["done", count("done"), "完了"],
  ]
  const flow = lanes
    .map(
      ([state, number, word]) =>
        `<button class="fl-lane" type="button" data-state="${state}" style="flex-grow: ${number}" aria-label="${word} ${number}件" title="${word}"><span class="fl-bar"></span><span class="fl-count">${mark(state)}<b>${number}</b></span></button>`,
    )
    .join("")
  const next = of("ready").slice(0, 3)
  const rest = count("ready") - next.length
  return `${head({ widenLabel: "盤を開く", widenIcon: "board" })}
  <div class="sb-body">
    <div class="fl" role="group" aria-label="タスクの流れ">${flow}</div>
    ${group("いま", of("doing"), { key: "now" })}
    <section class="sb-group">${fold("つぎ", count("ready"), { open: true })}<ul class="tk-list">${next.map((task) => row(task)).join("")}</ul>
      <button class="tk-more" type="button">${ic("board", " tk-ic-sm")}ほか ${rest} 件と、待ち・ドラフトは盤で見る</button>
    </section>
  </div>${USAGE}`
}

// 雑談中のサイドバー。見出しの大きさと余白は、仕事中の段の見出しと同じ。
function sidebarChat() {
  const topics = ["秋の夜長に読む本", "茶の淹れ方", "繰り返しのある曲の心地よさ"]
  const memories = ["朝は静かに始めたい", "ミステリをよく読む", "猫を飼っている", "甘いものは午後に食べる"]
  return `<header class="sb-profile">
    <img class="sb-face" src="../../../../characters/tsukumo/face.png" alt="" />
    <div class="sb-profile-text"><p class="sb-name">つくも</p><p class="sb-tagline">このターミナルに棲みついた狐の付喪神</p></div>
  </header>
  <div class="sb-body">
    <section class="sb-group"><h3 class="sb-group-head"><span class="sb-fold">最近の話題<b>${topics.length}</b></span></h3>
      <ul class="sb-notes">${topics.map((topic) => `<li>${topic}</li>`).join("")}</ul></section>
    <section class="sb-group"><h3 class="sb-group-head"><span class="sb-fold">覚えていること<b>${memories.length}</b></span></h3>
      <ul class="sb-notes">${memories.map((memory) => `<li>${memory}</li>`).join("")}</ul></section>
  </div>${USAGE}`
}

/** つながりの行。詳細の中で、待っている相手と、これを待っている相手を出す。 */
function linkRow(id) {
  const task = byId.get(id)
  return `<li><button class="dt-link" type="button">${mark(task.state)}<span class="dt-link-title">${task.title}</span><span class="tk-id">${task.id}</span><span class="dt-link-state">${STATES[task.state].word}</span>${ic("right", " tk-ic-sm")}</button></li>`
}

/** 詳細の本体。プレビュー以外の、開く先（モーダル・面・盤）で同じものを使う。 */
function detail(task) {
  const waitsFor = TASKS.filter((other) => other.waits.includes(task.id))
  const before = task.waits.length
    ? `<section class="dt-links"><h4>先に終わっていてほしいもの</h4><ul>${task.waits.map(linkRow).join("")}</ul></section>`
    : ""
  const after = waitsFor.length
    ? `<section class="dt-links"><h4>これを待っているもの</h4><ul>${waitsFor.map((other) => linkRow(other.id)).join("")}</ul></section>`
    : ""
  const labels = task.labels.length
    ? `<div><dt>ラベル</dt><dd>${task.labels.map((label) => `<span class="tk-tag">${label}</span>`).join("")}</dd></div>`
    : ""
  return `<article class="dt">
    <p class="dt-top">${stateWord(task)}<button class="dt-id" type="button" title="ID をコピー"><span class="tk-id">${task.id}</span>${ic("copy", " tk-ic-sm")}</button></p>
    <h3 class="dt-title">${task.title}</h3>
    <dl class="dt-props">
      <div><dt>難しさ</dt><dd>${meter(task.model)}${task.model}</dd></div>
      <div><dt>ループ</dt><dd>${task.loop ? `${ic("loop", " tk-ic-sm")}ループ可` : "手で進める"}</dd></div>
      ${labels}
    </dl>
    ${before}${after}
    <section class="dt-body">${BODIES[task.id]}</section>
  </article>`
}

/** 頼みの口。着手できるタスクだけ押せ、押せないときは理由を左に添える。 */
function ask(task) {
  if (task.state === "draft") {
    return `<button class="tk-button" type="button">却下する</button><button class="tk-ask" type="button">${ic("sort")}計画する</button>`
  }
  const reason = {
    blocked: "待ちが終わると頼める",
    doing: "いま進めている",
    done: "終わったタスク",
    hold: "保留を解くと頼める",
  }[task.state]
  return reason
    ? `<span class="tk-reason">${reason}</span><button class="tk-ask" type="button" disabled>${ic("send")}${ASK_LABEL}</button>`
    : `<button class="tk-ask" type="button">${ic("send")}${ASK_LABEL}</button>`
}

/** 詳細の下の操作の帯。`compact` は幅の狭い置き場（盤の詳細）で、Issue の口を印だけにする。 */
function actions(task, { hints = false, compact = false } = {}) {
  const keys = hints ? `<span class="tk-keys"><kbd>↑↓</kbd>選ぶ<kbd>⏎</kbd>頼む<kbd>Esc</kbd>閉じる</span>` : ""
  const issue = compact
    ? tool("external", "Issue を開く")
    : `<button class="tk-button" type="button">${ic("external", " tk-ic-sm")}Issue を開く</button>`
  return `<footer class="dt-foot">${keys}${issue}<span class="dt-foot-gap"></span>${ask(task)}</footer>`
}

// 案A・案C: 行のそばに出すプレビュー。最上位の層に出るので、ぼかしの面に切られない。
function peek(task) {
  const labels = task.labels.map((label) => `<span class="tk-tag">${label}</span>`).join("")
  return `<div class="pk" id="peek" popover="manual" role="dialog" aria-label="${task.id} の詳細">
    <p class="dt-top">${stateWord(task)}<span class="tk-id">${task.id}</span><span class="pk-tools">${tool("widen", "全文を開く")}${tool("close", "閉じる")}</span></p>
    <h3 class="pk-title">${task.title}</h3>
    <p class="pk-props">${task.loop ? `<span>${ic("loop", " tk-ic-sm")}ループ可</span>` : "<span>手で進める</span>"}<span>${meter(task.model)}${task.model}</span>${labels}</p>
    <p class="pk-body">架空の本文で、実物のタスクではない。390px の幅で、設定の一覧の3行目が下端で欠ける。行の高さの計算が、折り返した見出しを数えていない。</p>
    <footer class="pk-foot">${ask(task)}</footer>
  </div>`
}

/** 仕分けの3択。選んだ側は印と地の色で言う。 */
function sortChoice(task) {
  const chosen = SORTED[task.id] ?? "later"
  const choices = [
    ["plan", "計画"],
    ["drop", "却下"],
    ["later", "あとで"],
  ]
  const buttons = choices
    .map(
      ([value, label]) =>
        `<button class="st-choice" type="button" role="radio" data-choice="${value}" aria-checked="${chosen === value}">${chosen === value ? ic("check", " tk-ic-sm") : ""}${label}</button>`,
    )
    .join("")
  const reason =
    chosen === "drop"
      ? `<label class="st-reason"><span>却下の理由</span><input type="text" value="再現せず。兆候の記録だけ残す" /></label>`
      : ""
  return `<div class="st" role="radiogroup" aria-label="${task.id} の仕分け">${buttons}</div>${reason}`
}

const SORT_BAND = `<footer class="dt-foot st-band"><button class="tk-button" type="button">仕分けを戻す</button><span class="dt-foot-gap"></span><span class="tk-reason">あとで 0 件</span><button class="tk-ask" type="button">${ic("send")}計画 1・却下 1 を頼む</button></footer>`

function boardHead({ title = "タスク" } = {}) {
  return `<header class="tb-head">
    <h2 class="tb-title">${title}</h2>
    <label class="tk-search">${ic("search", " tk-ic-sm")}<input type="search" placeholder="ID・言葉で探す" aria-label="タスクを探す" /><kbd>/</kbd></label>
    <span class="tb-tools">${tool("refresh", "最新化")}${tool("close", "閉じる")}</span>
  </header>`
}

// 案A: まん中に開くモーダル。左に一覧、右に詳細。
function modalA() {
  const sorting = view === "draft"
  const shown = sorting ? of("draft") : TASKS
  const rows = shown
    .map((task) => row(task, { withMeter: true, extra: sorting ? `<div class="st-wrap">${sortChoice(task)}</div>` : "" }))
    .join("")
  const open = byId.get(OPEN_ID)
  return `<dialog class="tb" id="board" aria-label="タスク">
    ${boardHead()}
    <div class="tb-filter">${counts({ pressed: sorting ? "draft" : "", withAll: true })}</div>
    <div class="tb-cols">
      <ul class="tk-list tb-list" role="listbox" aria-label="タスク">${rows}</ul>
      <div class="tb-detail">${detail(open)}</div>
    </div>
    ${sorting ? SORT_BAND : actions(open, { hints: true })}
  </dialog>`
}

// 案B: サイドバーの左へ開く面。一覧はサイドバーのまま動かさない。
function sheetB() {
  // 面を広げるのは最初の案B だけ。仕上げでは、同じ口が一覧モードを開く。
  const wide = !refined && view === "list"
  const widen = refined
    ? tool("widen", "一覧モードで開く")
    : tool(wide ? "narrow" : "widen", wide ? "面を狭める" : "面を広げる")
  if (view === "draft") {
    const cards = of("draft")
      .map(
        (task) =>
          `<li class="st-card"><p class="dt-top">${stateWord(task)}<span class="tk-id">${task.id}</span><span class="tk-model">${meter(task.model)}${task.model}</span></p><h3 class="st-title">${task.title}</h3><p class="st-note">架空の本文で、実物のタスクではない。振り返りが兆候として積んだ。</p>${sortChoice(task)}</li>`,
      )
      .join("")
    return `<aside class="sh" id="sheet" data-size="narrow" aria-label="ドラフトの仕分け">
      <header class="sh-head"><h2 class="sh-title">ドラフトを仕分ける<b>${count("draft")}</b></h2><span class="sb-tools">${tool("close", "閉じる")}</span></header>
      <div class="sh-scroll"><ul class="st-list">${cards}</ul></div>
      ${SORT_BAND}
    </aside>`
  }
  const open = byId.get(OPEN_ID)
  return `<aside class="sh" id="sheet" data-size="${wide ? "wide" : "narrow"}" aria-label="${open.id} の詳細">
    <header class="sh-head"><span class="sh-step">${tool("left", "前のタスク")}${tool("right", "次のタスク")}</span><span class="sb-tools">${widen}${tool("close", "閉じる")}</span></header>
    <div class="sh-scroll">${detail(open)}</div>
    ${actions(open)}
  </aside>`
}

/**
 * 一覧モードの表の1行。列は ID・題・難しさ・ループ可の順で、状態の印は ID の前に置く。
 * 待ちの相手は列にせず、題の後ろに添える（サイドバーの行の2段目と同じ語）。
 */
function tableRow(task) {
  const open = task.id === OPEN_ID
  const waits = task.state === "blocked" ? `<span class="lt-wait">待ち ${task.waits.join("・")}</span>` : ""
  return `<tr class="lt-row" data-state="${task.state}" aria-selected="${open}">
    <td><span class="lt-id-in">${mark(task.state)}<span class="tk-id">${task.id}</span></span></td>
    <td class="lt-title"><span class="lt-title-in"><span class="lt-name">${task.title}</span>${waits}</span></td>
    <td><span class="tk-model">${meter(task.model)}${task.model}</span></td>
    <td class="lt-loop">${task.loop ? `<span title="ループ可">${ic("loop", " tk-ic-sm")}</span>` : ""}</td>
  </tr>`
}

// 案B の仕上げ: 一覧モード。全件を見渡すための面で、サイドバーの「一覧を見る」と、面の「一覧モードで開く」から開く。
// 1行1件の表で、段の分け方と行の印はサイドバーと同じ。
function listModeB() {
  const open = byId.get(OPEN_ID)
  const stages = [
    ["いま", of("doing")],
    ["つぎ", of("ready")],
    ["待ち", of("blocked", "hold")],
    ["ドラフト", of("draft")],
    ["済み", of("done")],
  ]
  const table = `<table class="lt">
    <thead><tr><th scope="col">ID</th><th scope="col">題</th><th scope="col">難しさ</th><th scope="col">ループ可</th></tr></thead>
    ${stages
      .map(
        ([label, tasks]) =>
          `<tbody><tr class="lt-stage"><th colspan="4" scope="rowgroup">${label}<b>${tasks.length}</b></th></tr>${tasks.map(tableRow).join("")}</tbody>`,
      )
      .join("")}
  </table>`
  return `<dialog class="tb tb-all" id="board" aria-label="タスクの一覧">
    <header class="tb-head">
      <h2 class="tb-title">タスク<b>${TASKS.length}</b></h2>
      <label class="tk-search">${ic("search", " tk-ic-sm")}<input type="search" placeholder="ID・言葉で探す" aria-label="タスクを探す" /><kbd>/</kbd></label>
      <span class="tb-tools">${tool("refresh", "最新化")}${tool("close", "閉じる")}</span>
    </header>
    <div class="tb-filter">${counts({ withAll: true })}</div>
    <div class="tb-cols">
      <div class="lt-wrap">${table}</div>
      <div class="tb-detail">${detail(open)}</div>
    </div>
    ${actions(open, { hints: true })}
  </dialog>`
}

// 案C: 状態の列に並べる盤。待ちの相手は札の輪郭で示す。
function boardC() {
  const sorting = view === "draft"
  const open = byId.get(OPEN_ID)
  const linked = new Set(open?.waits ?? [])
  const columns = [
    ["draft", "ドラフト", of("draft")],
    ["blocked", "待ち", of("blocked", "hold")],
    ["ready", "着手可", of("ready")],
    ["doing", "進行中", of("doing")],
    ["done", "完了", of("done")],
  ]
  const cols = columns
    .map(([state, word, tasks]) => {
      const cards = tasks
        .map((task) =>
          row(task, {
            tag: !sorting && linked.has(task.id) ? ' data-link="before"' : "",
            extra: sorting && state === "draft" ? `<div class="st-wrap">${sortChoice(task)}</div>` : "",
          }),
        )
        .join("")
      const band =
        sorting && state === "draft"
          ? `<button class="tk-ask bd-ask" type="button">${ic("send")}計画 1・却下 1 を頼む</button>`
          : ""
      return `<section class="bd-col" data-state="${state}"><h3 class="bd-head">${mark(state)}${word}<b>${tasks.length}</b></h3><ul class="tk-list bd-list">${cards}</ul>${band}</section>`
    })
    .join("")
  // 仕分けのあいだは詳細を閉じ、ドラフトの列を広げる（頼みの口を列の下の1つにする）。
  const side = sorting ? "" : `<div class="tb-detail">${detail(open)}${actions(open, { compact: true })}</div>`
  return `<dialog class="tb tb-board" id="board" aria-label="タスクの盤"${sorting ? ' data-sorting="true"' : ""}>
    ${boardHead({ title: "タスクの盤" })}
    <div class="tb-cols">
      <div class="bd">${cols}</div>
      ${side}
    </div>
  </dialog>`
}

const sidebar = document.querySelector("#sidebar")
const overlay = document.querySelector("#overlay-root")

sidebar.innerHTML = view === "chat" ? sidebarChat() : { a: sidebarA, b: sidebarB, c: sidebarC }[design]()

if (view === "chat") {
  // 雑談では進行の帯とやり取りの列を持たない。流れは数行の雑談に差し替え、入力欄は送る側の形にする。
  document.querySelector(".shelf")?.remove()
  document.querySelector(".turn-lane")?.remove()
  document.body.dataset.scene = "chat"
  document.querySelector("#draft").placeholder = `${pack.name} に話しかける`
  document.querySelector("#stream").innerHTML = [
    `<p class="say">おかえり。今日は静かな夜だぞ。<time>21:04</time></p>`,
    `<p class="post">一区切りついたから、少し休憩<time>21:05</time></p>`,
    `<p class="say">ふむ、それなら茶を淹れ直すといいのだ。<time>21:05</time></p>`,
  ].join("")
  const tabs = document.querySelectorAll(".nav-modes .nav-tab")
  tabs[0]?.removeAttribute("aria-current")
  tabs[1]?.setAttribute("aria-current", "page")
}

const opensDetail = view === "task" || view === "list" || view === "draft"
if (opensDetail) {
  const wantsPeek = view === "task" && design !== "b"
  const wantsListMode = refined && view === "list"
  if (wantsPeek) {
    overlay.innerHTML = peek(byId.get(OPEN_ID))
    const anchor = sidebar.querySelector(`[data-id="${OPEN_ID}"] .tk-row`)
    anchor.style.anchorName = "--peek-row"
    overlay.querySelector("#peek").showPopover()
  } else if (design === "b" && !wantsListMode) {
    overlay.innerHTML = sheetB()
    // 面は進行の帯の下から入力欄の上までに収め、開いたまま進行を見て、頼めるようにする。
    const sheet = overlay.querySelector("#sheet")
    const composer = document.querySelector(".composer").getBoundingClientRect()
    const strip = document.querySelector(".shelf").getBoundingClientRect()
    sheet.style.setProperty("--sheet-top", `${strip.bottom + 8}px`)
    sheet.style.setProperty("--sheet-bottom", `${innerHeight - composer.top + 12}px`)
    sheet.style.setProperty("--sheet-start", `${composer.left}px`)
    if (view === "draft") {
      const drafts = sidebar.querySelector('[data-group="draft"]')
      drafts.dataset.active = "true"
      drafts.scrollIntoView({ block: "center" })
    } else {
      sidebar.querySelector('[data-open="true"]')?.scrollIntoView({ block: "nearest" })
    }
  } else {
    overlay.innerHTML = wantsListMode ? listModeB() : design === "c" ? boardC() : modalA()
    overlay.querySelector("#board").showModal()
  }
}

// 仕上げの探す場面は、欄にフォーカスが入った状態（欄を押した直後・`/` を打った直後と同じ）で見せる。
if (searchFocused) {
  const field = sidebar.querySelector("#side-search")
  field.focus()
  field.setSelectionRange(field.value.length, field.value.length)
}

// 仕上げの場面は最初の3案と違うので、上の切り替えの帯の場面を差し替える。
if (refined) {
  const views = [
    ["rest", "通常"],
    ["task", "詳細"],
    ["search", "欄にフォーカス"],
    ["typed", "入力中"],
    ["none", "当たりなし"],
    ["list", "一覧モード"],
    ["draft", "ドラフトの分類"],
  ]
  document.querySelector('.mock-bar-group[data-param="view"]').innerHTML = views
    .map(([value, label]) => {
      const next = new URLSearchParams(location.search)
      next.set("view", value)
      return `<a data-value="${value}" href="?${next}">${label}</a>`
    })
    .join("")
}

// 上の切り替えの帯の、いまの案と場面。
for (const link of document.querySelectorAll('.mock-bar-group[data-param="design"] a, .mock-bar-group[data-param="view"] a')) {
  const name = link.closest(".mock-bar-group").dataset.param
  if (link.dataset.value === { design: requested, view }[name]) {
    link.setAttribute("aria-current", "true")
  }
}
