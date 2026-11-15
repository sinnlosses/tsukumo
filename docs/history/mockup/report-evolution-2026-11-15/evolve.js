// 最終レポートの3段の進化と3つの形の見本。URL の検索引数から形・段・題材を読み、紙の中身を組む。
// 器と進行の帯と用件の置き場は ../report-progress-2026-11-15 の案2 のままで、替えるのは紙の中だけ。
// 中身はすべて架空で、実物の会話ではない。

const FORMS = ["pair", "board", "ledger"]
const LEVELS = ["3", "2", "1"]
const GENRES = ["work", "decide"]
const PACKS = {
  tsukumo: { name: "つくも", accent: "#6fe3cd" },
  shirasuzu: { name: "白鈴", accent: "#f9c3cd" },
}

const params = new URLSearchParams(location.search)

function pick(name, allowed) {
  const value = params.get(name)
  return allowed.includes(value) ? value : allowed[0]
}

const form = pick("form", FORMS)
const lv = Number(pick("lv", LEVELS))
const genre = pick("genre", GENRES)
const packId = pick("pack", Object.keys(PACKS))
const pack = PACKS[packId]
const openAll = params.get("open") === "all"

document.body.dataset.form = form
document.body.dataset.lv = String(lv)
document.body.dataset.genre = genre
if (params.get("bar") === "0") {
  document.body.dataset.bar = "0"
}

function one(selector) {
  return document.querySelector(selector)
}

function all(selector) {
  return [...document.querySelectorAll(selector)]
}

function icon(name, extra = "") {
  return `<svg viewBox="0 0 24 24" class="icon${extra}" aria-hidden="true"><use href="#i-${name}" /></svg>`
}

// 段の出し分け。min は「この段から出す」、max は「この段まで出す」。
function from(level) {
  return ` data-lv-min="${level}"`
}

function upto(level) {
  return ` data-lv-max="${level}"`
}

// 裏づけの印。色だけで言わず、記号と語を必ず添える。
const SEALS = {
  fail: { mark: "cross", word: "落ちた" },
  kept: { mark: "check", word: "記録あり" },
  said: { mark: "question", word: "申告のみ" },
  none: { mark: "minus", word: "やっていない" },
}

function seal(kind) {
  return `<span class="proof-seal" data-seal="${kind}"${from(2)}>${icon(SEALS[kind].mark)}${SEALS[kind].word}</span>`
}

// 裏づけの控えの1行（走らせたもの・数・時刻）。段3 では出力を覗ける。
function receipt({ command, figure, time, peek }) {
  const look = peek
    ? `<button class="peek-button" type="button" popovertarget="${peek.id}"${from(3)}>${peek.label}</button>
       <div class="peek-card" id="${peek.id}" popover${from(3)}>${peek.body}</div>`
    : ""
  return `<p class="receipt"${from(2)}>${icon("receipt")}<code>${command}</code><span>${figure}</span><time>${time}</time>${look}</p>`
}

// 裏づけの帯。主張の数だけ目盛りを並べ、確かめていないものを先頭に置く。
function tracker(seals, label) {
  const ticks = seals.map((kind) => `<i data-seal="${kind}"></i>`).join("")
  return `<span class="tracker" role="img" aria-label="${label}">${ticks}</span>`
}

// 落ちた主張があるときだけ「落ちた」の数を先頭に出す。
function countLine(seals) {
  const count = (kind) => seals.filter((value) => value === kind).length
  const kinds = Object.keys(SEALS).filter((kind) => kind !== "fail" || count("fail") > 0)
  const label = `主張 ${seals.length} 件のうち、${kinds.map((kind) => `${SEALS[kind].word} ${count(kind)}`).join("、")}`
  const counts = kinds.map(
    (kind) => `<span class="count" data-seal="${kind}">${icon(SEALS[kind].mark)}${SEALS[kind].word} <b>${count(kind)}</b></span>`,
  )
  return `<p class="proof-count"${from(2)}>${tracker(seals, label)}
    <span>主張 <b>${seals.length}</b> 件</span>
    ${counts.join("")}
  </p>`
}

function switcher(name, label, options) {
  const buttons = options
    .map(([value, text], index) => `<button type="button" data-value="${value}" aria-pressed="${index === 0}">${text}</button>`)
    .join("")
  return `<div class="switch" role="group" aria-label="${label}" data-switch="${name}"${from(3)}>${buttons}</div>`
}

// ---------- 題材1: 作業の報告（設定に知らせの切り替えを足す） ----------

const WORDING = {
  now: "背面のときだけ鳴らす",
  other: "ほかのタブを見ているときだけ鳴らす",
}

// 設定の面の画（見本の中で描いた絵。実物では撮った画像が入る）。
// 小さく出すときは字を線に置き換える（字の下限を割る大きさでは字を出さない）。
function shot({ after, compact = false }) {
  const word = (text, klass = "") =>
    compact
      ? `<span class="greek${klass === "" ? "" : ` ${klass}`}" style="--w: ${text.length}"></span>`
      : `<span${klass === "" ? "" : ` class="${klass}"`}>${text}</span>`
  const fresh = after ? `<div class="shot-row shot-new">${word(WORDING.now, "shot-label")}<span class="shot-toggle"></span></div>` : ""
  return `<div class="shot${compact ? " shot-compact" : ""}" role="img" aria-label="設定の「知らせ」の面（${after ? "後" : "前"}）">
    <div class="shot-bar"><span></span><span></span><span></span>${compact ? "" : "<b>設定</b>"}</div>
    <div class="shot-body">
      <div class="shot-nav">${word("見た目")}${word("知らせ", "shot-on")}${word("キー")}</div>
      <div class="shot-pane">
        ${word("知らせ", "shot-group")}
        <div class="shot-row">${word("通知を出す")}${compact ? `<span class="greek" style="--w: 4"></span>` : `<span class="shot-select">判断が要るとき</span>`}</div>
        <div class="shot-row">${word("鈴を鳴らす")}<span class="shot-toggle shot-toggle-on"></span></div>
        ${fresh}
        ${word("出来事", "shot-group")}
        <div class="shot-row">${word("済んだ")}<span class="shot-toggle shot-toggle-on"></span></div>
        <div class="shot-row">${word("止まった")}<span class="shot-toggle shot-toggle-on"></span></div>
      </div>
    </div>
  </div>`
}

