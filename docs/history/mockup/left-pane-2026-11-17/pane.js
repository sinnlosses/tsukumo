// 左の列の見本。URL の検索引数から形・場面・パックを読み、やり取りの列・立ち絵・席・中央の列を組む。
// 今の形（design=now）の寸法は、今の画面を疑似セッションで撮って測った値に合わせてある
// （列の幅 238px、やり取りの列の左上 28,68、立ち絵の箱 214×342、提灯の下端は箱の上端から 32px 下）。
// 中身はすべて架空で、実物の会話ではない。

const DESIGNS = ["now", "a", "b", "c"]
const MOMENTS = ["work", "read", "many"]
const PACKS = {
  tsukumo: { name: "つくも", accent: "#6fe3cd", ratio: 1145 / 1374 },
  shirasuzu: { name: "白鈴", accent: "#f9c3cd", ratio: 1 },
}

const params = new URLSearchParams(location.search)

function pick(name, allowed) {
  const value = params.get(name)
  return allowed.includes(value) ? value : allowed[0]
}

const design = pick("design", DESIGNS)
const moment = pick("moment", MOMENTS)
const packId = pick("pack", Object.keys(PACKS))
const pack = PACKS[packId]
const open = params.get("open") === "1"

document.body.dataset.design = design
document.body.dataset.moment = moment
document.body.dataset.bar = params.get("bar") === "0" ? "0" : "1"
document.body.dataset.open = open ? "1" : "0"

const icon = (id, cls = "icon") =>
  `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true"><use href="#i-${id}" /></svg>`

// ───────── 場面 ─────────

const READ_REPORT = {
  label: "最終",
  title: "設定の読み込みを調べた結果",
  headings: [
    { level: "main", text: "調べたこと" },
    { level: "sub", text: "読み込みの順" },
    { level: "sub", text: "設定の置き場", current: true },
    { level: "main", text: "次にやること" },
    { level: "sub", text: "手順" },
    { level: "sub", text: "確かめ方" },
  ],
}

const MANY_TITLES = [
  "サイドバーの幅を仕切りで変えられるようにしたい",
  "使用量の棒が細い幅で切れるのを直して",
  "設定の読み込みの順を調べて",
  "テストが落ちる原因を探して",
  "タスクの一覧に検索の欄を足したい",
  "一覧の並びを難しさの順にして",
  "E2E を全部回して結果を教えて",
  "落ちた3件を直して",
  "文書の古い節を洗い出して",
  "見出しの語をそろえたい",
  "変更をまとめて送り出して",
  "今日の作業を振り返って報告して",
]

const SCENES = {
  work: {
    expression: "thinking",
    turns: [{ title: "集計の関数とスクリプトを足したい", result: "running" }],
    active: 0,
    report: { label: "レポート", title: "1/4 今の形を調べる", headings: [] },
    strip: { state: "進行中", done: 1, total: 4, name: "4フェーズのうち1フェーズ済み", time: "0:23", steps: 4 },
  },
  read: {
    expression: "proud",
    turns: [
      { title: "サイドバーの幅を仕切りで変えられるようにしたい", result: "done" },
      { title: "使用量の棒が細い幅で切れるのを直して", result: "done" },
      { title: "設定の読み込みの順を調べて、見出しの付いた本文で報告して", result: "done" },
    ],
    active: 2,
    report: READ_REPORT,
    strip: { state: "完了", time: "2分", steps: 6 },
  },
  many: {
    expression: "default",
    turns: MANY_TITLES.map((title, index) => ({
      title,
      result: index === 6 ? "failed" : index === 3 ? "stopped" : "done",
    })),
    active: 11,
    report: {
      label: "最終",
      title: "今日の作業の振り返り",
      headings: [
        { level: "main", text: "今日済んだこと", current: true },
        { level: "main", text: "明日に回すこと" },
      ],
    },
    strip: { state: "完了", time: "1分", steps: 3 },
  },
}

const scene = SCENES[moment]
const activeTurn = scene.turns[scene.active]

// ───────── やり取りの列 ─────────

const RESULT_LABEL = { done: "済み", failed: "失敗", stopped: "止めた", running: "進行中" }
const RESULT_ICON = { done: "check", failed: "cross", stopped: "stop" }

