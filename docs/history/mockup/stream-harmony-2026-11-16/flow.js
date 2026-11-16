// 会話の流れの見本。URL の検索引数から形・場面・パックを読み、進行の帯・会話の流れ・入力欄の帯を組む。
// 今の形（form=now）の行の並びと見た目は、今の画面を疑似セッションで撮って測ったものに合わせてある。
// 見本どおりの形（form=spec）は、採用済みの見本（../report-progress-2026-11-15/ の案2）の形。
// 中身はすべて架空で、実物の会話ではない。

const PLUS = ["attach", "live", "dialog", "verb", "minute"]
const MOMENTS = ["work", "ask", "late", "read"]
const PACKS = {
  shirasuzu: { name: "白鈴", accent: "#f9c3cd" },
  tsukumo: { name: "つくも", accent: "#6fe3cd" },
}

const params = new URLSearchParams(location.search)

function pick(name, allowed) {
  const value = params.get(name)
  return allowed.includes(value) ? value : allowed[0]
}

const form = pick("form", ["now", "spec", "next"])
const only = params.get("only")
const moment = pick("moment", MOMENTS)
const packId = pick("pack", Object.keys(PACKS))
const pack = PACKS[packId]
const atEnd = params.get("at") === "end"

// 提案はどれも見本どおりの形の上に重ねる。
const flags = new Set(
  PLUS.includes(only)
    ? ["spec", only]
    : form === "next"
      ? ["spec", ...PLUS]
      : form === "spec"
        ? ["spec"]
        : [],
)
const has = (flag) => flags.has(flag)

document.body.dataset.p = [...flags].join(" ")
document.body.dataset.moment = moment
if (params.get("bar") === "0") {
  document.body.dataset.bar = "0"
}

function one(selector) {
  return document.querySelector(selector)
}

function icon(name, extra = "") {
  return `<svg viewBox="0 0 24 24" class="icon${extra}" aria-hidden="true"><use href="#i-${name}" /></svg>`
}

const REQUEST = "タスク一覧の並び替えを、開き直しても残るようにしたい"

// 4つのフェーズ。所要は 48秒＋2分10秒＋1分32秒＋2分10秒＝6分40秒。
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
  {
    name: "画面に反映する",
    time: "1分32秒",
    note: "一覧を開いたときに保存した並びを当て、並び替えのたびに保存するようにした。",
  },
  { name: "検証する", time: "2分10秒", note: "" },
]

const SAY = {
  got: ["並び替えの保存ですね。まず今の一覧の作りを見てきます。", "14:25"],
  found: ["並び順はどこにも残っていませんでした。保存の仕組みを足していきます。", "14:26"],
  ask: ["……ん、保存先が2通りあります。どちらにするか決めてください。", "14:27"],
  heard: ["端末ごとですね。その形で続けます。", "14:28"],
  saved: ["保存はできました。次は一覧の画面につなぎます。", "14:28"],
  wired: ["一覧につながりました。最後に全体の検証を通します。", "14:30"],
  done: ["ふふ、開き直しても並びが残るようになりました。", "14:32"],
}

const QUESTION = {
  label: "保存先",
  text: "並び順はどこに保存しますか？",
  why: "並び順をほかの端末にも引き継ぎたいかどうかが分からない。",
  facts: [
    "並び順はいま画面のメモリだけにあり、開き直すと既定に戻る。",
    "ほかの好みの設定は端末ごとに保存している。",
  ],
  reason: "ほかの好みの設定と同じ置き場にそろう。",
  options: [
    ["端末ごとに保存", "この端末のブラウザにだけ残す。ほかの端末には引き継がない。"],
    ["設定ファイルに保存", "プロジェクトの設定に書く。端末をまたいで同じ並びになる。"],
  ],
}

// 場面ごとの進行の帯。current は今のフェーズ（0始まり。4 は全部済み）。
const STRIP = {
  work: { state: "作業中", current: 1, time: ["経過", "1分08秒"], steps: 4 },
  ask: { state: "答え待ち", current: 1, asking: true, time: ["経過", "2分20秒"], steps: 5 },
  late: { state: "作業中", current: 3, time: ["経過", "5分12秒"], steps: 12 },
  read: { state: "完了", current: 4, time: ["所要", "6分40秒"], steps: 14 },
}

