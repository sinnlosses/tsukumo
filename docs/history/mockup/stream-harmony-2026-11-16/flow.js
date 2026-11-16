// 会話の流れの見本。URL の検索引数から形・場面・パックを読み、進行の帯・会話の流れ・入力欄の帯を組む。
// 今の形（form=now）の行の並びと見た目は、今の画面を疑似セッションで撮って測ったものに合わせてある。
// 見本どおりの形（form=spec）は、採用済みの見本（../report-progress-2026-11-15/ の案2）の形。
// 作り直した形（form=goal）は、設計レビューの指摘（中の作業7群と見本の修正点8つ）を入れた形。
// 状態の一覧（states.html）もこのファイルの部品を使う。中身はすべて架空で、実物の会話ではない。

const PLUS = ["attach", "live", "dialog", "verb", "minute"]
const MOMENTS = ["work", "ask", "late", "read", "fail"]
const PACKS = {
  shirasuzu: { name: "白鈴", accent: "#f9c3cd" },
  tsukumo: { name: "つくも", accent: "#6fe3cd" },
}

const params = new URLSearchParams(location.search)

function pick(name, allowed) {
  const value = params.get(name)
  return allowed.includes(value) ? value : allowed[0]
}

// 状態の一覧のページは、検索引数によらず作り直した形で組む。
const form = document.body.dataset.form ?? pick("form", ["now", "spec", "next", "goal"])
const only = params.get("only")
const moment = pick("moment", MOMENTS)
const packId = pick("pack", Object.keys(PACKS))
const pack = PACKS[packId]
const atEnd = params.get("at") === "end"
const scrolledUp = params.get("up") === "1"

// 提案も作り直した形も、見本どおりの形の上に重ねる。
const flags = new Set(
  PLUS.includes(only)
    ? ["spec", only]
    : form === "goal"
      ? ["spec", "goal"]
      : form === "next"
        ? ["spec", ...PLUS]
        : form === "spec"
          ? ["spec"]
          : [],
)
const has = (flag) => flags.has(flag)
const goal = has("goal")

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
  failed: ["……ん、サーバが応えませんでした。ここで止めています。", "14:27"],
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
  fail: { state: "失敗", current: 1, time: ["所要", "2分31秒"], steps: 6 },
}

const NOW = {
  work: { tool: "Bash", detail: "pnpm run test sort-order", time: "12秒" },
  late: { tool: "Bash", detail: "pnpm run check", time: "40秒" },
}

// 道具の名前から、流れの末尾の行に出す動詞を引く。道具でない状態（考えている・レポートを書いている）も同じ言い方にそろえる。
const VERBS = {
  Read: "読んでいる",
  Grep: "探している",
  Glob: "探している",
  Edit: "書き換えている",
  Write: "書いている",
  Bash: "コマンドを走らせている",
  Agent: "委譲先に任せている",
  WebFetch: "調べている",
  WebSearch: "調べている",
}
const UNKNOWN_VERB = "道具を使っている"

// 立ち絵がいま従っているセリフ（その場面でいちばん新しいセリフ）。
const LIVE = { work: "found", ask: "ask", late: "wired", read: "done", fail: "failed" }[moment]

// 作り直した形の、いまの一言の尾。吹き出しの左下の角から、立ち絵のある左下へ向ける。
const TAIL =
  '<svg class="tail" viewBox="0 0 14 12" aria-hidden="true"><path d="M3 0 0.5 11.5 13 0" /></svg>'

// 時刻は、今の形では行ごとの札、見本どおりは吹き出しの中、提案 E と作り直した形では分が変わった行だけに出す。
// 作り直した形では、省いた行の時刻も、行に触れるかフォーカスを置くと読める。
let lastMinute = ""

function stampOf(time) {
  const changed = time !== lastMinute
  lastMinute = time
  const sparse = has("minute") || goal
  return {
    chip: `<time class="stamp">${time}</time>`,
    inside: sparse && !changed ? "" : `<time class="bubble-time">${time}</time>`,
    ghost: goal && !changed ? `<time class="ghost-time">${time}</time>` : "",
  }
}

