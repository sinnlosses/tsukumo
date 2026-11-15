// レポートと進行の出し方の見本の切り替え。URL の検索引数から案・場面・パックを読み、
// 中央の列の頭（進行の帯か計画の一覧）と会話の流れを案ごとに組む。器の配置と見た目は CSS が決める。
// 中身はすべて架空で、実物の会話ではない。

const PLANS = ["tail", "shelf", "base"]
const MOMENTS = ["work", "back", "read"]
const PACKS = {
  tsukumo: { name: "つくも", accent: "#6fe3cd" },
  shirasuzu: { name: "白鈴", accent: "#f9c3cd" },
}

const params = new URLSearchParams(location.search)

function pick(name, allowed) {
  const value = params.get(name)
  return allowed.includes(value) ? value : allowed[0]
}

const plan = pick("plan", PLANS)
const moment = pick("moment", MOMENTS)
const packId = pick("pack", Object.keys(PACKS))
const pack = PACKS[packId]
const opened = params.get("open") ?? ""

document.body.dataset.plan = plan
document.body.dataset.moment = moment
document.body.dataset.scene = moment === "read" ? "read" : "work"
if (params.get("bar") === "0") {
  document.body.dataset.bar = "0"
}

function one(selector) {
  return document.querySelector(selector)
}

// 4つのフェーズ。所要は 48秒＋2分10秒＋1分32秒＋2分10秒＝6分40秒。
// tools はそのフェーズの手順（道具の名前・対象・所要）で、合計は 3＋4＋3＋4＝14。
const PHASES = [
  {
    name: "今の形を調べる",
    time: "48秒",
    weight: 48,
    share: "12%",
    note: "設定の群は3つあり、知らせの値は端末ごとの好みに置ける。",
    tools: [
      ["Read", "setting-store.ts", "1秒"],
      ["Grep", "notice", "1秒"],
      ["Read", "setting-pane.tsx", "1秒"],
    ],
  },
  {
    name: "切り替えを画面に足す",
    time: "2分10秒",
    weight: 130,
    share: "33%",
    note: "知らせの群に切り替えを1つ足し、値を端末ごとの好みに保存した。",
    files: "3 ファイル",
    tools: [
      ["Edit", "setting-notice.tsx", "4秒"],
      ["Bash", "pnpm run test", "38秒"],
      ["Edit", "device-preference.ts", "3秒"],
      ["Bash", "pnpm run build", "21秒"],
    ],
  },
  {
    name: "画で確かめる",
    time: "1分32秒",
    weight: 92,
    share: "23%",
    note: "1400 と 390 の幅で撮り、群の見出しと切り替えが1行に収まるのを見た。",
    tools: [
      ["Bash", "capture-view.ts --scene setting --size 1400x900", "9秒"],
      ["Bash", "capture-view.ts --scene setting --size 390x844", "8秒"],
      ["Read", "setting-390.png", "1秒"],
    ],
  },
  {
    name: "文書と検証を揃える",
    time: "2分10秒",
    weight: 130,
    share: "33%",
    note: "設定の文書に1行足し、全部の検査を通した。",
    files: "1 ファイル",
    tools: [
      ["Edit", "docs/guide/setting.md", "3秒"],
      ["Bash", "pnpm run check --full", "1分52秒"],
      ["Bash", "pnpm run format", "6秒"],
      ["Bash", "git status --short", "1秒"],
    ],
  },
]

// 場面ごとの今の位置。current は今のフェーズの番号（0始まり。4 は全部済み）、
// ran は今のフェーズで始まった手順の数（最後の1つが走っている）。
const STATE = {
  work: {
    current: 1,
    ran: 2,
    elapsed: "1分08秒",
    steps: 5,
    phaseTime: "20秒〜",
    now: "<code>pnpm run test</code> を走らせている",
    nowTime: "12秒",
    made: "<code>setting-notice.tsx</code>",
    fresh: [],
  },
  back: {
    current: 3,
    ran: 2,
    elapsed: "6分10秒",
    steps: 12,
    phaseTime: "1分40秒〜",
    now: "全部の検査の終わりを待っている（<code>pnpm run check --full</code>）",
    nowTime: "1分40秒",
    made: "<code>docs/guide/setting.md</code>",
    fresh: [1, 2],
  },
  read: { current: 4, ran: 0, total: "6分40秒", steps: 14, fresh: [] },
}
const state = STATE[moment]