const NOW = {
  work: { tool: "Bash", detail: "pnpm run test sort-order", time: "12秒" },
  late: { tool: "Bash", detail: "pnpm run check", time: "40秒" },
}

// 道具の名前から、流れの末尾の札に出す動詞を引く（提案 D）。
const VERBS = {
  Read: "読んでいる",
  Grep: "探している",
  Edit: "書き換えている",
  Bash: "コマンドを走らせている",
}

// 立ち絵がいま従っているセリフ（その場面でいちばん新しいセリフ）。提案 B だけが使う。
const LIVE = { work: "found", ask: "ask", late: "wired", read: "done" }[moment]

// 時刻は、今の形では行ごとの札、見本どおりは吹き出しの中、提案 E では分が変わった行だけに出す。
let lastMinute = ""

function stampOf(time) {
  const changed = time !== lastMinute
  lastMinute = time
  return {
    chip: `<time class="stamp">${time}</time>`,
    inside: has("minute") && !changed ? "" : `<time class="bubble-time">${time}</time>`,
  }
}

function post(text, time, label) {
  const stamp = stampOf(time)
  const lead = label === undefined ? "" : `<span class="post-label">${label}</span>`
  const short = label === undefined ? "" : " is-short"
  return `<div class="row row-user"><div class="bubble bubble-post${short}">${lead}${text}${stamp.inside}</div>${stamp.chip}</div>`
}

function say(key) {
  const [text, time] = SAY[key]
  const stamp = stampOf(time)
  const live = has("live") && key === LIVE ? " is-live" : ""
  return `<div class="row row-say"><div class="bubble bubble-say${live}">${text}${stamp.inside}</div>${stamp.chip}</div>`
}

function doneDot() {
  return `<span class="phase-dot is-done">${icon("check")}</span>`
}

function phaseHead(index) {
  const phase = PHASES[index]
  return `<header class="slip-head">${doneDot()}<span>${index + 1}/${PHASES.length} ${phase.name}</span><time class="slip-time">${phase.time}</time></header>
    <p class="slip-note">${phase.note}</p>`
}

/** 今の形の中間レポートの札。追い越された札は1行に畳まれる。 */
function interim(index, open) {
  const phase = PHASES[index]
  const position = `${index + 1}/${PHASES.length} ${phase.name}`
  if (!open) {
    return `<div class="interim is-folded">${icon("chevron-right")}中間レポート: ${position} · 所要 ${phase.time}</div>`
  }
  return `<section class="interim">
    <header class="interim-head"><span>中間レポート</span><span>${position}</span><span>所要 ${phase.time}</span></header>
    <p>${phase.note}</p>
  </section>`
}

/** 見本どおりの、済んだフェーズの札。届いた位置に、流れの幅で出る。 */
function phaseCard(index) {
  return `<section class="thing phase-card">${phaseHead(index)}</section>`
}

/** 提案 A の、済んだフェーズの控え。フェーズを終えたセリフの下に添える。 */
function slip(index) {
  return `<section class="thing tuck">${phaseHead(index)}</section>`
}

function attach(row, thing) {
  return `<div class="attach">${row}${thing}</div>`
}

function nowLine() {
  const now = NOW[moment]
  if (now === undefined) {
    return ""
  }
  if (has("verb")) {
    return `<p class="now-pill scroll-target"><span class="spinner"></span><b>${VERBS[now.tool]}</b><code>${now.detail}</code><time>${now.time}</time></p>`
  }
  if (has("spec")) {
    return `<p class="now-pill scroll-target"><span class="spinner"></span><b class="now-lead">いま</b><code>${now.tool} ${now.detail}</code><time>${now.time}</time></p>`
  }
  return `<p class="now-band scroll-target"><span class="spinner"></span><span>いま</span><code>${now.tool}  ${now.detail} · ${now.time}</code></p>`
}