function screenPair({ compact = false } = {}) {
  return `<div class="pair${compact ? " pair-compact" : ""}" data-view="side">
    <figure class="pair-side" data-side="before"><figcaption>前</figcaption>${shot({ after: false, compact })}</figure>
    <figure class="pair-side" data-side="after"><figcaption>後</figcaption>${shot({ after: true, compact })}</figure>
  </div>`
}

const SCREEN_NOTE = "増えたのは囲んだ1行だけで、ほかの行の位置と文言は動いていない。390×844 の幅でも1行に収まる。"

const SCREEN_RECEIPT = {
  command: "capture-view.ts",
  figure: "1400×900 と 390×844 の2枚",
  time: "14:29",
}

// 値の通り道。今回足した所だけを強調の色で塗る。
function saveFlow({ compact = false } = {}) {
  return `<ol class="flowline${compact ? " flowline-compact" : ""}" aria-label="切り替えの値の通り道">
    <li class="flow-node flow-new"><b>切り替え</b><span>設定の「知らせ」</span></li>
    <li class="flow-step"><span>入れる</span>${icon("right")}</li>
    <li class="flow-node flow-new"><b>端末ごとの好み</b><code>notice.backgroundOnly</code></li>
    <li class="flow-step"><span>読む</span>${icon("right")}</li>
    <li class="flow-node"><b>鳴らすかの判定</b><span>ほかのタブを見ているか</span></li>
    <li class="flow-step"><span>鳴らす</span>${icon("right")}</li>
    <li class="flow-node"><b>鈴</b></li>
  </ol>
  <p class="fig-key"><span class="key key-new"></span>今回足した所<span class="key"></span>前からある所</p>`
}

const SAVE_NOTE = "読み直したあとも値が残ることは、端末ごとの好みの単体テスト3件で見ている。"

const SAVE_RECEIPT = {
  command: "pnpm run test device-preference",
  figure: "3 件が通った",
  time: "14:27",
}

// 数の前後。差が小さいので棒にせず、増えた分だけを粒で数える。
function testDelta() {
  const dots = Array.from({ length: 8 }, () => "<i></i>").join("")
  return `<dl class="delta">
    <div class="delta-row">
      <dt>単体テスト</dt>
      <dd><span class="num-was">2,853</span>${icon("right", " icon-sm")}<b class="num-now">2,861</b>
        <span class="delta-dots" role="img" aria-label="8 件増えた">${dots}</span><span class="delta-diff">+8</span></dd>
    </div>
    <div class="delta-row">
      <dt>E2E</dt>
      <dd><span class="num-was">98</span>${icon("right", " icon-sm")}<b class="num-now">98</b><span class="delta-diff delta-flat">増減なし</span></dd>
    </div>
  </dl>`
}

const CHECK_OUTPUT = `<pre class="output"><span class="out-dim">$ pnpm run check</span>
<span class="out-ok">✓</span> 型検査
<span class="out-ok">✓</span> lint
<span class="out-ok">✓</span> 単体 2,861 件<span class="out-mark">（+8）</span>
<span class="out-ok">✓</span> E2E 98 件
<span class="out-dim">所要 1分52秒 ・ 終了コード 0 ・ a41c9e2</span></pre>`

const CHECK_RECEIPT = {
  command: "pnpm run check",
  figure: "単体 2,861・E2E 98・1分52秒",
  time: "14:31",
  peek: { id: "peek-check", label: "出力を見る", body: CHECK_OUTPUT },
}

const FILES = [
  ["src/browser/features/setting/", "setting-notice.tsx", 52, 4],
  ["src/browser/utils/", "device-preference.ts", 18, 6],
  ["docs/guide/", "setting.md", 10, 2],
  ["src/browser/features/setting/", "shortcut-list.ts", 6, 0],
]

// 変えたファイル。足した行は強調の色、消した行は灰にして、通った・落ちたの色と分ける。
function fileBars({ compact = false } = {}) {
  const rows = FILES.map(([dir, name, add, del]) => {
    const path = compact ? `<code>${name}</code>` : `<code><span class="path-dir">${dir}</span>${name}</code>`
    return `<li>${path}<span class="file-bar" aria-hidden="true"><i class="bar-add" style="--n: ${add}"></i><i class="bar-del" style="--n: ${del}"></i></span><span class="file-num">+${add} −${del}</span></li>`
  })
  return `<ul class="files${compact ? " files-compact" : ""}">${rows.join("")}</ul>`
}

const KEPT = ["既定は「鳴らす」のまま（切り替えは切で始まる）", "通知の許しの聞き方", "E2E の 98 件"]

function keptList() {
  return `<ul class="kept-list">${KEPT.map((text) => `<li>${icon("minus")}${text}</li>`).join("")}</ul>`
}

const KEPT_RECEIPT = {
  command: "git diff --stat",
  figure: "許しと既定のファイルに差分なし",
  time: "14:31",
}

const UNDONE = ["Safari と Firefox での表示", "通知の許しを初めて聞くときのダイアログ"]

function undoneList() {
  return `<ul class="undone-list">${UNDONE.map((text) => `<li>${icon("minus")}${text}</li>`).join("")}</ul>`
}

const RING_CLAIM = "切り替えを入れると、ほかのタブを見ているときだけ鳴る"
const RING_WHY = "音は撮影では確かめられないので、動かして聞いてはいない。"

function ringSteps() {
  return `<ol class="steps-how">
    <li>設定の「知らせ」で切り替えを入れる</li>
    <li>別のタブを開いたまま、依頼を1つ終わらせる</li>
    <li>鈴が鳴り、このタブを見ているときは鳴らないことを聞く</li>
  </ol>`
}

function ringAnswer() {
  return `<div class="answer"${from(3)}>
    <button class="answer-button" type="button" data-draft="ほかのタブを見ているときだけ鳴るのを確かめた。">${icon("check")}鳴った</button>
    <button class="answer-button" type="button" data-draft="切り替えを入れても、ほかのタブで鳴らなかった。原因を調べてほしい。">${icon("cross")}鳴らなかった</button>
  </div>`
}

const WORK_SEALS = ["said", "kept", "kept", "kept", "kept", "none"]