function mark(turn, active) {
  if (active || turn.result === "running") {
    return `<span class="turn-mark" aria-hidden="true"><span class="dot"></span></span>`
  }
  return `<span class="turn-mark" aria-hidden="true">${icon(RESULT_ICON[turn.result])}</span>`
}

function turnButton(turn, index, { wrap = false } = {}) {
  const active = index === scene.active
  return `<button type="button" class="turn${wrap ? " is-wrap" : ""}" data-result="${turn.result}"
    ${active ? 'aria-current="true"' : ""} aria-label="${RESULT_LABEL[turn.result]}: ${turn.title}" title="${turn.title}">
    ${mark(turn, active)}<span class="turn-text">${turn.title}</span>
  </button>`
}

function keys(pair) {
  return `<span class="keys" aria-hidden="true">${pair.map((key) => `<kbd class="key">${key}</kbd>`).join("")}</span>`
}

function tocRows(report) {
  if (report === undefined) {
    return ""
  }
  const head = `<button type="button" class="toc-row" data-level="report" title="${report.title}">
    <span class="toc-bar" aria-hidden="true"></span><span class="toc-label">${report.label}</span>
    <span class="turn-text">${report.title}</span>${keys(["{", "}"])}
  </button>`
  const rows = report.headings
    .map(
      (heading) => `<button type="button" class="toc-row" data-level="${heading.level}"
        ${heading.current ? 'aria-current="location"' : ""} title="${heading.text}">
        <span class="toc-bar" aria-hidden="true"></span><span class="turn-text">${heading.text}</span>
      </button>`,
    )
    .join("")
  return head + rows
}

// 今の形と案 A: 集計期間のやり取りを全部並べ、見ているやり取りの下に見出しを出す。
function laneAll({ count, wrap }) {
  const groups = scene.turns
    .map((turn, index) => {
      const active = index === scene.active
      return `<div class="turn-group${active ? " is-active" : ""}">
        ${turnButton(turn, index, { wrap: wrap && active })}${active ? tocRows(scene.report) : ""}
      </div>`
    })
    .join("")
  return `<nav class="lane" aria-label="やり取り">
    <div class="lane-head">
      <span class="lane-title">やり取り</span>
      ${count ? `<span class="lane-count">${scene.turns.length}</span>` : ""}
      ${keys(["[", "]"])}
      <button type="button" class="icon-button is-small push" aria-label="やり取りを畳む">${icon("chevron-left", "icon icon-sm")}</button>
    </div>
    <div class="lane-list">${groups}</div>
  </nav>`
}

// 案 B・C の頭。キーの印が、前後のやり取りへ移る口を兼ねる。
function stepper() {
  const total = scene.turns.length
  // 1件だけのあいだは移る先が無いので、口ごと出さない。
  if (total < 2) {
    return ""
  }
  const position = scene.active + 1
  const first = position === 1
  const last = position === total
  return `<span class="stepper">
    <button type="button" class="key" aria-label="前のやり取りへ" title="前のやり取りへ（[ キー）" aria-disabled="${first}">[</button>
    <span class="stepper-pos" aria-label="${total}件のうち${position}件目"><b>${position}</b> / ${total}</span>
    <button type="button" class="key" aria-label="次のやり取りへ" title="次のやり取りへ（] キー）" aria-disabled="${last}">]</button>
  </span>`
}

function listButton() {
  if (scene.turns.length < 2 && design === "b") {
    return ""
  }
  return `<button type="button" class="icon-button is-small push list-button" popovertarget="turn-pop"
    aria-label="やり取りの一覧を開く" title="やり取りの一覧">${icon("list", "icon icon-sm")}</button>`
}

// 案 B: 見ているやり取りの題と、そのレポートの見出しだけを常に出す。ほかのやり取りは一覧に入れる。
function laneFocus() {
  const toc = scene.report === undefined ? "" : `<div class="toc">${tocRows(scene.report)}</div>`
  return `<nav class="lane lane-focus" aria-label="やり取り">
    <div class="lane-head">
      <span class="lane-title">やり取り</span>
      ${stepper()}
      ${listButton()}
    </div>
    <div class="lane-list">
      <div class="turn-group is-active">${turnButton(activeTurn, scene.active, { wrap: true })}</div>
      ${toc}
    </div>
  </nav>`
}