function inquiry() {
  const options = QUESTION.options
    .map(
      ([label, note], index) => `<li class="option">
        <div class="option-head"><span class="option-key">${index + 1}</span><span class="radio"></span>${label}${index === 0 ? '<span class="tag-recommend">おすすめ</span>' : ""}</div>
        <p class="option-note">${note}</p>
      </li>`,
    )
    .join("")
  const facts = QUESTION.facts
    .map(
      (fact) =>
        `<div class="brief-fact"><span><span class="chip chip-ok">確かめた</span></span><span>${fact}</span></div>`,
    )
    .join("")
  // 提案 C では、書いて答えられることの案内を入力欄の上の1行だけにする。
  const footNote = has("dialog")
    ? ""
    : '<span class="inquiry-foot-note">選択肢にない答えは、下の入力欄に書いて送れます</span>'
  const shape = has("attach") ? " thing hang" : ""
  return `<section class="inquiry${shape} scroll-target">
    <header class="inquiry-head">
      <span class="tag-ask">お伺い</span><span class="inquiry-kind">質問</span><span class="inquiry-label">${QUESTION.label}</span>
      <span class="inquiry-wait">1 / 1 · 待って 0:42</span><button class="pill-button" type="button">広げる</button>
    </header>
    <h3 class="inquiry-title">${QUESTION.text}</h3>
    <dl class="brief">
      <div class="brief-line"><dt>聞く理由</dt><dd>${QUESTION.why}</dd></div>
      <dt>事実</dt>
      <dd>${facts}</dd>
      <div class="brief-line"><dt>おすすめの理由</dt><dd><span class="chip chip-plain">確度 中</span> ${QUESTION.reason}</dd></div>
    </dl>
    <ol class="options">${options}</ol>
    <footer class="inquiry-foot">${footNote}<span class="inquiry-foot-gap"></span><button class="pill-button" type="button">任せる</button><button class="answer-button" type="button">これで答える ${icon("enter", " icon-sm")}</button></footer>
  </section>`
}

/** 今の形の、答え終わった質問の記録。 */
function questionRecord() {
  const [chosen, other] = QUESTION.options
  return `<section class="q-record">
    <p class="q-record-title">${QUESTION.label}: ${QUESTION.text}</p>
    <p class="q-choice is-chosen">${chosen[0]} (推奨)</p>
    <p class="q-choice">${other[0]}</p>
    <p class="q-detail">${icon("chevron-right")}質問のときの詳細</p>
  </section>`
}

/** 提案 C の、答え終わった質問。質問は聞いたセリフに添える1行にし、答えは利用者の投稿にする。 */
function questionSlip() {
  return `<section class="thing tuck">
    <header class="slip-head"><span class="slip-mark">${icon("question")}</span><span>${QUESTION.label}: ${QUESTION.text}</span><a class="slip-more">聞いたときの詳細</a></header>
  </section>`
}

function reportBody() {
  return `<p class="conclusion">タスク一覧の並び替えが、開き直しても残るようになった。</p>
    <div class="checks">
      <div class="checks-line"><span class="chip chip-ok">${icon("check")}1件 通った</span><span class="chip chip-warn">? 1件 確かめていない</span><span class="checks-figure">単体 3152・E2E 71</span></div>
      <div class="checks-line checks-row"><span><span class="chip chip-warn">? 確かめていない</span></span><div><b>実ブラウザでの開き直し</b><span>申告のみ</span><small>疑似セッションでは開き直しを確かめていない</small></div></div>
      <div class="checks-line checks-row"><span><span class="chip chip-ok">${icon("check")}通った 1件</span></span><div><span>pnpm run check　記録あり 1</span></div></div>
    </div>
    <h2>並び順は端末ごとに保存する</h2>
    <div class="report-split">
      <p>並び替えるたびに端末ごとの好みへ保存し、一覧を開いたときに読み戻す。保存した値が壊れていたら既定の並びで開く。</p>
      <p class="margin-hint">字・行・案を選ぶと、ここに「聞く・頼む」が1つ出る</p>
    </div>
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
    <p>保存先は端末ごとなので、別の端末では既定の並びから始まる。</p>
    <div class="favor${atEnd ? " scroll-target" : ""}">
      <p class="favor-label">お願い</p>
      <p>一覧を開いて並び替え、開き直して並びが残るかを見てください。</p>
    </div>`
}

const EXPAND = `<button class="expand-button" type="button">${icon("expand")}広げる</button>`