function workHead() {
  return `<p class="task-line"><span class="task-tag">T-104</span><span>設定に知らせの切り替えを足す</span>
      <span>変更 4 ファイル <span class="change change-add">+86</span> <span class="change change-del">−12</span></span>
      <span class="widen">${icon("expand", " icon-sm")}広げる</span></p>
    <h1 class="tight">知らせの切り替えを設定に足し、端末ごとに保存されるようにした</h1>`
}

// 段1 の検証の結果（案2 の冒頭のまま。段2 からは主張ごとの印に置き換わる）。
function sureHead() {
  return `<dl class="head-rows"${upto(1)}>
    <div class="head-row"><dt>確かめたこと</dt><dd>
      <ul class="ledger">
        <li class="ledger-row" data-state="open">${icon("question")}<span class="ledger-label">ほかのタブを見ているときに鳴るか</span><span class="seal seal-said">申告のみ</span>
          <p class="ledger-how">音は撮影では確かめられない。確かめ方: 切り替えを入れ、別のタブを開いたまま依頼を1つ終わらせる</p></li>
        <li class="ledger-row" data-state="ok">${icon("check")}<span class="ledger-label">確かめた 2件　<span class="ledger-rest"><code>pnpm run check</code>（単体 <b>2,861</b> · E2E <b>98</b>）・設定の面の画</span></span><span class="seal seal-kept">記録あり 1</span></li>
      </ul>
    </dd></div>
  </dl>`
}

// お願い。置き場は案2 と同じいちばん下。段3 では、選ぶ前に結果を画で見せ、押すと下書きが入る。
function workTurn() {
  const choice = (key, primary) => `<button class="choice${primary ? " choice-main" : ""}" type="button" data-wording="${key}"
      data-draft="切り替えの文言は「${WORDING[key]}」にそろえて。" aria-pressed="false">
      <span class="choice-preview" aria-hidden="true"><span class="shot-label">${WORDING[key]}</span><span class="shot-toggle"></span></span>
      <span class="choice-name">${key === "now" ? "このままにする" : "ほかの画面にそろえる"}</span>
    </button>`
  return `<section class="turn-end" id="turn-end" aria-labelledby="turn-title">
    <h2 class="turn-title" id="turn-title">お願い</h2>
    <ol class="asks">
      <li class="ask">
        <p class="turn-text">切り替えの文言を、どちらにそろえるか決めてほしい。ほかの画面では「ほかのタブを見ているとき」と書いている。</p>
        <div class="choices"${from(3)}>${choice("other", true)}${choice("now", false)}</div>
        <ul class="next-chips"${upto(2)}>
          <li><button class="next-chip" type="button" data-draft="切り替えの文言は「${WORDING.other}」にそろえて。">「ほかのタブを見ているとき」にそろえる</button></li>
          <li><button class="next-chip" type="button" data-draft="切り替えの文言はこのままでよい。">このままにする</button></li>
        </ul>
      </li>
      <li class="ask"${from(2)}>
        <p class="turn-text">${RING_CLAIM}かを、手元で聞いて確かめてほしい。</p>
        ${ringAnswer()}
      </li>
    </ol>
    <div class="follow"${from(3)}>
      <span class="follow-label">このあと</span>
      <ul class="next-chips">
        <li><button class="next-chip" type="button" data-draft="/next-task T-106">T-106 の E2E に進む</button></li>
        <li><button class="next-chip" type="button" data-draft="このまま送り出して。">このまま送り出す</button></li>
      </ul>
    </div>
    <p class="next-note">押すと入力欄に下書きが入る。送るのは自分で</p>
  </section>`
}

// 案A 前と後: 紙の中身を「前 → 後」の対で組む。
function workPair() {
  const row = ({ what, was, now, proof, extra = "" }) => `<li class="pair-row">
      <span class="pair-what">${what}</span>
      <span class="pair-was">${was}</span>
      <span class="pair-arrow">${icon("right")}</span>
      <span class="pair-now">${now}</span>
      ${proof ? `<span class="pair-proof">${proof}</span>` : ""}${extra}
    </li>`
  return `${workHead()}
    ${sureHead()}
    ${countLine(WORK_SEALS)}
    <section class="fig fig-lead" aria-labelledby="claim-screen">
      <header class="fig-head">
        <h2 class="claim" id="claim-screen">設定の「知らせ」に、切り替えが1行増えた</h2>
        ${switcher("view", "見比べ方", [["side", "並べる"], ["after", "後だけ"], ["before", "前だけ"]])}
      </header>
      ${screenPair()}
      <p class="fig-note">${SCREEN_NOTE}</p>
      <div class="proof-line">${seal("kept")}${receipt(SCREEN_RECEIPT)}</div>
    </section>
    <section class="fig" aria-labelledby="claim-rows">
      <h2 class="claim" id="claim-rows">ほかに変わったのは、ふるまい・保存・テストの3つ</h2>
      <ol class="pair-rows">
        <li class="pair-row pair-row-head" aria-hidden="true"><span></span><span>前</span><span></span><span>後</span></li>
        ${row({
          what: "ふるまい",
          was: "鈴は、どのタブを見ていても鳴る",
          now: "切り替えを入れると、ほかのタブを見ているときだけ鳴る",
          proof: `${seal("said")}<span class="proof-why"${from(2)}>${RING_WHY}確かめ方はいちばん下</span>`,
        })}
        ${row({
          what: "保存",
          was: "持たない",
          now: "端末ごとの好みに <code>notice.backgroundOnly</code> を持ち、読み直しても残る",
          proof: `${seal("kept")}${receipt(SAVE_RECEIPT)}`,
        })}
        ${row({
          what: "単体テスト",
          was: `<span class="num-was">2,853</span> 件`,
          now: `<b class="num-now">2,861</b> 件<span class="delta-diff">+8</span>`,
          proof: `${seal("kept")}${receipt(CHECK_RECEIPT)}`,
        })}
      </ol>
    </section>
    <section class="fig" aria-labelledby="claim-code">
      <h2 class="claim" id="claim-code">触ったのは4ファイルで、大半は設定の面</h2>
      ${fileBars()}
    </section>
    <section class="fig" aria-labelledby="claim-kept">
      <h2 class="claim" id="claim-kept">既定と、通知の許しの聞き方は変えていない</h2>
      ${keptList()}
      <div class="proof-line">${seal("kept")}${receipt(KEPT_RECEIPT)}</div>
    </section>
    <section class="fig fig-undone" aria-labelledby="claim-undone"${from(2)}>
      <h2 class="claim" id="claim-undone">やっていないこと</h2>
      ${undoneList()}
    </section>
    ${workTurn()}`
}