// 案 C: 台座。見ているやり取りの題と、読んでいる見出しの1行だけを出す。
function lanePlinth() {
  const headings = scene.report?.headings ?? []
  const currentIndex = headings.findIndex((heading) => heading.current)
  const crumb =
    currentIndex === -1
      ? ""
      : `<button type="button" class="crumb" popovertarget="turn-pop" title="見出しの一覧を開く">
          ${icon("chevron-right", "icon icon-sm")}<span class="turn-text">${headings[currentIndex].text}</span>
          <span class="crumb-pos">${currentIndex + 1} / ${headings.length}</span>
        </button>`
  // 1件だけのあいだは移る先も一覧も無いので、頭の行ごと出さない。
  const head =
    scene.turns.length < 2 && crumb === ""
      ? ""
      : `<div class="lane-head">${stepper()}${listButton()}</div>`
  return `<nav class="lane lane-plinth" aria-label="やり取り">
    ${head}
    <button type="button" class="plinth-title${crumb === "" ? "" : " has-crumb"}" popovertarget="turn-pop" title="${activeTurn.title}">
      ${mark(activeTurn, true)}<span class="turn-text">${activeTurn.title}</span>
    </button>
    ${crumb}
  </nav>`
}

// 一覧の面。案 C は見出しもここで選ぶので、見ているやり取りの下に見出しを並べる。
function turnPopover() {
  const rows = scene.turns
    .map((turn, index) => {
      const withToc = design === "c" && index === scene.active
      return turnButton(turn, index, { wrap: true }) + (withToc ? tocRows(scene.report) : "")
    })
    .join("")
  return `<div id="turn-pop" class="turn-pop" popover aria-label="やり取りの一覧">
    <p class="turn-pop-head">やり取り ${scene.turns.length}件</p>${rows}
  </div>`
}

const LANES = {
  now: () => laneAll({ count: false, wrap: false }),
  a: () => laneAll({ count: true, wrap: true }),
  b: () => laneFocus() + turnPopover(),
  c: () => lanePlinth() + turnPopover(),
}

// ───────── 立ち絵と席 ─────────

const left = document.querySelector("#left")
const stage = document.querySelector("#stage")
left.insertAdjacentHTML("afterbegin", LANES[design]())

// 席は、利用者のいまの置き方（左上に提灯だけ）を既定にする。seats=all で右下にも置く。
const lantern = `<img class="seat seat-top" src="item-lantern.svg" alt="" />`
const bag = params.get("seats") === "all" ? `<img class="seat seat-right" src="item-bag.svg" alt="" />` : ""
if (design === "c") {
  left.insertAdjacentHTML("beforeend", `<span class="cord" aria-hidden="true"></span>${lantern}`)
  stage.insertAdjacentHTML("beforeend", bag)
} else {
  stage.insertAdjacentHTML("afterbegin", lantern)
  stage.insertAdjacentHTML("beforeend", bag)
}

// やり取りの列は、立ち絵と左上の席に被らない高さで止める。
if (design !== "c") {
  const lane = left.querySelector(".lane")
  const limit = () => {
    const seatTop = left.querySelector(".seat-top").getBoundingClientRect().top
    const top = lane.getBoundingClientRect().top
    lane.style.maxBlockSize = `${Math.max(120, seatTop - top - 4)}px`
    // 見ているやり取りが一覧の外へ出ないよう、一覧の中だけを送る。
    const list = lane.querySelector(".lane-list")
    const active = list.querySelector(".turn-group.is-active")
    if (active !== null) {
      const over = active.offsetTop + active.offsetHeight - list.offsetTop - list.clientHeight
      list.scrollTop = Math.max(0, over)
    }
  }
  new ResizeObserver(limit).observe(left)
  document.querySelector("#portrait").addEventListener("load", limit)
}

// ───────── 中央の列 ─────────

function strip() {
  const { state, done, total, name, time, steps } = scene.strip
  const phases =
    total === undefined
      ? ""
      : `<span class="strip-phases">${Array.from({ length: total }, (_, index) => {
          const link = index === 0 ? "" : `<span class="phase-link"></span>`
          if (index < done) {
            return `${link}<span class="phase-dot is-done">${icon("check")}</span>`
          }
          return `${link}<span class="phase-dot${index === done ? " is-current" : ""}">${index + 1}</span>`
        }).join("")}</span>`
  return `<span class="strip-state" style="--state: ${state === "完了" ? "var(--ok)" : "var(--accent)"}">${state}</span>
    ${phases}<span class="strip-name">${name ?? ""}</span>
    <span class="strip-time">所要<b>${time}</b></span>
    <span class="strip-steps">${icon("chevron-right", "icon icon-sm")}手順 ${steps}件</span>`
}