/** 今の形の最終レポート。面を持たず、背景の上に直に載る。 */
function finalReport() {
  return `<section class="report">
    <p class="report-label"><span>最終レポート</span>${EXPAND}</p>
    ${reportBody()}
  </section>`
}

/** 見本どおりの紙。提案 A では締めのセリフの真下に掛ける。 */
function paper() {
  const shape = has("attach") ? " hang" : ""
  return `<section class="thing paper${shape}">
    <span class="paper-tools">${EXPAND}</span>
    <div class="report">${reportBody()}</div>
  </section>`
}

function fold(summary, body) {
  return `<details class="fold"><summary>${summary}</summary><div class="fold-body">${body}</div></details>`
}

/** 質問と答えのやり取り。答える前（ask の場面）は札、答えたあとは記録。 */
function exchange() {
  const asking = say("ask")
  if (moment === "ask") {
    return has("attach") ? [attach(asking, inquiry())] : [asking, inquiry()]
  }
  if (has("dialog")) {
    return [attach(asking, questionSlip()), post(QUESTION.options[0][0], "14:28", "答え")]
  }
  return [asking, questionRecord()]
}

/** フェーズを終えたときの札とセリフ。今の形の札は、別の位置（1つ前の work_plan の位置）に出る。 */
function phaseDone(key, phaseIndex) {
  if (has("attach")) {
    return [attach(say(key), slip(phaseIndex))]
  }
  if (has("spec")) {
    return [phaseCard(phaseIndex), say(key)]
  }
  return [say(key)]
}

/** 作業の経過（依頼のあとから最終レポートの手前まで）。through は、0 働く・1 質問まで・2 検証の手前まで。 */
function journey(through) {
  const early = !has("spec")
  const rows = [say("got")]
  if (early) {
    rows.push(interim(0, through < 2))
    if (through >= 2) {
      rows.push(interim(1, false))
    }
  }
  rows.push(...phaseDone("found", 0))
  if (through >= 1) {
    rows.push(...exchange())
  }
  if (through >= 2) {
    rows.push(say("heard"))
    if (early) {
      rows.push(interim(2, true))
    }
    rows.push(...phaseDone("saved", 1), ...phaseDone("wired", 2))
  }
  return rows
}

function buildFlow() {
  const rows = [post(REQUEST, "14:25")]
  if (moment === "work") {
    rows.push(...journey(0), nowLine())
  } else if (moment === "ask") {
    rows.push(...journey(1))
  } else if (moment === "late") {
    rows.push(...journey(2), nowLine())
  } else if (has("spec")) {
    const all = journey(2).join("")
    const closing = say("done")
    rows.push(
      fold("作業の経過　4フェーズ・6分40秒・セリフ 6件・質問 1件", all),
      ...(has("attach") ? [attach(closing, paper())] : [closing, paper()]),
    )
  } else {
    const speeches = ["got", "found", "ask", "heard", "saved", "wired"].map((key) => say(key))
    const kept = [interim(0, false), interim(1, false), interim(2, false), questionRecord()].join("")
    rows.push(
      ...speeches,
      fold(
        "作業の経過 3 件 · 質問 1 件 · 所要 6分40秒（1/4 今の一覧を調べる 48秒 · 2/4 保存の仕組みを足す 2分10秒 · 3/4 画面に反映する 1分32秒）",
        kept,
      ),
      finalReport(),
      say("done"),
    )
  }
  one("#flow").innerHTML = rows.join("")
}

function buildStrip() {
  const strip = STRIP[moment]
  const dots = PHASES.map((_, index) => {
    if (index < strip.current) {
      return doneDot()
    }
    if (index === strip.current) {
      return strip.asking === true
        ? '<span class="phase-dot is-asking">?</span>'
        : `<span class="phase-dot is-current">${index + 1}</span>`
    }
    return `<span class="phase-dot">${index + 1}</span>`
  })
  const links = dots
    .map((dot, index) =>
      index === 0
        ? dot
        : `<i class="phase-link${index <= strip.current ? " is-done" : ""}"></i>${dot}`,
    )
    .join("")
  const name =
    strip.current >= PHASES.length
      ? `<span class="strip-name is-plain">${PHASES.length}フェーズすべて済み</span>`
      : `<span class="strip-name">${PHASES[strip.current].name}</span>`
  const state = { 作業中: "var(--accent)", 答え待ち: "var(--warn)", 完了: "var(--ok)" }[strip.state]
  one("#strip").innerHTML = `
    <span class="strip-state" style="--state: ${state}">${strip.state}</span>
    <span class="strip-phases">${links}</span>
    ${name}
    <span class="strip-time">${strip.time[0]}<b>${strip.time[1]}</b></span>
    <button class="strip-steps" type="button">手順 ${strip.steps}${icon("chevron", " icon-sm")}</button>`
}