const SAY = {
  got: ["ほいきた、受け取ったぞ。ちょっと覗いてくる。", "14:25"],
  found: ["群は3つあったぞ。知らせの群に足すのがよさそうなのだ。", "14:25"],
  typed: ["型は通ったぞ。いまは単体テストを回してるところなのだ。", "14:26"],
  placed: ["切り替えが画面に入ったぞ。次は画を撮って確かめるのだ。", "14:27"],
  looked: ["画でも崩れてなかったぞ。あとは文書と検査なのだ。", "14:29"],
  done: ["検査まで全部通ったぞ、えへん！見てほしいのは表の2行目なのだ。", "14:31"],
}

const SEEN = "離れていた 4分のあいだに、フェーズが2つ済んだ"
const WORKLOG = "4フェーズ・6分40秒・セリフ 5件"

function icon(name, extra = "") {
  return `<svg viewBox="0 0 24 24" class="icon${extra}" aria-hidden="true"><use href="#i-${name}" /></svg>`
}

function say([text, time]) {
  return `<p class="say">${text}<time>${time}</time></p>`
}

const post = `<p class="post">設定に知らせの切り替えを足したい<time>14:25</time></p>`

// 済んだフェーズのカード（流れの中）。案2 は変えたファイルの数を名前の後ろに添える。
function doneCard(index, withFiles = false) {
  const phase = PHASES[index]
  const files = withFiles && phase.files ? `<span class="plan-files">${phase.files}</span>` : ""
  return `<section class="sheet step" aria-label="${index + 1}つ目のフェーズ">
    <ol class="plan"><li class="plan-step plan-done">
      <span class="plan-mark">${icon("check", " icon-sm")}</span>
      <span class="plan-name">${phase.name}${files}</span><span class="plan-time">${phase.time}</span>
      <p class="plan-summary">${phase.note}</p>
    </li></ol>
  </section>`
}

// 今のフェーズのカード（流れの途中に出る。案1 だけ）。
function currentCard(index) {
  return `<section class="sheet step" aria-label="${index + 1}つ目のフェーズ">
    <ol class="plan"><li class="plan-step plan-current">
      <span class="plan-mark">${index + 1}</span>
      <span class="plan-name">${PHASES[index].name}</span><span class="plan-time">${state.phaseTime}</span>
      <dl class="plan-now"><dt>いま</dt><dd>${state.now}</dd><dt class="plan-made">できた</dt><dd>${state.made}</dd></dl>
    </li></ol>
  </section>`
}

// 流れの末尾の「いま」の行（案2 だけ）。回る印はこの行の頭の1個だけ。
function nowLine() {
  return `<p class="now-line"><span class="now-spin" aria-hidden="true"></span><span class="now-label">いま</span><span class="now-text">${state.now}</span><time>${state.nowTime}</time></p>`
}

function seenLine() {
  return `<p class="seen-line"><span><b>ここから新しい</b>${SEEN}</span></p>`
}

// フェーズの中の手順の一覧。走っている手順は止まった点で示す（回る印は末尾の行が持つ）。
function toolRows(phase, count, running) {
  const rows = phase.tools.slice(0, count).map(([name, target, time], index) => {
    const run = running && index === count - 1
    const mark = run ? `<span class="tool-dot" role="img" aria-label="実行中"></span>` : icon("check")
    return `<li class="tool" data-state="${run ? "run" : "done"}">${mark}<span class="tool-name">${name}</span><code>${target}</code><time>${run ? `${state.nowTime}〜` : time}</time></li>`
  })
  return `<ol class="tools">${rows.join("")}</ol>`
}