// 盤の区画。開くとその場で横いっぱいに広がる。swap が真なら、開いたときは小さい図を大きい図に入れ替える。
function tile({ id, size, claim, mini, more, swap = false }) {
  const opened = more !== "" && openAll
  const head = more
    ? `<h2 class="claim"><button class="tile-toggle" type="button" aria-expanded="${opened}" aria-controls="more-${id}">${claim}${icon("chevron", " icon-sm")}</button></h2>`
    : `<h2 class="claim">${claim}</h2>`
  const body = more ? `<div class="tile-more" id="more-${id}"${opened ? "" : " hidden"}>${more}</div>` : ""
  return `<article class="tile" data-tile="${id}" data-size="${size}" data-open="${opened}" style="view-transition-name: tile-${id}">
      ${head}<div class="tile-mini"${swap ? " data-swap" : ""}>${mini}</div>${body}
    </article>`
}

// 台帳の行。主張・印・小さな裏づけを1行に置き、開くと裏づけそのものが出る。
function claimRow({ id, kind, claim, thumb, proof, more, open = false }) {
  const opened = open || openAll
  return `<li class="claim-row" data-seal="${kind}" data-open="${opened}">
      <div class="claim-main">
        ${seal(kind)}
        <h2 class="claim"><button class="claim-toggle" type="button" aria-expanded="${opened}" aria-controls="more-${id}">${claim}${icon("chevron", " icon-sm")}</button></h2>
        <div class="claim-thumb">${thumb}</div>
        ${proof ? receipt(proof) : ""}
      </div>
      <div class="claim-more" id="more-${id}"${opened ? "" : " hidden"}>${more}</div>
    </li>`
}

// 案B 一目の盤: 最初の1画面を区画の盤にして、開くとその場で詳しくなる。
function workBoard() {
  return `${workHead()}
    ${sureHead()}
    <p class="board-tools"${from(3)}><button class="link-button" type="button" data-open-all aria-expanded="${openAll}">${openAll ? "全部たたむ" : "全部ひらく"}</button></p>
    <section class="board" aria-label="一目の盤">
      ${tile({
        id: "screen",
        size: "wide",
        claim: "設定の「知らせ」に、切り替えが1行増えた",
        mini: screenPair({ compact: true }),
        more: `${screenPair()}<p class="fig-note">${SCREEN_NOTE}</p><div class="proof-line">${seal("kept")}${receipt(SCREEN_RECEIPT)}</div>`,
        swap: true,
      })}
      ${tile({
        id: "sure",
        size: "side",
        claim: "6件のうち、1件は申告だけで、1件はやっていない",
        mini: `<div${from(2)}>${tracker(WORK_SEALS, "主張 6 件のうち、記録あり 4、申告のみ 1、やっていない 1")}</div>
          <ul class="flag-list">
            <li>${icon("question")}<span>ほかのタブで鳴るか</span></li>
            <li>${icon("minus")}<span>ほかのブラウザでの表示</span></li>
          </ul>`,
        more: `<p class="fig-note">${RING_WHY}</p>${ringSteps()}<h3 class="sub">やっていないこと</h3>${undoneList()}`,
      })}
      ${tile({
        id: "save",
        size: "third",
        claim: "入れた値は端末ごとの好みに残る",
        mini: saveFlow({ compact: true }),
        more: `${saveFlow()}<p class="fig-note">${SAVE_NOTE}</p><div class="proof-line">${seal("kept")}${receipt(SAVE_RECEIPT)}</div>`,
        swap: true,
      })}
      ${tile({
        id: "test",
        size: "third",
        claim: "検査は全部通り、単体テストは8件増えた",
        mini: testDelta(),
        more: `${CHECK_OUTPUT}<div class="proof-line">${seal("kept")}${receipt({ ...CHECK_RECEIPT, peek: undefined })}</div>`,
      })}
      ${tile({
        id: "code",
        size: "third",
        claim: "触ったのは4ファイルで、大半は設定の面",
        mini: fileBars({ compact: true }),
        more: fileBars(),
        swap: true,
      })}
      ${tile({
        id: "kept",
        size: "full",
        claim: "既定と、通知の許しの聞き方は変えていない",
        mini: `${keptList()}<div class="proof-line">${seal("kept")}${receipt(KEPT_RECEIPT)}</div>`,
        more: "",
      })}
    </section>
    ${workTurn()}`
}

// 案C 裏づけの台帳: 紙の骨組みを主張の行にして、行ごとに裏づけを持たせる。
function workLedger() {
  const row = claimRow
  return `${workHead()}
    ${sureHead()}
    <section class="proof" aria-label="裏づけの台帳">
      <header class="proof-head">
        ${countLine(WORK_SEALS)}
        ${switcher("filter", "行の絞り込み", [["all", "すべて"], ["open", "確かめが要る 2"]])}
      </header>
      <ol class="claims">
        ${row({
          id: "ring",
          kind: "said",
          claim: RING_CLAIM,
          thumb: `<span class="thumb-text">聞いていない</span>`,
          more: `<p class="fig-note">${RING_WHY}確かめ方は次のとおり。</p>${ringSteps()}`,
          open: true,
        })}
        ${row({
          id: "screen",
          kind: "kept",
          claim: "設定の「知らせ」に、切り替えが1行増えた",
          thumb: screenPair({ compact: true }),
          proof: SCREEN_RECEIPT,
          more: `${screenPair()}<p class="fig-note">${SCREEN_NOTE}</p>`,
        })}
        ${row({
          id: "save",
          kind: "kept",
          claim: "入れた値は端末ごとの好みに残り、読み直しても保たれる",
          thumb: `<span class="thumb-flow"><i class="flow-new"></i><i class="flow-new"></i><i></i><i></i></span>`,
          proof: SAVE_RECEIPT,
          more: `${saveFlow()}<p class="fig-note">${SAVE_NOTE}</p>`,
        })}
        ${row({
          id: "check",
          kind: "kept",
          claim: "検査は全部通り、単体テストは8件増えた",
          thumb: `<span class="thumb-num"><span class="num-was">2,853</span>${icon("right", " icon-sm")}<b class="num-now">2,861</b></span>`,
          proof: { ...CHECK_RECEIPT, peek: undefined },
          more: `${testDelta()}${CHECK_OUTPUT}`,
        })}
        ${row({
          id: "kept",
          kind: "kept",
          claim: "既定と、通知の許しの聞き方は変えていない",
          thumb: `<span class="thumb-text">差分なし</span>`,
          proof: KEPT_RECEIPT,
          more: `${keptList()}<h3 class="sub">触ったファイル</h3>${fileBars()}`,
        })}
        ${row({
          id: "undone",
          kind: "none",
          claim: "ほかのブラウザと、許しを初めて聞く場面は見ていない",
          thumb: `<span class="thumb-text">2 件</span>`,
          more: undoneList(),
        })}
      </ol>
    </section>
    ${workTurn()}`
}

