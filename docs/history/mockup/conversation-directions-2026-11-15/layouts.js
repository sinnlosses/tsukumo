// レイアウト候補の見本の切り替え。URL の検索引数から候補・場面・パックを読んで body の印を決め、
// 候補ごとに部品（進行の帯・使用量・入口の部品・紙）を載せ替える。配置と見た目は layouts.css が決める。

const LAYOUTS = ["a", "a2", "b", "c", "d", "e", "f", "g", "h"]
const SCENES = ["read", "greet", "work", "ask"]
const PACKS = {
  tsukumo: { name: "つくも", accent: "#6fe3cd" },
  shirasuzu: { name: "白鈴", accent: "#f9c3cd" },
}

const params = new URLSearchParams(location.search)

function pick(name, allowed) {
  const value = params.get(name)
  return allowed.includes(value) ? value : allowed[0]
}

const layout = pick("layout", LAYOUTS)
const scene = pick("scene", SCENES)
const packId = pick("pack", Object.keys(PACKS))
const pack = PACKS[packId]

document.body.dataset.layout = layout
document.body.dataset.scene = scene
if (params.get("bar") === "0") {
  document.body.dataset.bar = "0"
}

function one(selector) {
  return document.querySelector(selector)
}

function group(className, ...nodes) {
  const box = document.createElement("div")
  box.className = className
  box.append(...nodes)
  return box
}

function marks(part, name) {
  return part.dataset[name].split(" ").includes(layout)
}

// その候補でだけ使う部品を残す。
for (const part of document.querySelectorAll("[data-only]")) {
  if (!marks(part, "only")) {
    part.remove()
  }
}

const app = one(".app")
const nav = one(".nav")
const shell = one(".shell")
const room = one(".nav-room")
const modes = one(".nav-modes")
const links = one(".nav-links")
const gear = one(".nav-gear")
const lane = one(".turn-lane")
const actor = one(".actor")
const talk = one(".talk")
const head = one(".paper-head")
const stream = one(".stream")
const dock = one(".dock")
const side = one(".side")
const usage = one(".usage")

// 背景は入口の帯の下まで敷く（帯を持たない候補では、面の上端まで背景が見える）。
app.prepend(one(".ground"))

// タスクと使用量を入口の帯へ集める（候補 f・g）。一覧は帯のチップから開く。
function gatherIntoBar() {
  const list = one(".task-pop")
  list.append(one(".side-head"), one(".tasks"))
  nav.replaceChildren(room, modes, one(".task-chip"), list, usage, links, gear)
}

// 仕上げ（a2）の調整の項目。URL の値か既定を、refine.css が読む変数へ渡す。
const LOOK = {
  veil: { fallback: 75, variable: "--veil", unit: "%", toCss: (value) => String(value / 100) },
  blur: { fallback: 8, variable: "--panel-blur", unit: "px", toCss: (value) => `${value}px` },
  fill: { fallback: 45, variable: "--panel-fill", unit: "%", toCss: (value) => `${value}%` },
}

// やり取りの列が長いときの形を見るための、前のやり取りの題（架空）。
const EARLIER_TURNS = [
  "起動時の案内文を短くする",
  "タスクの一覧に絞り込みを足す",
  "成果の暦の色をそろえる",
  "キーの一覧を作り直す",
  "狭い幅の引き出しを直す",
  "使用量の表示を見直す",
  "レポートの表の幅をそろえる",
  "設定の検索を足す",
  "知らせの音量を保存する",
]

function numberParam(name, fallback) {
  const value = Number(params.get(name) ?? Number.NaN)
  return Number.isFinite(value) ? value : fallback
}

// 歯車から開く調整の欄。動かした値は変数と URL の両方へ書く（同じ見え方を URL で渡せるようにする）。
function setUpLook() {
  const panel = one(".look-panel")
  const fields = Object.entries(LOOK).map(([name, look]) => ({ name, look, input: panel.elements[name] }))
  const show = () => {
    for (const { look, input } of fields) {
      const value = Number(input.value)
      document.body.style.setProperty(look.variable, look.toCss(value))
      input.nextElementSibling.textContent = `${value}${look.unit}`
    }
  }
  const remember = (keep) => {
    const next = new URLSearchParams(location.search)
    for (const { name, input } of fields) {
      if (keep) {
        next.set(name, input.value)
      } else {
        next.delete(name)
      }
    }
    history.replaceState(null, "", `?${next}`)
    linkBar()
  }
  for (const { name, look, input } of fields) {
    input.value = String(numberParam(name, look.fallback))
  }
  panel.addEventListener("input", () => {
    show()
    remember(true)
  })
  panel.addEventListener("reset", (event) => {
    event.preventDefault()
    for (const { look, input } of fields) {
      input.value = String(look.fallback)
    }
    show()
    remember(false)
  })
  show()
  gear.setAttribute("popovertarget", "look-panel")
}

// 上の切り替えの帯のリンク。いまの URL の値（パック・調整の値）を引き継ぎ、選んだ1つだけを替える。
function linkBar() {
  const current = { layout, scene }
  for (const choices of document.querySelectorAll(".mock-bar-group")) {
    const name = choices.dataset.param
    for (const link of choices.querySelectorAll("a")) {
      const next = new URLSearchParams(location.search)
      next.delete("open")
      next.set(name, link.dataset.value)
      link.href = `?${next}`
      if (link.dataset.value === current[name]) {
        link.setAttribute("aria-current", "true")
      }
    }
  }
}