function speaker(name) {
  return goal ? `<span class="visually-hidden">${name}: </span>` : ""
}

function post(text, time, label, extra = "") {
  const stamp = stampOf(time)
  const lead = label === undefined ? "" : `<span class="post-label">${label}</span>`
  const short = label === undefined ? "" : " is-short"
  const row = `<div class="row row-user"><div class="bubble bubble-post${short}">${speaker("あなた")}${lead}${text}${stamp.inside}</div>${stamp.chip}${stamp.ghost}</div>`
  return extra === "" ? row : `<div class="group group-user">${row}${extra}</div>`
}

function sayText(text, time, live) {
  const stamp = stampOf(time)
  const tail = live && goal && moment !== "read" ? TAIL : ""
  return `<div class="row row-say"><div class="bubble bubble-say${live ? " is-live" : ""}">${speaker(pack.name)}${text}${stamp.inside}${tail}</div>${stamp.chip}${stamp.ghost}</div>`
}

function say(key) {
  const [text, time] = SAY[key]
  return sayText(text, time, (has("live") || goal) && key === LIVE)
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

/** 済んだフェーズの控え。提案 A はセリフの下に一段下げて添え、作り直した形は幅をそろえて届いた順に置く。 */
function slip(index) {
  return `<section class="thing ${goal ? "slip" : "tuck"}">${phaseHead(index)}</section>`
}

function attach(row, thing) {
  return `<div class="attach">${row}${thing}</div>`
}

/** 作り直した形の1組。隣り合うセリフと物を、届いた順のまま近づけて置く。 */
function group(...items) {
  return `<div class="group">${items.join("")}</div>`
}

/** 開閉の表現。作り直した形では、作業の経過・聞いたときの詳細・失敗の詳細を同じ形にする。 */
function disclose(summary, body, extra = "") {
  return `<details class="disclose${extra}"><summary>${icon("chevron-right", " icon-sm")}<span>${summary}</span></summary><div class="disclose-body">${body}</div></details>`
}

/** 作り直した形の末尾の行。していること・対象・経過・長く掛かっているときの添え書き。 */
function nowPill(verb, detail, time, note = "") {
  const object = detail === "" ? "" : `<code>${detail}</code>`
  const slow = note === "" ? "" : `<span class="now-note">${note}</span>`
  return `<p class="now-pill${note === "" ? "" : " is-slow"} scroll-target"><span class="spinner"></span><b>${verb}</b>${object}<time>${time}</time>${slow}</p>`
}

function nowLine() {
  const now = NOW[moment]
  if (now === undefined) {
    return ""
  }
  if (has("verb") || goal) {
    return nowPill(VERBS[now.tool] ?? UNKNOWN_VERB, now.detail, now.time)
  }
  if (has("spec")) {
    return `<p class="now-pill scroll-target"><span class="spinner"></span><b class="now-lead">いま</b><code>${now.tool} ${now.detail}</code><time>${now.time}</time></p>`
  }
  return `<p class="now-band scroll-target"><span class="spinner"></span><span>いま</span><code>${now.tool}  ${now.detail} · ${now.time}</code></p>`
}

const EXPAND = `<button class="expand-button" type="button">${icon("expand")}広げる</button>`

function briefOf(question) {
  const facts = question.facts
    .map(
      (fact) =>
        `<div class="brief-fact"><span><span class="chip chip-ok">確かめた</span></span><span>${fact}</span></div>`,
    )
    .join("")
  const certainty = goal ? "chip chip-line" : "chip chip-plain"
  return `<dl class="brief">
      <div class="brief-line"><dt>聞く理由</dt><dd>${question.why}</dd></div>
      <dt>事実</dt>
      <dd>${facts}</dd>
      <div class="brief-line"><dt>おすすめの理由</dt><dd><span class="${certainty}">確度 中</span> ${question.reason}</dd></div>
    </dl>`
}

function optionRow([label, note], index, mark = "") {
  const key = goal
    ? `<kbd class="key">${index + 1}</kbd>`
    : `<span class="option-key">${index + 1}</span>`
  const recommend =
    index === 0 ? `<span class="${goal ? "chip chip-line" : "tag-recommend"}">おすすめ</span>` : ""
  return `<li class="option${mark === "" ? "" : " is-picked"}">
        <div class="option-head">${key}<span class="radio"></span>${label}${recommend}${mark}</div>
        <p class="option-note">${note}</p>
      </li>`
}

function inquiry() {
  const options = QUESTION.options.map((option, index) => optionRow(option, index)).join("")
  if (goal) {
    // 頭は種類・題・待ち時間・広げるの4つ。1問だけのときは「1 / 1」を出さない。
    // 「任せる」は、押す前に選ばれる案を言う。書いて答えられることの案内は、入力欄の上の1行だけ。
    return `<section class="inquiry thing wide scroll-target">
    <header class="inquiry-head">
      <span class="inquiry-kind">質問</span><span class="inquiry-label">${QUESTION.label}</span>
      <span class="inquiry-wait">待って 0:42</span>${EXPAND}
    </header>
    <h3 class="inquiry-title">${QUESTION.text}</h3>
    ${briefOf(QUESTION)}
    <ol class="options">${options}</ol>
    <footer class="inquiry-foot"><button class="quiet-button" type="button">おすすめに任せる（${QUESTION.options[0][0]}）</button><span class="inquiry-foot-gap"></span><button class="answer-button" type="button">これで答える ${icon("enter", " icon-sm")}</button></footer>
  </section>`
  }
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
    ${briefOf(QUESTION)}
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

/** 答え終わった質問。質問は聞いたセリフに添える1行にし、答えは利用者の投稿にする。 */
function questionSlip() {
  if (goal) {
    const detail = disclose("聞いたときの詳細", briefOf(QUESTION))
    return `<section class="thing slip">
    <header class="slip-head"><span class="slip-mark">${icon("question")}</span><span>${QUESTION.label}: ${QUESTION.text}</span></header>
    ${detail}
  </section>`
  }
  return `<section class="thing tuck">
    <header class="slip-head"><span class="slip-mark">${icon("question")}</span><span>${QUESTION.label}: ${QUESTION.text}</span><a class="slip-more">聞いたときの詳細</a></header>
  </section>`
}

/** 回答の投稿の下の「答え直す」。押すと訂正の補足が入力欄に下書きで入り、送りはしない。 */
const REDO = '<button class="quiet-button redo" type="button">答え直す</button>'

function checksOf() {
  if (goal) {
    // 状態の印は行ごとの1個だけにし、まとめの行は字で言う。
    return `<div class="checks">
      <div class="checks-line"><span class="checks-total">確かめたこと 2件</span><span class="checks-figure">通った 1・確かめていない 1</span><span class="checks-figure">単体 3152・E2E 71</span></div>
      <div class="checks-line checks-row"><span><span class="chip chip-warn">? 確かめていない</span></span><div><b>実ブラウザでの開き直し</b><span class="chip chip-line">申告のみ</span><small>疑似セッションでは開き直しを確かめていない</small></div></div>
      <div class="checks-line checks-row"><span><span class="chip chip-ok">${icon("check")}通った</span></span><div><b>pnpm run check</b><span class="chip chip-line">記録あり・1回</span></div></div>
    </div>`
  }
  return `<div class="checks">
      <div class="checks-line"><span class="chip chip-ok">${icon("check")}1件 通った</span><span class="chip chip-warn">? 1件 確かめていない</span><span class="checks-figure">単体 3152・E2E 71</span></div>
      <div class="checks-line checks-row"><span><span class="chip chip-warn">? 確かめていない</span></span><div><b>実ブラウザでの開き直し</b><span>申告のみ</span><small>疑似セッションでは開き直しを確かめていない</small></div></div>
      <div class="checks-line checks-row"><span><span class="chip chip-ok">${icon("check")}通った 1件</span></span><div><span>pnpm run check　記録あり 1</span></div></div>
    </div>`
}

function favorOf() {
  const target = atEnd ? " scroll-target" : ""
  if (goal) {
    return `<div class="favor favor-strong${target}">
      <p class="favor-label">お願い</p>
      <p class="favor-text">一覧を開いて並び替え、開き直して並びが残るかを見てください。</p>
    </div>
    <p class="next-step"><span class="next-step-label">次の一手</span><button class="door-button" type="button">確かめた</button><button class="door-button" type="button">違った</button><span class="next-step-note">押すと、入力欄に下書きが入る（送らない）</span></p>`
  }
  return `<div class="favor${target}">
      <p class="favor-label">お願い</p>
      <p>一覧を開いて並び替え、開き直して並びが残るかを見てください。</p>
    </div>`
}

function reportBody() {
  // 余白の案内は初回だけ出る手がかりなので、作り直した形の通常の場面には出さない（状態の一覧に載せる）。
  const lead =
    "並び替えるたびに端末ごとの好みへ保存し、一覧を開いたときに読み戻す。保存した値が壊れていたら既定の並びで開く。"
  const first = goal
    ? `<p>${lead}</p>`
    : `<div class="report-split">
      <p>${lead}</p>
      <p class="margin-hint">字・行・案を選ぶと、ここに「聞く・頼む」が1つ出る</p>
    </div>`
  return `<p class="conclusion">タスク一覧の並び替えが、開き直しても残るようになった。</p>
    ${checksOf()}
    <h2>並び順は端末ごとに保存する</h2>
    ${first}
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
    ${favorOf()}`
}

/** 今の形の最終レポート。面を持たず、背景の上に直に載る。 */
function finalReport() {
  return `<section class="report">
    <p class="report-label"><span>最終レポート</span>${EXPAND}</p>
    ${reportBody()}
  </section>`
}

/** 見本どおりの紙。提案 A と作り直した形では、締めのセリフのすぐ下に置く。 */
function paper() {
  const shape = goal ? " wide" : has("attach") ? " hang" : ""
  return `<section class="thing paper${shape}">
    <span class="paper-tools">${EXPAND}</span>
    <div class="report">${reportBody()}</div>
  </section>`
}

function fold(summary, body) {
  if (goal) {
    return disclose(summary, body, " fold-pill")
  }
  return `<details class="fold"><summary>${summary}</summary><div class="fold-body">${body}</div></details>`
}

/** 失敗の表示。今の形は理由と戻す口だけ。作り直した形は、詳細・残ったもの・次の行動を読める形で置く。 */
function failure() {
  if (goal) {
    return `<section class="thing wide failure scroll-target">
    <header class="failure-head"><span class="failure-mark"></span>失敗で終わった</header>
    <p class="failure-reason">API のサーバが応えなかった</p>
    <p class="failure-detail"><code>529 overloaded</code>3回試して、3回とも応答が無かった</p>
    <p class="failure-kept">残ったもの　済んだフェーズ 1/4・書き換えた 2 ファイル（<code>sort-order.ts</code> ほか）</p>
    <p class="failure-doors"><button class="door-button" type="button">同じ依頼を入力欄に戻す</button><button class="door-button" type="button">失敗した手順を見る</button></p>
  </section>`
  }
  return `<section class="interim failure-now scroll-target">
    <p class="failure-now-head">失敗で終わった</p>
    <p>API のサーバが応えなかった</p>
    <p><button class="pill-button" type="button">同じ依頼を入力欄に戻す</button></p>
  </section>`
}

/** 質問と答えのやり取り。答える前（ask の場面）は札、答えたあとは記録。 */
function exchange() {
  const asking = say("ask")
  if (moment === "ask") {
    if (goal) {
      return [group(asking, inquiry())]
    }
    return has("attach") ? [attach(asking, inquiry())] : [asking, inquiry()]
  }
  if (goal) {
    return [group(asking, questionSlip()), post(QUESTION.options[0][0], "14:28", "答え", REDO)]
  }
  if (has("dialog")) {
    return [attach(asking, questionSlip()), post(QUESTION.options[0][0], "14:28", "答え")]
  }
  return [asking, questionRecord()]
}

/** フェーズを終えたときの札とセリフ。今の形の札は、別の位置（1つ前の work_plan の位置）に出る。 */
function phaseDone(key, phaseIndex) {
  if (goal) {
    return [group(slip(phaseIndex), say(key))]
  }
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

function flowRows() {
  const rows = [post(REQUEST, "14:25")]
  if (moment === "work") {
    rows.push(...journey(0), nowLine())
  } else if (moment === "ask") {
    rows.push(...journey(1))
  } else if (moment === "late") {
    rows.push(...journey(2), nowLine())
  } else if (moment === "fail") {
    const failed = say("failed")
    rows.push(...journey(0), ...(goal ? [group(failed, failure())] : [failed, failure()]))
  } else if (has("spec")) {
    const all = journey(2).join("")
    const closing = say("done")
    const summary = "作業の経過　4フェーズ・6分40秒・セリフ 6件・質問 1件"
    rows.push(
      fold(summary, all),
      ...(goal
        ? [group(closing, paper())]
        : has("attach")
          ? [attach(closing, paper())]
          : [closing, paper()]),
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
  return rows
}

function buildFlow() {
  const rows = flowRows()
  // 上へ送って読んでいるあいだだけ出る「末尾へ」の口（作り直した形）。
  const jump =
    goal && scrolledUp
      ? `<button class="to-tail" type="button">${icon("chevron")}末尾へ<span class="to-tail-count">新しい行 3件</span></button>`
      : ""
  one("#flow").innerHTML = rows.join("")
  one("#scroller").insertAdjacentHTML("afterend", jump)
}

/** 進行の帯のフェーズの丸の並び。 */
function stripDots(count, current, asking) {
  // フェーズが多いときは、済んだ丸を数1つにまとめて、今のフェーズの名前の幅を残す。
  const packed = goal && count > 8 && current > 2
  const dots = Array.from({ length: count }, (_, index) => {
    if (index < current) {
      return doneDot()
    }
    if (index === current) {
      return asking
        ? '<span class="phase-dot is-asking">?</span>'
        : `<span class="phase-dot is-current">${index + 1}</span>`
    }
    return `<span class="phase-dot">${index + 1}</span>`
  })
  if (packed) {
    const done = `<span class="phase-dot is-done phase-run">${icon("check")}${current}</span>`
    return [done, ...dots.slice(current)]
      .map((dot, index) => (index === 0 ? dot : `<i class="phase-link is-done"></i>${dot}`))
      .join("")
  }
  return dots
    .map((dot, index) =>
      index === 0 ? dot : `<i class="phase-link${index <= current ? " is-done" : ""}"></i>${dot}`,
    )
    .join("")
}

function stripInner(strip, phases) {
  const name =
    strip.current >= phases.length
      ? `<span class="strip-name is-plain">${phases.length}フェーズすべて済み</span>`
      : `<span class="strip-name">${phases[strip.current]}</span>`
  const state = {
    作業中: "var(--accent)",
    答え待ち: "var(--warn)",
    完了: "var(--ok)",
    失敗: "var(--ng)",
  }[strip.state]
  // 作り直した形では、数が何の数かを言い、開閉の印をほかの畳みと同じ向きにする。
  const steps = goal
    ? `${icon("chevron-right", " icon-sm")}手順 ${strip.steps}件`
    : `手順 ${strip.steps}${icon("chevron", " icon-sm")}`
  return `
    <span class="strip-state" style="--state: ${state}">${strip.state}</span>
    <span class="strip-phases">${stripDots(phases.length, strip.current, strip.asking === true)}</span>
    ${name}
    <span class="strip-time">${strip.time[0]}<b>${strip.time[1]}</b></span>
    <button class="strip-steps" type="button">${steps}</button>`
}

function buildStrip() {
  one("#strip").innerHTML = stripInner(
    STRIP[moment],
    PHASES.map((phase) => phase.name),
  )
}

function buildLane() {
  const report = '<p class="lane-sub is-current"><span>レポート</span><b>1/4 今の一覧を…</b></p>'
  const sub = {
    work: [report],
    ask: [report],
    fail: [report],
    late: ['<p class="lane-sub is-current"><span>レポート</span><b>3/4 画面に反映…</b></p>'],
    read: [
      // 見出しを移るキーは、見出しの並びの頭の行に置く（作り直した形）。
      `<p class="lane-sub is-current"><span>最終</span><b>タスク一覧の…</b>${goal ? '<span class="lane-keys"><kbd class="key">{</kbd><kbd class="key">}</kbd></span>' : ""}</p>`,
      '<p class="lane-sub"><span>並び順は端末ごとに保存…</span></p>',
      '<p class="lane-sub"><span>ほかの端末には引き継…</span></p>',
    ],
  }[moment]
  one("#lane-turns").innerHTML =
    `<li class="lane-turn"><p class="lane-title">タスク一覧の並び替えを…</p>${sub.join("")}</li>`
  if (goal) {
    // キーの手掛かりを、効く場所に見える形で出す。
    one("#lane-keys").innerHTML = '<kbd class="key">[</kbd><kbd class="key">]</kbd>'
  }
}

// 入力欄の上の1行から、待っている用件（お伺いの選択肢・お願い）へ移る口。
// キーは、入力欄が空のときの ↑。文字を打っている最中のカーソルの移動とぶつからない。
function jumpButton(label) {
  return `<button class="quiet-button" type="button">${label}<kbd class="key">↑</kbd><span class="jump-note">入力欄が空のとき</span></button>`
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
    if (goal) {
      draft.placeholder = `${pack.name} への補足を書く`
    }
  }
  if (moment === "ask") {
    draft.placeholder = "選択肢以外の答えを書く…"
    band.hidden = false
    const told = `<span>${pack.name} が質問しています。選択肢から選ぶか、ここに書いて答えられます</span>`
    band.innerHTML = goal
      ? `${told}${jumpButton("選択肢へ")}`
      : has("spec")
        ? told
        : `<span>↓ ${pack.name} が質問しています。下の選択肢から選ぶか、ここに書いて答えてください</span><button class="pill-button" type="button">お伺いへ</button>`
    root.style.setProperty("--dock-h", has("spec") ? "148px" : "165px")
  }
  if (moment === "read" && !atEnd) {
    band.hidden = false
    band.innerHTML = goal
      ? `<span>お願いが1件あります</span>${jumpButton("お願いへ")}`
      : '<span>お願いが1件あります</span><button class="pill-button" type="button">レポートの末尾へ</button>'
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
  const portrait = one("#portrait")
  if (portrait !== null) {
    const expression = {
      work: "default",
      ask: "curious",
      late: "default",
      read: "proud",
      fail: "flustered",
    }[moment]
    portrait.src = `../../../../characters/${packId}/${expression}.png`
  }
}

function markBar() {
  for (const bar of document.querySelectorAll(".mock-bar-group")) {
    const name = bar.dataset.param
    for (const link of bar.querySelectorAll("a")) {
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
if (one("#flow") !== null) {
  buildStrip()
  buildLane()
  buildFlow()
  buildDock()
  markBar()

  // 流れの出だしの位置。働く・答えるは末尾、読むは頭（at=end なら末尾のお願い）。up=1 は上へ送って読んでいる状態。
  // scroll-initial-target が無いブラウザでは、同じ位置へ手で送る。
  const target = scrolledUp ? null : document.querySelector(".scroll-target")
  if (scrolledUp) {
    for (const marked of document.querySelectorAll(".scroll-target")) {
      marked.classList.remove("scroll-target")
    }
    one("#scroller").scrollTop = 0
  } else if (target !== null && !CSS.supports("scroll-initial-target", "nearest")) {
    target.scrollIntoView({ block: "end" })
  }
}
