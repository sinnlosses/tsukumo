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
const PHASES = [
  { name: "今の形を調べる", time: "48秒", weight: 48, share: "12%", note: "設定の群は3つあり、知らせの値は端末ごとの好みに置ける。" },
  {
    name: "切り替えを画面に足す",
    time: "2分10秒",
    weight: 130,
    share: "33%",
    note: "知らせの群に切り替えを1つ足し、値を端末ごとの好みに保存した。",
    files: "3 ファイル",
  },
  {
    name: "画で確かめる",
    time: "1分32秒",
    weight: 92,
    share: "23%",
    note: "1400 と 390 の幅で撮り、群の見出しと切り替えが1行に収まるのを見た。",
  },
  {
    name: "文書と検証を揃える",
    time: "2分10秒",
    weight: 130,
    share: "33%",
    note: "設定の文書に1行足し、全部の検査を通した。",
    files: "1 ファイル",
  },
]

// 場面ごとの今の位置。current は今のフェーズの番号（0始まり。4 は全部済み）。
const STATE = {
  work: {
    current: 1,
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
    elapsed: "6分10秒",
    steps: 12,
    phaseTime: "1分40秒〜",
    now: "全部の検査の終わりを待っている（<code>pnpm run check --full</code>）",
    nowTime: "1分40秒",
    made: "<code>docs/guide/setting.md</code>",
    fresh: [1, 2],
  },
  read: { current: 4, total: "6分40秒", steps: 14, fresh: [] },
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

// 済んだフェーズの札（流れの中）。案2 は変えたファイルの数を名前の後ろに添える。
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

// 今のフェーズの札（流れの途中に出る。案1 だけ）。
function currentCard(index) {
  return `<section class="sheet step" aria-label="${index + 1}つ目のフェーズ">
    <ol class="plan"><li class="plan-step plan-current">
      <span class="plan-mark">${index + 1}</span>
      <span class="plan-name">${PHASES[index].name}</span><span class="plan-time">${state.phaseTime}</span>
      <dl class="plan-now"><dt>いま</dt><dd>${state.now}</dd><dt class="plan-made">できた</dt><dd>${state.made}</dd></dl>
    </li></ol>
  </section>`
}

// 流れの末尾の「いま」の行（案2 だけ）。
function nowLine() {
  return `<p class="now-line"><span class="now-pulse" aria-hidden="true"></span><span class="now-label">いま</span><span class="now-text">${state.now}</span><time>${state.nowTime}</time></p>`
}

function seenLine() {
  return `<p class="seen-line"><span><b>ここから新しい</b>${SEEN}</span></p>`
}

// 計画の一覧の行。live が偽なら、今のフェーズの行に「いま」を出さない（案2 は末尾の行が持つ）。
function stepsRows({ live }) {
  return PHASES.map((phase, index) => {
    const status = index < state.current ? "done" : index === state.current ? "now" : "next"
    const mark = status === "done" ? icon("check", " icon-sm") : String(index + 1)
    const time = status === "done" ? phase.time : status === "now" ? state.phaseTime : ""
    const fresh = state.fresh.includes(index)
      ? `<span class="fresh" role="img" aria-label="離れていたあいだに済んだ"></span>`
      : ""
    const detail =
      status === "done"
        ? `<p class="steps-note">${phase.note}</p>`
        : status === "now" && live
          ? `<p class="steps-now"><span class="steps-now-label">いま</span><span class="now-text">${state.now}</span><time>${state.nowTime}</time></p>`
          : ""
    return `<li class="steps-row" data-state="${status}">
      <span class="steps-mark">${mark}</span><span class="steps-name">${phase.name}${fresh}</span><span class="steps-time">${time}</span>${detail}
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

// 進行の帯の丸の並び。button の中にも置けるように span で組む。
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

function headEnd({ usual, fold }) {
  const time =
    moment === "read"
      ? `<span class="elapsed">所要 <b>${state.total}</b></span>`
      : `<span class="elapsed">経過 <b>${state.elapsed}</b>${usual ? `<span class="usual">いつもは 6〜9分</span>` : ""}</span>`
  return `<span class="paper-head-end">${time}
    <button class="chip-button" type="button">手順 <b>${state.steps}</b>${icon("chevron", " icon-sm")}</button>${fold}
  </span>`
}

const phaseName = moment === "read" ? "4フェーズすべて済み" : PHASES[state.current].name

const HEAD = {
  // 案1: 見本 A2 の帯のまま。
  base: () => `<header class="paper-head">
    ${stateChip()}${dots()}<span class="phase-name">${phaseName}</span>
    ${headEnd({ usual: false, fold: "" })}
  </header>`,
  // 案2: 丸の並びと今のフェーズの名前が、計画の面を開く口になる。
  tail: () => `<header class="paper-head">
    ${stateChip()}
    <button class="plan-open" type="button" popovertarget="plan-pop" aria-label="計画を開く">
      ${dots()}<span class="phase-name">${phaseName}</span>${icon("chevron", " icon-sm")}
    </button>
    ${headEnd({ usual: true, fold: "" })}
  </header>
  <div class="plan-pop" id="plan-pop" popover="auto" aria-label="計画">
    <ol class="steps">${stepsRows({ live: false })}</ol>
    <p class="plan-pop-foot"><span>フェーズを押すと、流れのその行へ移る</span><span>手順 ${state.steps}</span></p>
  </div>`,
  // 案3: 働くあいだは一覧を開いたまま、終わると1行に畳む。
  shelf: () => {
    const open = moment !== "read" || opened === "path"
    const where =
      moment === "read"
        ? `${dots()}<span class="shelf-where">4フェーズすべて済み</span>`
        : `<span class="shelf-where">4フェーズのうち${state.current + 1}フェーズ目</span>`
    const fold = `<button class="shelf-fold" type="button" aria-expanded="${open}" aria-controls="shelf-body" aria-label="計画の一覧を開閉する">${icon("chevron", " icon-sm")}</button>`
    return `<section class="shelf" data-open="${open}" aria-label="計画">
      <header class="shelf-head">${stateChip()}${where}${headEnd({ usual: true, fold })}</header>
      <div class="shelf-body" id="shelf-body">
        <ol class="steps">${stepsRows({ live: true })}</ol>
        ${moment === "read" ? band() : ""}
      </div>
    </section>`
  },
}

function worklog(label, meta, body = "") {
  const open = opened === "path" && body !== "" ? " open" : ""
  return `<details class="worklog"${open}><summary>${label}<span>${meta}</span></summary>${body}</details>`
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

// 今のレポートの頭（案1）。作業の名前と完了の札・結論・確かめたこと・かかった時間の順で、お願いは紙の末尾。
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

// 提案のレポートの頭（案2・案3）。結論の直後に「あなたの番」、続けて確かさの台帳。
function reportNew() {
  return `<article class="sheet paper attach" aria-label="レポート"><div class="report">
    <p class="task-line"><span class="task-tag">T-104</span><span>設定に知らせの切り替えを足す</span><span>${CHANGE}</span>${WIDEN}</p>
    <h1 class="tight">${CONCLUSION}</h1>
    <dl class="head-rows">
      <div class="head-row head-row-turn"><dt>あなたの番</dt><dd>
        <p class="turn-text">${FAVOR}</p>
        <ul class="next-chips">
          <li><button class="next-chip" type="button">「ほかのタブを見ているとき」にそろえる</button></li>
          <li><button class="next-chip" type="button">このままにする</button></li>
        </ul>
        <p class="next-note">押すと入力欄に下書きが入る。送るのは自分で</p>
      </dd></div>
      <div class="head-row"><dt>確かさ</dt><dd>
        <ul class="ledger">
          <li class="ledger-row" data-state="open">${icon("question")}<span class="ledger-label">ほかのタブを見ているときに鳴るか</span><span class="seal seal-said">申告のみ</span>
            <p class="ledger-how">音は撮影では確かめられない。確かめ方: 切り替えを入れ、別のタブを開いたまま依頼を1つ終わらせる</p></li>
          <li class="ledger-row" data-state="ok">${icon("check")}<span class="ledger-label">確かめた 2件　<span class="ledger-rest"><code>pnpm run check</code>（単体 <b>2,861</b> · E2E <b>98</b>）・設定の面の画</span></span><span class="seal seal-kept">記録あり 1</span></li>
        </ul>
      </dd></div>
    </dl>
    ${REPORT_BODY}
  </div></article>`
}

const pathBody = `<div class="worklog-body"><ol class="steps">${moment === "read" ? stepsRows({ live: false }) : ""}</ol>${band()}</div>`

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
    read: () => [worklog("作業の経過", WORKLOG, pathBody), say(SAY.done), reportNew()],
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

// やり取りの列の、今のやり取りの印と見出し。案3 はフェーズの札が流れに無いので、働くあいだは見出しを持たない。
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

// 案2 の計画の面は、開く口のすぐ下に置く。
const planPop = one("#plan-pop")
if (planPop !== null) {
  planPop.addEventListener("beforetoggle", (event) => {
    if (event.newState !== "open") {
      return
    }
    const box = one(".plan-open").getBoundingClientRect()
    planPop.style.insetBlockStart = `${box.bottom + 10}px`
    planPop.style.insetInlineStart = `${box.left}px`
  })
  planPop.addEventListener("toggle", (event) => {
    one(".plan-open").setAttribute("aria-expanded", String(event.newState === "open"))
  })
}

// 案3 の計画の一覧の開閉。
const shelf = one(".shelf")
if (shelf !== null) {
  const fold = one(".shelf-fold")
  fold.addEventListener("click", () => {
    const next = shelf.dataset.open !== "true"
    shelf.dataset.open = String(next)
    fold.setAttribute("aria-expanded", String(next))
  })
}

// 送り位置。読む場面は作業の経過の行を上端に置いてレポートを頭から読ませ、ほかの場面は新しい物を下端に出す。
if (moment === "read") {
  const fold = stream.querySelector(".worklog")
  stream.scrollTop = fold.offsetTop - stream.offsetTop - 11
} else {
  stream.scrollTop = stream.scrollHeight
}

// やり取りの列は、いまのやり取り（末尾）が見える位置へ送る。
const turnList = one(".turns")
turnList.scrollTop = turnList.scrollHeight

if (opened === "plan") {
  one(".plan-open")?.click()
}

one(".composer").addEventListener("submit", (event) => {
  event.preventDefault()
})