// 前のやり取りを足して、列が上限の高さで止まり、中だけが送られる形にする。
function growTurns(count) {
  const list = one(".turns")
  const rows = EARLIER_TURNS.slice(0, Math.max(0, count - 3)).map(
    (title) =>
      `<li class="turn"><svg viewBox="0 0 24 24" class="icon"><use href="#i-check" /></svg><span>${title}</span></li>`,
  )
  list.insertAdjacentHTML("afterbegin", rows.join(""))
}

const ARRANGE = {
  a() {},
  // 部品の並びは a のまま。見た目と寸法は refine.css が替え、ここは調整の欄・長いやり取り・セッションの切り替えをつなぐ。
  a2() {
    setUpLook()
    growTurns(numberParam("turns", 12))
    if (params.get("items") === "none") {
      for (const seat of document.querySelectorAll(".seat")) {
        seat.remove()
      }
    }
    one(".session-tag").addEventListener("click", () => {
      one("#session-switcher").showModal()
    })
  },
  // 部屋の名前はレールに収まらないので、やり取りの列の頭へ移す。
  b() {
    lane.prepend(group("lane-room", one(".nav-room-name"), one(".nav-room-port")))
  },
  // 帯を下の3列と同じ幅に割り、進行の帯を中央の列の頭に入れる。
  c() {
    nav.replaceChildren(room, group("nav-center", modes, head), group("nav-end", links, gear))
  },
  // 入口の帯を無くし、部屋・モード・ほかの画面への入口を左の柱に収める。
  d() {
    lane.prepend(group("pillar-head", room, gear), modes)
    lane.append(links)
    nav.remove()
  },
  // 入口を四隅の部品に分け、進行は入力欄の頭に入れる。
  e() {
    one(".composer-body").prepend(head)
    usage.classList.add("hud")
    shell.append(
      group("col col-left", group("hud hud-room", room, modes), lane, actor),
      group("col col-right", group("hud hud-links", links, gear), side, usage),
    )
    nav.remove()
  },
  // 左を会話の列（投稿・セリフ・立ち絵・入力欄）、右を紙（進行の帯・計画・お伺い・レポート）に分ける。
  f() {
    gatherIntoBar()
    talk.insertBefore(actor, dock)
    const pane = group("pane", head, ...stream.querySelectorAll(":scope > .sheet, :scope > .worklog"))
    pane.dataset.region = "paper"
    shell.append(pane)
    one(".inquiry-foot span").textContent = "選択肢にない答えは、左の入力欄に書いて送れる"
  },
  g() {
    gatherIntoBar()
  },
  h() {},
}
ARRANGE[layout]()

// その候補で使わない部品を外す。
for (const part of document.querySelectorAll("[data-not]")) {
  if (marks(part, "not")) {
    part.remove()
  }
}

// 別のパックでも成り立つかを見るために、背景・立ち絵・差し色・名前を差し替える。
if (packId !== "tsukumo") {
  const root = document.documentElement
  root.style.setProperty("--accent", pack.accent)
  root.style.setProperty("--art", `url("../../../../characters/${packId}/background.png")`)
  for (const image of document.querySelectorAll('img[src*="/characters/tsukumo/"]')) {
    image.src = image.getAttribute("src").replace("/characters/tsukumo/", `/characters/${packId}/`)
  }
  for (const name of document.querySelectorAll("[data-pack-name]")) {
    name.textContent = pack.name
  }
}

linkBar()

const draft = one("#draft")
draft.placeholder = `${pack.name} への依頼を書く`
if (scene === "read") {
  draft.value = "2行目の文言は「ほかのタブを見ているとき」にそろえてほしい。ほかの画面と同じ言い方にしたい。"
}
if (scene === "work") {
  draft.placeholder = `${pack.name} への補足を書く`
}
if (scene === "ask") {
  draft.placeholder = "選択肢以外の答えを書く"
}

// 送り位置。1本の流れの候補は、読む場面だけ作業の経過の行を上端に置いてレポートを頭から読ませ、
// ほかの場面は新しい物を下端に出す。見開きは、会話の列をいつも下端に、紙を作業中だけ下端に送る。
const pane = one(".pane")
if (pane === null && scene === "read") {
  const fold = stream.querySelector(".worklog")
  stream.scrollTop = fold.offsetTop - stream.offsetTop - 11
} else {
  stream.scrollTop = stream.scrollHeight
}
if (pane !== null && (scene === "work" || scene === "ask")) {
  pane.scrollTop = pane.scrollHeight
}

// やり取りの列は、いまのやり取り（末尾）が見える位置へ送る。
const turnList = one(".turns")
if (turnList !== null) {
  turnList.scrollTop = turnList.scrollHeight
}

// 開いた状態で見る。一覧と調整の欄は、押した扱いで開く（showPopover で開くと、押した部品に結び付かず位置が決まらない）。
const OPEN = {
  tasks: () => one(".task-chip")?.click(),
  look: () => one('[popovertarget="look-panel"]')?.click(),
  sessions: () => one("#session-switcher")?.showModal(),
  peek: () => {
    document.body.dataset.open = "peek"
  },
}
const opened = params.get("open") ?? ""
if (Object.hasOwn(OPEN, opened)) {
  OPEN[opened]()
}

one(".composer").addEventListener("submit", (event) => {
  event.preventDefault()
})