// 計画の一覧の行。
// note: 済んだフェーズのまとめを出す（案3。案2 は流れのカードが持つ）。
// live: 今のフェーズの行に「いま」を出す（案3。案2 は流れの末尾の行が持つ）。
// tools: フェーズごとの手順を出す（案2 の「手順」を開いた形）。
function stepsRows({ note, live, tools }) {
  return PHASES.map((phase, index) => {
    const status = index < state.current ? "done" : index === state.current ? "now" : "next"
    const mark = status === "done" ? icon("check", " icon-sm") : String(index + 1)
    const time = status === "done" ? phase.time : status === "now" ? state.phaseTime : ""
    const fresh = state.fresh.includes(index)
      ? `<span class="fresh" role="img" aria-label="離れていたあいだに済んだ"></span>`
      : ""
    const parts = []
    if (status === "done" && note) {
      parts.push(`<p class="steps-note">${phase.note}</p>`)
    }
    if (status === "now" && live) {
      parts.push(
        `<p class="steps-now"><span class="steps-now-label">いま</span><span class="now-text">${state.now}</span><time>${state.nowTime}</time></p>`,
      )
    }
    if (tools && status === "done") {
      parts.push(
        `<details class="tools-fold"><summary>${icon("chevron", " icon-sm")}手順 ${phase.tools.length}</summary>${toolRows(phase, phase.tools.length, false)}</details>`,
      )
    }
    if (tools && status === "now") {
      parts.push(
        `<details class="tools-fold" open><summary>${icon("chevron", " icon-sm")}手順 ${state.ran}</summary>${toolRows(phase, state.ran, true)}</details>`,
      )
    }
    return `<li class="steps-row" data-state="${status}">
      <span class="steps-mark">${mark}</span><span class="steps-name">${phase.name}${fresh}</span><span class="steps-time">${time}</span>${parts.join("")}
    </li>`
  }).join("")
}

function band() {
  const longest = Math.max(...PHASES.map((phase) => phase.weight))
  const parts = PHASES.map(
    (phase) =>
      `<span style="flex: ${phase.weight}" title="${phase.name} ${phase.time}"${phase.weight === longest ? " data-longest" : ""}></span>`,
  )
  return `<div class="band" aria-hidden="true">${parts.join("")}</div>`
}

// 進行の帯の丸の並び。
function dots() {
  const where = state.current >= PHASES.length ? "4フェーズすべて済み" : `4フェーズのうち${state.current + 1}フェーズ目`
  const items = PHASES.map((_, index) => {
    const status = index < state.current ? " phase-done" : index === state.current ? " phase-current" : ""
    return `<span class="phase${status}">${index + 1}</span>`
  })
  return `<span class="phases" role="img" aria-label="${where}">${items.join("")}</span>`
}

function stateChip() {
  return moment === "read"
    ? `<span class="state state-ok"><span class="state-dot"></span>完了</span>`
    : `<span class="state state-run"><span class="state-dot"></span>作業中</span>`
}

// 帯の右端。toggle が真なら「手順」が一覧を開閉するボタンになる（案2）。
function headEnd({ usual, toggle, open, fold }) {
  const time =
    moment === "read"
      ? `<span class="elapsed">所要 <b>${state.total}</b></span>`
      : `<span class="elapsed">経過 <b>${state.elapsed}</b>${usual ? `<span class="usual">いつもは 6〜9分</span>` : ""}</span>`
  const expander = toggle ? ` data-toggle aria-expanded="${open}" aria-controls="shelf-body"` : ""
  return `<span class="paper-head-end">${time}
    <button class="chip-button" type="button"${expander}>手順 <b>${state.steps}</b>${icon("chevron", " icon-sm")}</button>${fold}
  </span>`
}

const phaseName = moment === "read" ? "4フェーズすべて済み" : PHASES[state.current].name
const whereLabel = moment === "read" ? "4フェーズすべて済み" : `4フェーズのうち${state.current + 1}フェーズ目`

// 進み具合の器（案2・案3）。畳むと丸の並びと今のフェーズの名前の1行、開くと「何フェーズ目か」と一覧。
function shelf({ open, body, end }) {
  return `<section class="shelf" data-open="${open}" aria-label="進み具合">
    <header class="shelf-head">
      ${stateChip()}${dots()}<span class="phase-name">${phaseName}</span><span class="shelf-where">${whereLabel}</span>${end}
    </header>
    <div class="shelf-body" id="shelf-body">${body}</div>
  </section>`
}

const timeTotal = `<p class="band-total"><b>計 ${STATE.read.total}</b><span>4 フェーズ</span></p>`