const say = (text) =>
  `<div class="row"><div class="bubble bubble-say"><span class="speaker">${pack.name}</span>${text}</div></div>`
const post = (text, time) =>
  `<div class="row row-user"><div class="bubble bubble-post">${text}</div><span class="stamp">${time}</span></div>`
const fold = (text) => `<span class="fold">${icon("chevron-right", "icon icon-sm")}${text}</span>`

const FLOWS = {
  work: () =>
    [
      post(activeTurn.title, "21:54"),
      say("集計の置き場を見てくるね。まずは今の形を調べるよ。"),
      `<div class="card"><p class="card-head">${icon("check")}1/4 今の形を調べる　所要 9秒</p><p>数えている場所は1か所だった。</p></div>`,
      say("数える場所は1か所にまとまっていたよ。次は関数を足すね。"),
      `<span class="now-line">2/4 関数を足している　0:14</span>`,
    ].join(""),
  read: () =>
    [
      post(activeTurn.title, "21:57"),
      fold("作業の経過 6件・セリフ 3件"),
      say("調べが済んだよ。置き場は1か所にまとまっていたね。"),
      `<article class="paper">
        <h1>設定の読み込みを調べた結果</h1>
        <p>設定は起動時に1回だけ読まれ、置き場は1か所にまとまっていた。</p>
        <h2>調べたこと</h2>
        <h3>読み込みの順</h3>
        <p>既定の値、ホームの設定、作業場所の設定の順に重ねる。</p>
        <h3>設定の置き場</h3>
        <p>3つとも同じ形のファイルで、後ろの置き場が前を覆う。</p>
        <h2>次にやること</h2>
        <h3>手順</h3>
        <p>読み込みの順を1つの関数にまとめ、呼び出し元を置き換える。</p>
        <h3>確かめ方</h3>
        <p>置き場を1つずつ空にして起動し、覆い方が変わらないことを見る。</p>
      </article>`,
    ].join(""),
  many: () =>
    [
      post(activeTurn.title, "23:10"),
      fold("作業の経過 3件・セリフ 2件"),
      say("今日のぶんをまとめたよ。"),
      `<article class="paper">
        <h1>今日の作業の振り返り</h1>
        <p>12件のうち10件が済み、1件は失敗、1件は途中で止めた。</p>
        <h2>今日済んだこと</h2>
        <p>サイドバーの幅の調整、使用量の棒の直し、一覧の検索と並びの直しが main に入った。</p>
        <h2>明日に回すこと</h2>
        <p>E2E の失敗の残り1件と、文書の古い節の書き直し。</p>
      </article>`,
    ].join(""),
}

document.querySelector("#strip").innerHTML = strip()
document.querySelector("#flow").innerHTML = FLOWS[moment]()
document.querySelector("#draft").textContent = `${pack.name} への依頼を書く`

// ───────── パックの素材と切り替えの帯 ─────────

const root = document.documentElement
// 仕切りで列の幅を変えた状態（200〜400px）を確かめるための上書き。
const leftPx = Number(params.get("left"))
if (leftPx >= 200 && leftPx <= 400) {
  document.body.style.setProperty("--left", `${leftPx}px`)
}
root.style.setProperty("--accent", pack.accent)
root.style.setProperty("--art", `url("../../../../characters/${packId}/background.png")`)
root.style.setProperty("--art-ratio", String(pack.ratio))
for (const image of document.querySelectorAll("[data-pack-src]")) {
  image.src = `../../../../characters/${packId}/${image.dataset.packSrc}`
}
document.querySelector("#portrait").src = `../../../../characters/${packId}/${scene.expression}.png`

const current = { design, moment, pack: packId, open: open ? "1" : "0" }
for (const group of document.querySelectorAll(".mock-bar-group")) {
  const name = group.dataset.param
  for (const link of group.querySelectorAll("a")) {
    const next = new URLSearchParams(location.search)
    next.set(name, link.dataset.value)
    link.href = `?${next.toString()}`
    if (link.dataset.value === current[name]) {
      link.setAttribute("aria-current", "true")
    }
  }
}

if (open) {
  document.querySelector("#turn-pop")?.showPopover()
}