const WORK = {
  request: "設定に知らせの切り替えを足したい",
  say: ["検査まで全部通ったぞ、えへん！文言だけ、どっちにそろえるか決めてほしいのだ。", "14:31"],
  worklog: "4フェーズ・6分40秒・セリフ 5件",
  phases: 4,
  total: "6分40秒",
  steps: 14,
  asks: [1, 2, 2],
  heads: {
    pair: ["知らせの切り替えを設定に足した", "切り替えが1行増えた", "ふるまい・保存・テスト", "触ったのは4ファイル", "変えていないこと", "お願い"],
    board: ["知らせの切り替えを設定に足した", "一目の盤", "お願い"],
    ledger: ["知らせの切り替えを設定に足した", "裏づけの台帳", "お願い"],
  },
  paper: { pair: workPair, board: workBoard, ledger: workLedger },
}

// ---------- 題材2: 判断の報告（鈴をどの仕組みで鳴らすか） ----------

const WAYS = [
  { id: "audio", name: "案1 音声の要素で鳴らす", short: "音声の要素", verdict: "reject", why: "ほかのタブを見ていると、鳴るまでに間が空く", lag: 1200, cells: ["ng", "ok", "ok"] },
  { id: "webaudio", name: "案2 Web Audio で鳴らす", short: "Web Audio", verdict: "adopt", why: "ほかのタブでも遅れず、音量も変えられる", lag: 40, cells: ["ok", "ok", "ok"] },
  { id: "notice", name: "案3 通知の音に任せる", short: "通知の音", verdict: "consider", why: "許しが要り、音量は OS まかせになる", lag: 90, cells: ["ok", "ng", "ng"] },
]

const CRITERIA = ["ほかのタブで遅れない", "許しが要らない", "音量を変えられる"]

const VERDICT = { adopt: "採る", consider: "検討", reject: "採らない" }

const CELL = { ok: ["check", "満たす"], ng: ["cross", "満たさない"] }

// 案の比べ。採る案の列だけを強調の色で囲む。
function wayMatrix({ compact = false } = {}) {
  const head = WAYS.map((way) => `<th scope="col" data-verdict="${way.verdict}">${compact ? way.short : way.name}</th>`).join("")
  const rows = CRITERIA.map((name, index) => {
    const cells = WAYS.map((way) => {
      const [mark, word] = CELL[way.cells[index]]
      return `<td data-cell="${way.cells[index]}" data-verdict="${way.verdict}">${icon(mark)}<span class="visually-hidden">${word}</span></td>`
    }).join("")
    return `<tr><th scope="row">${name}</th>${cells}</tr>`
  })
  const foot = WAYS.map((way) => `<td data-verdict="${way.verdict}"><span class="verdict" data-verdict="${way.verdict}">${VERDICT[way.verdict]}</span></td>`).join("")
  return `<div class="table-scroll"><table class="ways${compact ? " ways-compact" : ""}">
    <thead><tr><th></th>${head}</tr></thead>
    <tbody>${rows.join("")}</tbody>
    <tfoot><tr><th scope="row">判断</th>${foot}</tr></tfoot>
  </table></div>`
}

// 鳴るまでの間。採る案だけを強調の色で塗り、ほかは灰にする。値は棒の先に直接書く。
function lagBars({ compact = false } = {}) {
  const top = Math.max(...WAYS.map((way) => way.lag))
  const rows = WAYS.map(
    (way) => `<li data-verdict="${way.verdict}"><span class="lag-name">${way.short}</span>
      <span class="lag-track"><i style="inline-size: ${Math.max((way.lag / top) * 100, 1.5)}%"></i><b>${way.lag.toLocaleString("ja-JP")}</b></span></li>`,
  )
  return `<ul class="lag${compact ? " lag-compact" : ""}" aria-label="ほかのタブを見ているときに鳴るまでの間（ミリ秒）">${rows.join("")}</ul>
    <p class="fig-key">単位はミリ秒。ほかのタブを見ている状態で 10 回ずつ測った中央の値</p>`
}

const LAG_RECEIPT = {
  command: "measure-ring.ts --hidden --runs 10",
  figure: "3案 × 10回",
  time: "11:02",
}

// 今と、採ったあとの鳴り方。
function ringPair() {
  const line = (name, parts) => `<ol class="ring-line" aria-label="${name}">${parts
    .map(([text, kind], index) => `<li>${index === 0 ? "" : icon("right", " icon-sm")}<span data-kind="${kind}">${text}</span></li>`)
    .join("")}</ol>`
  return `<div class="pair pair-text" data-view="side">
    <figure class="pair-side" data-side="before"><figcaption>今</figcaption>
      ${line("今の鳴り方", [["依頼が済む", "plain"], ["音声の要素を再生", "plain"], ["約 1.2 秒おくれて鳴る", "bad"]])}
    </figure>
    <figure class="pair-side" data-side="after"><figcaption>案2 を採ったあと</figcaption>
      ${line("案2 を採ったあとの鳴り方", [["依頼が済む", "plain"], ["Web Audio で再生", "new"], ["約 0.04 秒で鳴る", "new"]])}
    </figure>
  </div>`
}

const SOURCES = [
  ["ほかのタブを見ているあいだは、タイマーが間引かれる", "仕様の文書 A（架空）"],
  ["通知の音は、利用者が許したあとにだけ鳴らせる", "仕様の文書 B（架空）"],
]

function sourceList() {
  return `<ul class="sources">${SOURCES.map(([text, site]) => `<li>${text}<span class="source-site">${site}</span></li>`).join("")}</ul>`
}

const DECIDE_UNDONE = ["スマートフォンのブラウザでの間", "音量を変えたときの聞こえ方"]