const HEAD = {
  // 案1: 見本 A2 の帯のまま。
  base: () => `<header class="paper-head">
    ${stateChip()}${dots()}<span class="phase-name">${phaseName}</span>
    ${headEnd({ usual: false, toggle: false, open: false, fold: "" })}
  </header>`,
  // 案2: 既定は1行。「手順」を押すと、計画の全体とフェーズごとの手順が下に開いたままになる。
  tail: () => {
    const open = opened === "steps"
    return shelf({
      open,
      body: `<ol class="steps">${stepsRows({ note: false, live: false, tools: true })}</ol>${moment === "read" ? `${timeTotal}${band()}` : ""}`,
      end: headEnd({ usual: true, toggle: true, open, fold: "" }),
    })
  },
  // 案3: 働くあいだは一覧を開いたまま、終わると1行に畳む。
  shelf: () => {
    const open = moment !== "read" || opened === "path"
    const fold = `<button class="shelf-fold" type="button" data-toggle aria-expanded="${open}" aria-controls="shelf-body" aria-label="計画の一覧を開閉する">${icon("chevron", " icon-sm")}</button>`
    return shelf({
      open,
      body: `<ol class="steps">${stepsRows({ note: true, live: true, tools: false })}</ol>${moment === "read" ? band() : ""}`,
      end: headEnd({ usual: true, toggle: false, open, fold }),
    })
  },
}

function worklog(label, meta) {
  return `<details class="worklog"><summary>${label}<span>${meta}</span></summary></details>`
}

const REPORT_BODY = `
  <p>設定の「知らせ」の群に切り替えを1つ足した。値は端末ごとの好みに保存し、読み直しても保たれる。背面のときだけ鳴らす既定は変えていない。</p>
  <h2>変えた所</h2>
  <div class="table-scroll">
    <table>
      <caption>表 1　変えた所と状態（架空）</caption>
      <thead><tr><th>場所</th><th>変更</th><th>状態</th></tr></thead>
      <tbody>
        <tr><td>設定の「知らせ」の群</td><td>切り替えを1つ足した</td><td><span class="tag tag-ok">済み</span></td></tr>
        <tr><td>切り替えの文言</td><td>「背面のときだけ鳴らす」</td><td><span class="tag tag-ask">確認待ち</span></td></tr>
        <tr><td>端末ごとの好み</td><td>保存の鍵を1つ足した</td><td><span class="tag tag-ok">済み</span></td></tr>
        <tr><td>キーの一覧</td><td>行を1つ足した</td><td><span class="tag tag-ok">済み</span></td></tr>
      </tbody>
    </table>
  </div>
  <h2>確かめてほしい所</h2>
  <p>切り替えの文言は、平易な語の一覧に「背面」が無いので仮の言い方にしてある。ほかの画面では「ほかのタブを見ているとき」と書いている。</p>`

const FAVOR = "切り替えの文言を、「背面のときだけ鳴らす」と「ほかのタブを見ているとき」のどちらにそろえるか決めてほしい。"
const CONCLUSION = "知らせの切り替えを設定に足し、端末ごとに保存されるようにした"
const CHANGE = `変更 4 ファイル <span class="change change-add">+86</span> <span class="change change-del">−12</span>`
const WIDEN = `<span class="widen">${icon("expand", " icon-sm")}広げる</span>`

// 今のレポートの頭（案1）。作業の名前と完了のバッジ・結論・確かめたこと・かかった時間の順で、お願いはレポートの末尾。
function reportNow() {
  const rows = PHASES.map(
    (phase, index) =>
      `<li><span class="band-no">${index + 1}/4</span><span>${phase.name}</span><span class="band-time">${phase.time}</span><span class="band-share">${phase.share}</span></li>`,
  )
  return `<article class="sheet paper attach" aria-label="レポート"><div class="report">
    <p class="task-line"><span class="task-tag">T-104</span><span class="task-name-strong">設定に知らせの切り替えを足す</span><span class="badge-done">${icon("check")}完了</span>${WIDEN}</p>
    <p class="meta-line"><span>最終レポート</span><span>${CHANGE}</span></p>
    <h1 class="tight">${CONCLUSION}</h1>
    <dl class="head-rows">
      <div class="head-row"><dt>確かめたこと</dt><dd>
        <ul class="checks-now">
          <li>${icon("check")}<span><code>pnpm run check</code>（単体 2,861 · E2E 98）</span></li>
          <li>${icon("check")}<span>1400×900 と 390×844 で設定の面を見る</span></li>
          <li data-state="open">${icon("question")}<span>ほかのタブを見ているときに鳴るか</span>
            <p>音は撮影では確かめられない</p>
            <p>確かめ方: 切り替えを入れ、別のタブを開いたまま依頼を1つ終わらせる</p></li>
        </ul>
        <span class="favor-jump">お願い 1 ${icon("down", " icon-sm")}</span>
      </dd></div>
      <div class="head-row"><dt>かかった時間</dt><dd>
        <p class="band-total"><b>計 6分40秒</b><span>4 フェーズ</span></p>
        ${band()}
        <ol class="band-list">${rows.join("")}</ol>
      </dd></div>
    </dl>
    ${REPORT_BODY}
    <p class="favor-end"><b>お願い</b>${FAVOR}</p>
  </div></article>`
}