function buildLane() {
  const sub = {
    work: ['<p class="lane-sub is-current"><span>レポート</span><b>1/4 今の一覧を…</b></p>'],
    ask: ['<p class="lane-sub is-current"><span>レポート</span><b>1/4 今の一覧を…</b></p>'],
    late: ['<p class="lane-sub is-current"><span>レポート</span><b>3/4 画面に反映…</b></p>'],
    read: [
      '<p class="lane-sub is-current"><span>最終</span><b>タスク一覧の並び…</b></p>',
      '<p class="lane-sub"><span>並び順は端末ごとに保存…</span></p>',
      '<p class="lane-sub"><span>ほかの端末には引き継…</span></p>',
    ],
  }[moment]
  one("#lane-turns").innerHTML =
    `<li class="lane-turn"><p class="lane-title">タスク一覧の並び替えを…</p>${sub.join("")}</li>`
}

function buildDock() {
  const band = one("#band")
  const draft = one("#draft")
  const send = one("#send")
  const root = document.documentElement
  draft.placeholder = `${pack.name} への依頼を書く`
  if (moment === "work" || moment === "late") {
    send.classList.add("is-stop")
    send.setAttribute("aria-label", "止める")
  }
  if (moment === "ask") {
    draft.placeholder = "選択肢以外の答えを書く…"
    band.hidden = false
    band.innerHTML = has("spec")
      ? `<span>${pack.name} が質問しています。選択肢から選ぶか、ここに書いて答えられます</span>`
      : `<span>↓ ${pack.name} が質問しています。下の選択肢から選ぶか、ここに書いて答えてください</span><button class="pill-button" type="button">お伺いへ</button>`
    root.style.setProperty("--dock-h", has("spec") ? "148px" : "165px")
  }
  if (moment === "read" && !atEnd) {
    band.hidden = false
    band.innerHTML =
      '<span>お願いが1件あります</span><button class="pill-button" type="button">レポートの末尾へ</button>'
    root.style.setProperty("--dock-h", "148px")
  }
}

function applyPack() {
  const root = document.documentElement
  root.style.setProperty("--accent", pack.accent)
  root.style.setProperty("--art", `url("../../../../characters/${packId}/background.png")`)
  for (const image of document.querySelectorAll("[data-pack-src]")) {
    image.src = `../../../../characters/${packId}/${image.dataset.packSrc}`
  }
  const expression = { work: "default", ask: "curious", late: "default", read: "proud" }[moment]
  one("#portrait").src = `../../../../characters/${packId}/${expression}.png`
}

function markBar() {
  for (const group of document.querySelectorAll(".mock-bar-group")) {
    const name = group.dataset.param
    for (const link of group.querySelectorAll("a")) {
      const next = new URLSearchParams(location.search)
      next.set(name, link.dataset.value)
      if (name === "form") {
        next.delete("only")
      }
      link.href = `?${next.toString()}`
      const current =
        name === "only"
          ? only === link.dataset.value
          : name === "form"
            ? !PLUS.includes(only) && form === link.dataset.value
            : moment === link.dataset.value
      if (current) {
        link.setAttribute("aria-current", "true")
      }
    }
  }
}

applyPack()
buildStrip()
buildLane()
buildFlow()
buildDock()
markBar()

// 流れの出だしの位置。働く・答えるは末尾、読むは頭（at=end なら末尾のお願い）。
// scroll-initial-target が無いブラウザでは、同じ位置へ手で送る。
if (!CSS.supports("scroll-initial-target", "nearest")) {
  const target = document.querySelector(".scroll-target")
  if (target !== null) {
    target.scrollIntoView({ block: "end" })
  }
}