function decideUndone() {
  return `<ul class="undone-list">${DECIDE_UNDONE.map((text) => `<li>${icon("minus")}${text}</li>`).join("")}</ul>`
}

const DECIDE_SEALS = ["said", "kept", "kept", "kept", "none"]

function decideHead() {
  return `<p class="task-line"><span class="task-tag">T-109</span><span>鈴の鳴らし方を決める</span><span>調べと判断・コードは変えていない</span>
      <span class="widen">${icon("expand", " icon-sm")}広げる</span></p>
    <h1 class="tight">鈴は Web Audio で鳴らすのがよい。ほかのタブでも遅れず、音量も変えられる</h1>`
}

function decideSure() {
  return `<dl class="head-rows"${upto(1)}>
    <div class="head-row"><dt>確かめたこと</dt><dd>
      <ul class="ledger">
        <li class="ledger-row" data-state="open">${icon("question")}<span class="ledger-label">案2 は Safari でも遅れないか</span><span class="seal seal-said">申告のみ</span>
          <p class="ledger-how">測ったのは Chromium だけ。確かめ方: Safari で同じ測り方を 10 回</p></li>
        <li class="ledger-row" data-state="ok">${icon("check")}<span class="ledger-label">確かめた 3件　<span class="ledger-rest">3案の間の測定・仕様の文書 2 件</span></span><span class="seal seal-kept">記録あり 1</span></li>
      </ul>
    </dd></div>
  </dl>`
}

function decideTurn() {
  const way = (item, primary) => `<button class="choice${primary ? " choice-main" : ""}" type="button" data-draft="鈴は${item.short}で鳴らす形で進めて。" aria-pressed="false">
      <span class="choice-preview" aria-hidden="true"><span class="shot-label">${item.short}</span><b class="choice-lag">${item.lag.toLocaleString("ja-JP")} ミリ秒</b></span>
      <span class="choice-name">${item.name.slice(0, 2)}で進める</span>
    </button>`
  return `<section class="turn-end" id="turn-end" aria-labelledby="turn-title">
    <h2 class="turn-title" id="turn-title">お願い</h2>
    <ol class="asks">
      <li class="ask">
        <p class="turn-text">鈴の鳴らし方を、どの案で進めるか決めてほしい。勧めるのは案2。</p>
        <div class="choices"${from(3)}>${way(WAYS[1], true)}${way(WAYS[2], false)}${way(WAYS[0], false)}</div>
        <ul class="next-chips"${upto(2)}>
          <li><button class="next-chip" type="button" data-draft="鈴は Web Audio で鳴らす形で進めて。">案2 で進める</button></li>
          <li><button class="next-chip" type="button" data-draft="鈴は通知の音に任せる形で進めて。">案3 で進める</button></li>
        </ul>
      </li>
    </ol>
    <div class="follow"${from(3)}>
      <span class="follow-label">このあと</span>
      <ul class="next-chips">
        <li><button class="next-chip" type="button" data-draft="Safari でも同じ測り方で 10 回測って。">Safari でも測る</button></li>
        <li><button class="next-chip" type="button" data-draft="案2 で進めるタスクを積んで。">タスクに積む</button></li>
      </ul>
    </div>
    <p class="next-note">押すと入力欄に下書きが入る。送るのは自分で</p>
  </section>`
}

const LAG_CLAIM = "ほかのタブを見ていても遅れないのは、案2 と案3"
const MATRIX_CLAIM = "3つの条件を全部満たすのは、案2 だけ"
const SAFARI_CLAIM = "案2 は Safari でも遅れない"
const SAFARI_WHY = "測ったのは Chromium だけで、Safari は仕様の文書からの見込み。"

function decidePair() {
  return `${decideHead()}
    ${decideSure()}
    ${countLine(DECIDE_SEALS)}
    <section class="fig fig-lead" aria-labelledby="claim-ring">
      <header class="fig-head">
        <h2 class="claim" id="claim-ring">案2 を採ると、鳴るまでの間が約 1.2 秒から 0.04 秒になる</h2>
        ${switcher("view", "見比べ方", [["side", "並べる"], ["after", "後だけ"], ["before", "今だけ"]])}
      </header>
      ${ringPair()}
      <div class="proof-line">${seal("kept")}${receipt(LAG_RECEIPT)}</div>
    </section>
    <section class="fig" aria-labelledby="claim-lag">
      <h2 class="claim" id="claim-lag">${LAG_CLAIM}</h2>
      ${lagBars()}
    </section>
    <section class="fig" aria-labelledby="claim-matrix">
      <h2 class="claim" id="claim-matrix">${MATRIX_CLAIM}</h2>
      ${wayMatrix()}
      <div class="proof-line">${seal("kept")}<p class="receipt"${from(2)}>${icon("receipt")}<span>仕様の文書 2 件</span></p></div>
      ${sourceList()}
    </section>
    <section class="fig" aria-labelledby="claim-safari"${from(2)}>
      <h2 class="claim" id="claim-safari">${SAFARI_CLAIM}</h2>
      <div class="proof-line">${seal("said")}<span class="proof-why">${SAFARI_WHY}</span></div>
    </section>
    <section class="fig fig-undone" aria-labelledby="claim-undone"${from(2)}>
      <h2 class="claim" id="claim-undone">やっていないこと</h2>
      ${decideUndone()}
    </section>
    ${decideTurn()}`
}