// 提案のレポート（案2・案3）。頭は結論の直後に確かさだけを置き、利用者の用件「あなたの番」はいちばん下に置く。
function reportNew() {
  return `<article class="sheet paper attach" aria-label="レポート"><div class="report">
    <p class="task-line"><span class="task-tag">T-104</span><span>設定に知らせの切り替えを足す</span><span>${CHANGE}</span>${WIDEN}</p>
    <h1 class="tight">${CONCLUSION}</h1>
    <dl class="head-rows">
      <div class="head-row"><dt>確かさ</dt><dd>
        <ul class="ledger">
          <li class="ledger-row" data-state="open">${icon("question")}<span class="ledger-label">ほかのタブを見ているときに鳴るか</span><span class="seal seal-said">申告のみ</span>
            <p class="ledger-how">音は撮影では確かめられない。確かめ方: 切り替えを入れ、別のタブを開いたまま依頼を1つ終わらせる</p></li>
          <li class="ledger-row" data-state="ok">${icon("check")}<span class="ledger-label">確かめた 2件　<span class="ledger-rest"><code>pnpm run check</code>（単体 <b>2,861</b> · E2E <b>98</b>）・設定の面の画</span></span><span class="seal seal-kept">記録あり 1</span></li>
        </ul>
      </dd></div>
    </dl>
    ${REPORT_BODY}
    <section class="turn-end" id="turn-end" aria-labelledby="turn-title">
      <h2 class="turn-title" id="turn-title">あなたの番</h2>
      <p class="turn-text">${FAVOR}</p>
      <ul class="next-chips">
        <li><button class="next-chip" type="button">「ほかのタブを見ているとき」にそろえる</button></li>
        <li><button class="next-chip" type="button">このままにする</button></li>
      </ul>
      <p class="next-note">押すと入力欄に下書きが入る。送るのは自分で</p>
    </section>
  </div></article>`
}

const STREAM = {
  base: {
    work: () => [post, say(SAY.got), doneCard(0), say(SAY.found), currentCard(1), say(SAY.typed)],
    back: () => [
      post,
      say(SAY.got),
      doneCard(0),
      say(SAY.found),
      doneCard(1),
      say(SAY.typed),
      say(SAY.placed),
      doneCard(2),
      say(SAY.looked),
      currentCard(3),
    ],
    read: () => [worklog("作業の経過", WORKLOG), say(SAY.done), reportNow()],
  },
  tail: {
    work: () => [post, say(SAY.got), doneCard(0, true), say(SAY.found), say(SAY.typed), nowLine()],
    back: () => [
      post,
      say(SAY.got),
      doneCard(0, true),
      say(SAY.found),
      say(SAY.typed),
      seenLine(),
      doneCard(1, true),
      say(SAY.placed),
      doneCard(2, true),
      say(SAY.looked),
      nowLine(),
    ],
    read: () => [worklog("作業の経過", WORKLOG), say(SAY.done), reportNew()],
  },
  shelf: {
    work: () => [post, say(SAY.got), say(SAY.found), say(SAY.typed)],
    back: () => [post, say(SAY.got), say(SAY.found), say(SAY.typed), seenLine(), say(SAY.placed), say(SAY.looked)],
    read: () => [worklog("作業中のセリフ", "5件"), say(SAY.done), reportNew()],
  },
}