function decideBoard() {
  return `${decideHead()}
    ${decideSure()}
    <p class="board-tools"${from(3)}><button class="link-button" type="button" data-open-all aria-expanded="${openAll}">${openAll ? "全部たたむ" : "全部ひらく"}</button></p>
    <section class="board" aria-label="一目の盤">
      ${tile({
        id: "matrix",
        size: "wide",
        claim: MATRIX_CLAIM,
        mini: wayMatrix({ compact: true }),
        more: `${sourceList()}<div class="proof-line">${seal("kept")}<p class="receipt"${from(2)}>${icon("receipt")}<span>仕様の文書 2 件</span></p></div>`,
      })}
      ${tile({
        id: "sure",
        size: "side",
        claim: "5件のうち、1件は申告だけで、1件はやっていない",
        mini: `<div${from(2)}>${tracker(DECIDE_SEALS, "主張 5 件のうち、記録あり 3、申告のみ 1、やっていない 1")}</div>
          <ul class="flag-list">
            <li>${icon("question")}<span>Safari でも遅れないか</span></li>
            <li>${icon("minus")}<span>スマートフォンでの間</span></li>
          </ul>`,
        more: `<p class="fig-note">${SAFARI_WHY}</p><h3 class="sub">やっていないこと</h3>${decideUndone()}`,
      })}
      ${tile({
        id: "lag",
        size: "half",
        claim: LAG_CLAIM,
        mini: lagBars({ compact: true }),
        more: `<div class="proof-line">${seal("kept")}${receipt(LAG_RECEIPT)}</div>`,
      })}
      ${tile({
        id: "ring",
        size: "half",
        claim: "採ると、鳴るまでの間が約 1.2 秒から 0.04 秒になる",
        mini: `<p class="big-pair"><span class="num-was">1,200</span>${icon("right")}<b class="num-now">40</b><span class="unit">ミリ秒</span></p>`,
        more: ringPair(),
      })}
    </section>
    ${decideTurn()}`
}

function decideLedger() {
  const row = claimRow
  return `${decideHead()}
    ${decideSure()}
    <section class="proof" aria-label="裏づけの台帳">
      <header class="proof-head">
        ${countLine(DECIDE_SEALS)}
        ${switcher("filter", "行の絞り込み", [["all", "すべて"], ["open", "確かめが要る 2"]])}
      </header>
      <ol class="claims">
        ${row({
          id: "safari",
          kind: "said",
          claim: SAFARI_CLAIM,
          thumb: `<span class="thumb-text">測っていない</span>`,
          more: `<p class="fig-note">${SAFARI_WHY}確かめるには、Safari で同じ測り方を 10 回行う。</p>`,
          open: true,
        })}
        ${row({
          id: "lag",
          kind: "kept",
          claim: LAG_CLAIM,
          thumb: `<span class="thumb-num"><span class="num-was">1,200</span>${icon("right", " icon-sm")}<b class="num-now">40</b></span>`,
          proof: LAG_RECEIPT,
          more: lagBars(),
        })}
        ${row({
          id: "matrix",
          kind: "kept",
          claim: MATRIX_CLAIM,
          thumb: `<span class="thumb-text">3 条件 × 3 案</span>`,
          proof: { command: "仕様の文書", figure: "2 件", time: "10:48" },
          more: `${wayMatrix()}${sourceList()}`,
        })}
        ${row({
          id: "ring",
          kind: "kept",
          claim: "今は、ほかのタブを見ていると約 1.2 秒おくれて鳴る",
          thumb: `<span class="thumb-text">10 回の中央の値</span>`,
          proof: LAG_RECEIPT,
          more: ringPair(),
        })}
        ${row({
          id: "undone",
          kind: "none",
          claim: "スマートフォンでの間と、音量を変えたときの聞こえ方は見ていない",
          thumb: `<span class="thumb-text">2 件</span>`,
          more: decideUndone(),
        })}
      </ol>
    </section>
    ${decideTurn()}`
}

const DECIDE = {
  request: "鈴をどの仕組みで鳴らすか、案を比べて決めたい",
  say: ["3つとも測ってきたぞ。おすすめは案2 なのだ、理由は紙に書いたぞ。", "11:04"],
  worklog: "3フェーズ・9分12秒・セリフ 4件",
  phases: 3,
  total: "9分12秒",
  steps: 21,
  asks: [1, 1, 1],
  heads: {
    pair: ["鈴は Web Audio で鳴らすのがよい", "鳴るまでの間が縮む", "遅れないのは案2 と案3", "条件を満たすのは案2 だけ", "お願い"],
    board: ["鈴は Web Audio で鳴らすのがよい", "一目の盤", "お願い"],
    ledger: ["鈴は Web Audio で鳴らすのがよい", "裏づけの台帳", "お願い"],
  },
  paper: { pair: decidePair, board: decideBoard, ledger: decideLedger },
}

// 案A の題材ごとの見本（cases.js が足す）。この見本の部品を渡して、題材の一覧を受け取る。
const CASES =
  typeof globalThis.reportCases === "function"
    ? globalThis.reportCases({ icon, from, upto, seal, receipt, countLine, tracker, switcher })
    : {}
const caseId = params.get("case") ?? ""
const CONTENT = CASES[caseId] ?? { work: WORK, decide: DECIDE }[genre]
if (CASES[caseId] !== undefined) {
  document.body.dataset.form = "pair"
  document.body.dataset.case = caseId
}

// ---------- 器に流し込む ----------

// 終わり方。完了のほかに、途中で止めた形と、利用者の答えを待つ形がある。
const STATES = {
  done: { label: "完了", tone: "state-ok", mark: "check" },
  halt: { label: "止めた", tone: "state-halt", mark: "pause" },
  wait: { label: "答え待ち", tone: "state-wait", mark: "question" },
}
const state = STATES[CONTENT.state ?? "done"]

function shelfHead() {
  const done = CONTENT.done ?? CONTENT.phases
  const dots = Array.from(
    { length: CONTENT.phases },
    (_, index) => `<span class="phase${index < done ? " phase-done" : ""}">${index + 1}</span>`,
  ).join("")
  const where = done === CONTENT.phases ? `${CONTENT.phases}フェーズすべて済み` : `${CONTENT.phases}フェーズのうち${done}フェーズまで済み`
  const place =
    CONTENT.phases === 0
      ? ""
      : `<span class="phases" role="img" aria-label="${where}">${dots}</span>
      <span class="phase-name">${where}</span><span class="shelf-where">${where}</span>`
  return `<section class="shelf" data-open="false" aria-label="進み具合">
    <header class="shelf-head">
      <span class="state ${state.tone}"><span class="state-dot"></span>${state.label}</span>
      ${place}
      <span class="paper-head-end"><span class="elapsed">所要 <b>${CONTENT.total}</b></span>
        <button class="chip-button" type="button">手順 <b>${CONTENT.steps}</b>${icon("chevron", " icon-sm")}</button></span>
    </header>
    <div class="shelf-body" id="shelf-body"></div>
  </section>`
}

const stream = one("#stream")
stream.insertAdjacentHTML("beforebegin", shelfHead())
const worklog =
  CONTENT.worklog === undefined
    ? `<p class="post">${CONTENT.request}<time>${CONTENT.say[1]}</time></p>`
    : `<details class="worklog"><summary>作業の経過<span>${CONTENT.worklog}</span></summary></details>`