const stream = one("#stream")
stream.insertAdjacentHTML("beforebegin", HEAD[plan]())
stream.innerHTML = STREAM[plan][moment]().join("")

// やり取りの列の、今のやり取りの印と見出し。案3 はフェーズのカードが流れに無いので、働くあいだは見出しを持たない。
const turnMark = moment === "read" ? icon("check") : `<span class="turn-dot"></span>`
one("#turn-current").insertAdjacentHTML("afterbegin", turnMark)
const phaseHeads = PHASES.slice(0, state.current).map(
  (phase, index, all) =>
    `<li class="turn-head${index === all.length - 1 ? " turn-head-current" : ""}"><span class="turn-head-kind">レポート</span>${phase.name}</li>`,
)
const reportHeads = [
  `<li class="turn-head turn-head-current"><span class="turn-head-kind">最終</span>知らせの切り替えを設定に足した</li>`,
  `<li class="turn-head turn-head-sub">変えた所</li>`,
  `<li class="turn-head turn-head-sub">確かめてほしい所</li>`,
]
const heads = moment === "read" ? reportHeads : plan === "shelf" ? [] : phaseHeads
one("#turn-heads").innerHTML = heads.join("")

if (moment === "read") {
  const portrait = one("#portrait")
  portrait.src = portrait.getAttribute("src").replace("thinking.png", "proud.png")
  portrait.alt = "つくも（えへん）"
}

// 上の切り替えの帯のリンク。いまの URL の値を引き継ぎ、選んだ1つだけを替える。
const current = { plan, moment }
for (const choices of document.querySelectorAll(".mock-bar-group")) {
  const name = choices.dataset.param
  for (const link of choices.querySelectorAll("a")) {
    const next = new URLSearchParams(location.search)
    next.delete("open")
    next.delete("at")
    next.set(name, link.dataset.value)
    link.href = `?${next}`
    if (link.dataset.value === current[name]) {
      link.setAttribute("aria-current", "true")
    }
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
}

const draft = one("#draft")
draft.placeholder = moment === "read" ? `${pack.name} への依頼を書く` : `${pack.name} への補足を書く`

// 進み具合の器の開閉（案2 は「手順」、案3 は右端の矢印）。開いたままになり、外を押しても閉じない。
const shelfPart = one(".shelf")
const shelfToggle = one("[data-toggle]")
if (shelfPart !== null && shelfToggle !== null) {
  shelfToggle.addEventListener("click", () => {
    const next = shelfPart.dataset.open !== "true"
    shelfPart.dataset.open = String(next)
    shelfToggle.setAttribute("aria-expanded", String(next))
  })
}

// 用件のあるレポートを読むあいだ、入力欄の上に知らせの1行を出す（お伺いの「質問しています」と同じ位置）。
const turnEnd = one("#turn-end")
if (turnEnd !== null) {
  document.body.dataset.turn = "yours"
  one(".composer").insertAdjacentHTML(
    "afterbegin",
    `<p class="composer-status">${icon("down")}<span>あなたの番が1件あります</span><button class="status-jump" type="button">レポートの末尾へ</button></p>`,
  )
  one(".status-jump").addEventListener("click", () => {
    stream.scrollTo({ top: stream.scrollHeight, behavior: "smooth" })
  })
  // 用件そのものが見えているあいだは、知らせの1行を出さない（同じことを2か所で言わない）。
  const notice = one(".composer-status")
  new IntersectionObserver(
    ([entry]) => {
      notice.style.visibility = entry.isIntersecting ? "hidden" : "visible"
    },
    { root: stream, rootMargin: "0px 0px -176px 0px" },
  ).observe(one("#turn-title"))
}

// 送り位置。読む場面は作業の経過の行を上端に置いてレポートを頭から読ませ（?at=end で末尾）、ほかの場面は新しい物を下端に出す。
if (moment === "read" && params.get("at") !== "end") {
  const fold = stream.querySelector(".worklog")
  stream.scrollTop = fold.offsetTop - stream.offsetTop - 11
} else {
  stream.scrollTop = stream.scrollHeight
}

// やり取りの列は、いまのやり取り（末尾）が見える位置へ送る。
const turnList = one(".turns")
turnList.scrollTop = turnList.scrollHeight

one(".composer").addEventListener("submit", (event) => {
  event.preventDefault()
})