const paper = typeof CONTENT.paper === "function" ? CONTENT.paper() : CONTENT.paper[form]()
stream.innerHTML = `${worklog}
  <p class="say">${CONTENT.say[0]}<time>${CONTENT.say[1]}</time></p>
  <article class="sheet paper attach" aria-label="レポート"><div class="report evolve">${paper}</div></article>`

one("#turn-request").textContent = CONTENT.request
one("#turn-current .icon use").setAttribute("href", `#i-${state.mark}`)
one("#turn-heads").innerHTML = (Array.isArray(CONTENT.heads) ? CONTENT.heads : CONTENT.heads[form])
  .map((text, index) =>
    index === 0
      ? `<li class="turn-head turn-head-current"><span class="turn-head-kind">最終</span>${text}</li>`
      : `<li class="turn-head turn-head-sub">${text}</li>`,
  )
  .join("")

// 上の切り替えの帯のリンク。いまの URL の値を引き継ぎ、選んだ1つだけを替える。
const current = { form, lv: String(lv), genre }
for (const choices of all(".mock-bar-group")) {
  const name = choices.dataset.param
  for (const link of choices.querySelectorAll("a")) {
    const next = new URLSearchParams(location.search)
    next.delete("at")
    next.delete("open")
    if (name !== "lv") {
      next.delete("case")
    }
    next.set(name, link.dataset.value)
    link.href = `?${next}`
    if (link.dataset.value === current[name] && (name === "lv" || CASES[caseId] === undefined)) {
      link.setAttribute("aria-current", "true")
    }
  }
}

if (packId !== "tsukumo") {
  const root = document.documentElement
  root.style.setProperty("--accent", pack.accent)
  root.style.setProperty("--art", `url("../../../../characters/${packId}/background.png")`)
  for (const image of all('img[src*="/characters/tsukumo/"]')) {
    image.src = image.getAttribute("src").replace("/characters/tsukumo/", `/characters/${packId}/`)
  }
}

const draft = one("#draft")
draft.placeholder = `${pack.name} への依頼を書く`

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches

// 押すと入力欄に下書きが入る（送らない）。
function fillDraft(text) {
  draft.value = text
  const composer = one(".composer")
  composer.dataset.filled = "true"
  setTimeout(() => {
    delete composer.dataset.filled
  }, 900)
}

document.addEventListener("click", (event) => {
  const source = event.target.closest("[data-draft]")
  if (source === null) {
    return
  }
  fillDraft(source.dataset.draft)
  const group = source.closest(".choices, .answer")
  if (group !== null) {
    for (const button of group.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button === source))
    }
  }
  // 文言の候補を選ぶと、紙の中の画の文言も入れ替わる（選んだ結果を先に見せる）。
  if (source.dataset.wording !== undefined) {
    for (const label of all(".shot-new .shot-label")) {
      label.textContent = WORDING[source.dataset.wording]
    }
  }
})

// 切り替えの器（見比べ方・行の絞り込み）。
for (const group of all(".switch")) {
  group.addEventListener("click", (event) => {
    const button = event.target.closest("button")
    if (button === null) {
      return
    }
    for (const other of group.querySelectorAll("button")) {
      other.setAttribute("aria-pressed", String(other === button))
    }
    if (group.dataset.switch === "view") {
      for (const pair of all(".pair")) {
        pair.dataset.view = button.dataset.value
      }
    }
    if (group.dataset.switch === "filter") {
      one(".claims").dataset.filter = button.dataset.value
    }
  })
}

// 盤の区画と台帳の行の開閉。段3 では区画の動きをなめらかにつなぐ。
function setOpen(holder, open) {
  const toggle = holder.querySelector(".tile-toggle, .claim-toggle")
  const more = holder.querySelector(".tile-more, .claim-more")
  if (toggle === null || more === null) {
    return
  }
  holder.dataset.open = String(open)
  toggle.setAttribute("aria-expanded", String(open))
  more.hidden = !open
}

function moveSmoothly(change) {
  if (lv < 3 || reduceMotion || document.startViewTransition === undefined) {
    change()
    return
  }
  document.startViewTransition(change)
}

document.addEventListener("click", (event) => {
  const toggle = event.target.closest(".tile-toggle, .claim-toggle")
  if (toggle !== null) {
    const holder = toggle.closest(".tile, .claim-row")
    moveSmoothly(() => setOpen(holder, holder.dataset.open !== "true"))
    return
  }
  const everything = event.target.closest("[data-open-all]")
  if (everything !== null) {
    const open = everything.getAttribute("aria-expanded") !== "true"
    moveSmoothly(() => {
      for (const holder of all(".tile, .claim-row")) {
        setOpen(holder, open)
      }
      everything.setAttribute("aria-expanded", String(open))
      everything.textContent = open ? "全部たたむ" : "全部ひらく"
    })
  }
})

// 用件のあるレポートを読むあいだ、入力欄の上に知らせの1行を出す（案2 と同じ位置）。
const turnTitle = one("#turn-title")
if (turnTitle !== null) {
  const count = Array.isArray(CONTENT.asks) ? CONTENT.asks[lv - 1] : CONTENT.asks
  one(".composer").insertAdjacentHTML(
    "afterbegin",
    `<p class="composer-status">${icon("down")}<span>お願いが${count}件あります</span><button class="status-jump" type="button">レポートの末尾へ</button></p>`,
  )
  one(".status-jump").addEventListener("click", () => {
    stream.scrollTo({ top: stream.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" })
  })
  const notice = one(".composer-status")
  new IntersectionObserver(
    ([entry]) => {
      notice.style.visibility = entry.isIntersecting ? "hidden" : "visible"
    },
    { root: stream, rootMargin: "0px 0px -176px 0px" },
  ).observe(turnTitle)
}

// 送り位置。作業の経過の行を上端に置いてレポートを頭から読ませる（?at=end で末尾）。
if (params.get("at") === "end") {
  stream.scrollTop = stream.scrollHeight
} else {
  const top = stream.querySelector(".worklog") ?? stream.querySelector(".post")
  stream.scrollTop = top.offsetTop - stream.offsetTop - 11
}

const turnList = one(".turns")
turnList.scrollTop = turnList.scrollHeight

one(".composer").addEventListener("submit", (event) => {
  event.preventDefault()
})
