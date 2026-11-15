// 最終レポートの3つの形の比較ページ。形ごとの文と数を一覧で持ち、見本（index.html）を縮小して並べる。
// 数は 1400×900 の見本を実ブラウザで開いて測った値（2026-11-15。段3 の形）。

const NOW_URL = "../report-progress-2026-11-15/index.html?plan=tail&moment=read"

// 題材ごとの数。figure は最初の1画面の図の割合（%）、claims は最初の1画面に入る主張の数、
// chars は最初の1画面の字数、lead は結論から主の図までの距離、paper は紙の長さ、turn は紙の上端から用件まで。
const NOW = { figure: 0, claims: 0, chars: 334, lead: null, paper: 938, turn: 740 }

const FORMS = [
  {
    id: "pair",
    no: "A",
    name: "前と後",
    idea: "紙の中身を「前 → 後」の対で組む。最初の1画面は、いちばん効いた変化の前後の画。続きも「前｜後」の行で並べ、変えていないことを1節に置く。判断の報告では「今｜採ったあと」になる。",
    work: { figure: 38, claims: 1, chars: 300, lead: 113, paper: 1788, turn: 1367 },
    decide: { figure: 28, claims: 2, chars: 334, lead: 113, paper: 1386, turn: 1096 },
    sign: "見比べ方の切り替え（並べる・後だけ・前だけ）が、紙の全部の対に一度に効く",
    pros: [
      "最初の1画面の図の割合が、3つの中でいちばん大きい",
      "変わった所が大きな画で読める（画の中の字は 12px 以上）",
      "以前好評だった前後の画の並置を、紙の骨組みにする",
      "本文は1列のままで、今の Compare を主役に据えるだけで組める",
    ],
    cons: [
      "紙がいちばん長く、用件までの距離も遠い（入力欄の上の知らせで飛ぶ前提）",
      "最初の1画面に入る主張は1〜2つ",
      "変化の無い報告（調べもの・状態）は「今｜分かったこと」への読み替えが要る",
    ],
    links: [
      ["末尾の「あなたの番」まで送った形", "at=end"],
      ["段1 の形", "lv=1"],
    ],
  },
  {
    id: "board",
    no: "B",
    name: "一目の盤",
    idea: "最初の1画面を、主張ごとの区画の盤にする。区画は主張の見出しと小さな図。押すとその場で横いっぱいに開き、大きな図と裏づけが出る。区画は箱にせず、罫だけで分ける。",
    work: { figure: 33, claims: 5, chars: 304, lead: 107, paper: 1168, turn: 747 },
    decide: { figure: 26, claims: 4, chars: 311, lead: 83, paper: 894, turn: 604 },
    sign: "区画を押すと、ほかの区画が場所を譲りながら、その場で横いっぱいに開く",
    pros: [
      "最初の1画面に入る主張がいちばん多く、のぞいたときに全体が分かる",
      "用件までの距離がいちばん近い",
      "小さな図（前後の画・通り道・数・ファイル）が1画面に並ぶ",
    ],
    cons: [
      "小さい画は字が線になり、読むには開く手が要る",
      "詳しい中身は開くまで出ない（節を既定で畳まない、とした以前の決定に当たる）",
      "カード中心の意匠を採らなかった 11月1日の決定に近い形になる",
      "書き手が、区画の大きさと並びを選ぶ負担が増える",
    ],
    links: [["区画を全部ひらいた形", "open=all"]],
  },
  {
    id: "ledger",
    no: "C",
    name: "裏づけの台帳",
    idea: "紙の骨組みを主張の行にする。行は、印・主張・小さな裏づけ・控え。確かめていない行を先頭で開き、行を開くと裏づけそのもの（画・図・出力）が出る。",
    work: { figure: 4, claims: 3, chars: 361, lead: 262, paper: 1172, turn: 751 },
    decide: { figure: 1, claims: 4, chars: 387, lead: null, paper: 928, turn: 638 },
    sign: "「確かめが要る」に絞ると、申告のみ・やっていないの行だけが残る",
    pros: [
      "何が確かめられていて何がまだかが、最初の1画面で分かる",
      "案2 の確かさの台帳の延長で、いまの方向と地続きになる",
      "行が短く、主張だけを拾い読みできる",
    ],
    cons: [
      "最初の1画面の図の割合がいちばん小さく、図が主体にならない",
      "図は行を開くまで小さい（判断の題材では、開くまで主の図が出ない）",
      "表と一覧に偏る今の癖を、そのまま受ける形になる",
    ],
    links: [["行を全部ひらいた形", "open=all"]],
  },
]

const PATH = [
  ["今", "案2 の見本。文と表だけで、図の割合は 0%", NOW_URL],
  ["段1", "結論の下に主の図が入る。図の割合 37%", "index.html?form=pair&lv=1"],
  ["段2", "主張に印と控えが付き、変わった所を囲む。確かさの一覧は頭から外れる", "index.html?form=pair&lv=2"],
  ["段3", "見比べ方を切り替え、用件は結果の画つきの札で選ぶ", "index.html?form=pair&lv=3"],
]

const TOPICS = [
  [
    "構成",
    "結論 → 裏づけの帯 → 主張ごとの組 → 変えていないこと → やっていないこと → あなたの番。節の見出しは主張の文にする。",
    "主の図は前後の対。続きは「名前｜前｜後」の行",
    "主張を盤の区画に並べる。並びは重さの順",
    "主張を台帳の行に並べる。確かめていない行が先",
  ],
  [
    "レイアウト",
    "本文は1列のまま。図は紙の幅いっぱい、文は 42em まで。文と図を左右に分けない。",
    "対は2つ並べる。片方だけにすると 460px までに収める",
    "6列の格子（4＋2、2＋2＋2、6）。開いた区画は横いっぱい",
    "行は「印・主張・小さな裏づけ」の3列",
  ],
  [
    "利用者の操作",
    "出力の覗き見（押すと控えのそばに開き、Esc で閉じる）。押すと下書きが入るボタン。",
    "見比べ方の切り替えが、紙の全部の対に効く",
    "区画の開閉と「全部ひらく」。動きをつないで場所の入れ替わりを追える",
    "行の開閉と、確かめが要る行への絞り込み",
  ],
  [
    "次の行動の示し方",
    "いちばん下の「あなたの番」。用件ごとに段を分け、決める用件は結果の画つきの札、確かめる用件は「鳴った・鳴らなかった」。主の札は1つ、続きの提案は2つまで。押しても送らない。",
    "3つとも同じ",
    "3つとも同じ",
    "3つとも同じ（確かめる用件は、台帳の先頭の行と対になる）",
  ],
  [
    "図が主体の書き方",
    "主の図の型を報告の種類で決める。見出しに主張、図に直接のラベル、凡例は強調の1色だけ、注記は図のすぐ下に2行まで。差が小さい数は棒にせず、増えた分だけを粒で数える。",
    "図の割合 38%（作業）・28%（判断）",
    "図の割合 33%（作業）・26%（判断）",
    "図の割合 4%（作業）・1%（判断）",
  ],
  [
    "色",
    "状態（通った・要る・落ちた）、強調の1色（変わった所・後・採る案）、灰（前・文脈）の3役。状態は必ず記号と語を添える。増減の数を緑と赤で塗らない。",
    "「後」と変わった所が強調の色",
    "採る案の列と、足した所が強調の色",
    "印の3種を、塗り・中抜き・破線で言い分ける",
  ],
  [
    "ほか",
    "変えていないことを1節に置く。やっていないことの欄を常に置く。裏づけの印は、書き手の申告ではなく、走らせた記録との照合で付ける。",
    "紙が長いので、目次（やり取りの列）に主張を並べる",
    "目次は「一目の盤」の1行になる",
    "目次は「裏づけの台帳」の1行になる",
  ],
]

const TROUBLE = [
  ["表に偏る", "Table を含むレポートが 78%、配置の部品は 0.5%、図を置いた回は 12〜18%（部品の使用の記録から写した値）", "主の図を種類で先に置き、表は裏づけの側へ回す"],
  ["figure の欄", "1枚だけ・任意で、返す操作も目次の行も付かない", "図を主張ごとの組に入れ、ほかの部品と同じに指せるようにする"],
  ["確かさが2か所", "checks（頭）と Claims（本文）に分かれ、証拠の画や出力とは結ばれていない", "主張ごとの印と控えに一本化する"],
  ["読まれない欄", "task.genre・figureNone・Row の justify／align／weight・ChoicePicker の displayStyle／filterable は、受け付けるが描画で読まない", "種類は主の図の決め手に使い、読まない欄は定義から外す"],
  ["お願いの欄", "差し色の地と左 3px の罫。件数の印「お願い 1 ↓」は固定の字", "「あなたの番」の欄へ移し、件数は数える"],
  ["Note の ask", "「疑問」の札になるだけで、操作が付かない", "利用者が動く用件は「あなたの番」へ寄せる"],
  ["Tabs", "tablist の役割だけで、tab と tabpanel の役割が無い", "役割を足す（形の見直しとは別に直せる）"],
  ["Chart の高さ", "項目の数に関わらず 320px", "項目の数で決める（棒3本なら 100px ほど）"],
  ["同じ情報の置き場", "終わり方が3か所、段の所要が4か所に出る", "案2 のとおり、判定は帯、所要は「手順」の一覧へ寄せる"],
]

const PARTS = [
  ["主張と図の組", "見出し（主張）・図・注記の3点", "今の Section の並びを決めるだけで、新しい型は要らない", "段1"],
  ["前と後の行", "「名前｜前｜後」を行で並べる", "今は Table のセルの前→後と、Compare に分かれている", "段1"],
  ["変えていないこと・やっていないこと", "決まった見出しの2つの欄", "今は結論の2文目か、書き手の裁量", "段1・段2"],
  ["裏づけの印と控え", "記録あり・申告のみ・やっていない＋走らせたもの・数・時刻", "tsukumo が検証の控えと照らして付ける。書き手に申告させない", "段2"],
  ["裏づけの帯", "主張の数だけ目盛りを並べる", "今は「1件 通った」などの札の並び", "段2"],
  ["差の囲み", "前後の画を機械で比べ、変わった所を囲む", "画像に番号の丸を置かない決定（座標を書かせない）を守れる", "段2"],
  ["用件の札", "結果の画つきの選択・「確かめた／違った」", "今の「次の一手」は、tsukumo が材料から起こす4種だけ", "段3"],
  ["盤の区画", "主張と小さな図の区画。開くと横いっぱい", "案B を選んだときだけ要る", "段1（案B）"],
]

const COLORS = [
  ["落ちた", "#f2a0a0", "#ef6b6b", "差し色の既定 #f2b0a0 との差が 4.0 → 15.3。唐傘のパックの差し色 #ff9e9e とは 2.1 → 11.9 で、色だけでは足りないので記号と語を必ず添える"],
  ["通った・記録あり", "#7ee081", "#5fd38a", "「要る」との差が 12.6 → 17.9。つくものパックの差し色 #6fe3cd との差は 9.5 → 9.2 で近いままなので、紙の中で差し色を使わない"],
  ["要る・申告のみ・あなたの番", "#e3c766", "#f2b544", "「通った」との差が 12.6 → 17.9"],
  ["強調の1色（変わった所・後・採る案）", "無い（系列色が6色）", "#5b9bf0", "系列色の5色は状態の色と近い（系列2 と落ちた 4.0、系列1 と情報 4.1、系列3 と疑問 2.2、系列6 と注意 5.6、系列4 と通った 8.7）。図は灰と強調の1色を既定にする"],
  ["前・文脈", "系列色か字の色", "字の色の 34%（灰）", "強調の色を1つに絞るために、ほかを灰へ落とす"],
  ["情報・疑問", "#9cc1ee・#c7aef0", "色を持たせない", "系列色と見分けられない。語と記号で言う"],
  ["増減の数（＋・−）", "緑と赤", "強調の色と灰", "足した行は「通った」ではなく、消した行は「落ちた」ではない"],
  ["差し色", "お願いの地と罫・段の帯・変更の印", "紙の中では使わない", "差し色はパックごとに替わり、状態の色と近い組がある"],
]

const PAST = [
  ["主張と図の対を縦に並べる", "見本にしなかった形", "3つに共通の決まり（主張の見出し・図・注記）に入れた"],
  ["触った所を地図で見せる", "見本にしなかった形", "作業の報告にしか効かない。前と後の対のほうが、変化そのものを見せられる"],
  ["読む深さの3段（一目・本文・記録）", "見本にしなかった形", "11月15日に「採らない」と決めた形。1本の流れでは畳む得が無い"],
  ["用件を先頭に置く", "見本にしなかった形", "「利用者が動く用件は最下部」の決定に当たる"],
  ["本文は1列・文と図を左右に分けない", "守った決定", "3つとも1列。対と格子は図の中だけ"],
  ["用件は最下部・押しても送らない", "守った決定", "3つとも「あなたの番」はいちばん下で、ボタンは下書きを入れるだけ"],
  ["画像の上に番号の丸を置かない", "守った決定", "変わった所は、機械で比べた差の囲みで示す"],
  ["部品は減らさない・自由な HTML は載せない", "守った決定", "足す部品は7つ（案B は8つ）で、減らす部品は無い"],
  ["節を既定で畳まない・カード中心の意匠は採らない", "当たる所", "案B が当たる。区画は箱にせず罫で分けたが、詳しい中身は開くまで出ない"],
  ["「レポートの内容部品は変えない」（ADR 0058）", "当たる所", "3つとも当たる。採るなら ADR 0058 への追記が要る"],
  ["色は意味にだけ・読む面はキャラクターの色を受けない", "強めた決定", "お願いの地・段の帯・変更の印に残っていた差し色を、紙の中から外す"],
]

const CONTROLS = {
  genre: ["work", "decide"],
  lv: ["3", "2", "1"],
  cols: ["3", "2", "1"],
}

const params = new URLSearchParams(location.search)
const state = Object.fromEntries(
  Object.entries(CONTROLS).map(([name, allowed]) => {
    const value = params.get(name)
    return [name, allowed.includes(value) ? value : allowed[0]]
  }),
)

function sampleUrl(id) {
  return `index.html?form=${id}&lv=${state.lv}&genre=${state.genre}`
}

function listItems(lines) {
  return lines.map((line) => `<li>${line}</li>`).join("")
}

function frame(title, label) {
  return `<div class="frame">
      <iframe title="${title}" loading="lazy" tabindex="-1"></iframe>
      <a class="frame-link" target="_blank" rel="noopener" aria-label="${label}"></a>
    </div>`
}

function card(form) {
  const links = form.links.map(
    ([label, query]) => `<a href="index.html?form=${form.id}&${query}" target="_blank" rel="noopener">${label}</a>`,
  )
  return `
    <article class="card" data-id="${form.id}">
      <header class="card-head">
        <span class="letter">${form.no}</span>
        <h2>${form.name}</h2>
      </header>
      ${frame(`案${form.no} の見本`, `案${form.no}（${form.name}）を実寸で開く`)}
      <p class="idea">${form.idea}</p>
      <p class="sign"><b>この形だけの操作</b>${form.sign}</p>
      <p class="card-links">${links.join("")}</p>
      <dl class="facts" data-facts></dl>
      <div class="judge">
        <section><h3>長所</h3><ul>${listItems(form.pros)}</ul></section>
        <section><h3>短所</h3><ul>${listItems(form.cons)}</ul></section>
      </div>
    </article>`
}

function facts(form) {
  const numbers = form[state.genre]
  return `
    <div><dt>最初の1画面の図</dt><dd>${numbers.figure}%</dd></div>
    <div><dt>最初の1画面の主張</dt><dd>${numbers.claims}つ</dd></div>
    <div><dt>結論から主の図まで</dt><dd>${numbers.lead === null ? "開くまで出ない" : `${numbers.lead}px`}</dd></div>
    <div><dt>紙の長さ</dt><dd>${numbers.paper.toLocaleString("ja-JP")}px</dd></div>
    <div><dt>用件まで</dt><dd>${numbers.turn.toLocaleString("ja-JP")}px</dd></div>`
}

// 列ごとにいちばん良い値を太字にする（今の見本は比べる相手なので、太字の対象に入れない）。
function cell(genre, form, key, { unit, better }) {
  const values = FORMS.map((other) => other[genre][key]).filter((value) => value !== null)
  const best = better === "max" ? Math.max(...values) : Math.min(...values)
  const value = form[genre][key]
  if (value === null) {
    return `<td class="num">—</td>`
  }
  const text = `${value.toLocaleString("ja-JP")}${unit}`
  return value === best ? `<td class="num"><b>${text}</b></td>` : `<td class="num">${text}</td>`
}

function numberRow(genre, form) {
  return `
    <tr>
      <th scope="row"><span class="letter">${form.no}</span>${form.name}</th>
      ${cell(genre, form, "figure", { unit: "%", better: "max" })}
      ${cell(genre, form, "claims", { unit: "つ", better: "max" })}
      ${cell(genre, form, "chars", { unit: "字", better: "min" })}
      ${cell(genre, form, "lead", { unit: "px", better: "min" })}
      ${cell(genre, form, "paper", { unit: "px", better: "min" })}
      ${cell(genre, form, "turn", { unit: "px", better: "min" })}
    </tr>`
}

const cards = document.querySelector("#cards")
cards.innerHTML = FORMS.map(card).join("")

document.querySelector("#path").innerHTML = PATH.map(
  ([name, text, url]) => `<li class="path-step" data-url="${url}">
      ${frame(`${name}の見本`, `${name}の見本を実寸で開く`)}
      <p><b>${name}</b>${text}</p>
    </li>`,
).join("")

function table(id, head, rows) {
  document.querySelector(id).innerHTML = `
    <thead><tr>${head.map((text) => `<th scope="col">${text}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(([name, ...cells]) => `<tr><th scope="row">${name}</th>${cells.map((text) => `<td>${text}</td>`).join("")}</tr>`).join("")}</tbody>`
}

table("#topics", ["観点", "3つに共通（方針）", "案A 前と後", "案B 一目の盤", "案C 裏づけの台帳"], TOPICS)
table("#trouble", ["今の部品の問題", "今の形", "見直し"], TROUBLE)
table("#parts", ["足す部品", "形", "今との違い", "入る段"], PARTS)
table(
  "#colors",
  ["役割", "今", "見本の値", "わけ"],
  COLORS.map(([name, now, next, why]) => [name, swatch(now), swatch(next), why]),
)
table("#past", ["形・決定", "扱い", "わけ"], PAST)

function swatch(text) {
  const codes = text.match(/#[0-9a-f]{6}/giu) ?? []
  return `${codes.map((code) => `<span class="swatch" style="background: ${code}"></span>`).join("")}${text}`
}

function renderNumbers() {
  const nowRow = `
    <tr>
      <th scope="row">今の見本（案2）</th>
      <td class="num">${NOW.figure}%</td><td class="num">${NOW.claims}つ</td><td class="num">${NOW.chars}字</td>
      <td class="num">—</td><td class="num">${NOW.paper}px</td><td class="num">${NOW.turn}px</td>
    </tr>`
  document.querySelector("#summary").innerHTML = `
    <thead>
      <tr>
        <th scope="col">形（${state.genre === "work" ? "作業の報告" : "判断の報告"}・段3）</th>
        <th scope="col">最初の1画面の図</th>
        <th scope="col">最初の1画面の主張</th>
        <th scope="col">最初の1画面の字数</th>
        <th scope="col">結論から主の図まで</th>
        <th scope="col">紙の長さ</th>
        <th scope="col">用件まで</th>
      </tr>
    </thead>
    <tbody>${state.genre === "work" ? nowRow : ""}${FORMS.map((form) => numberRow(state.genre, form)).join("")}</tbody>`
  for (const holder of cards.querySelectorAll(".card")) {
    const form = FORMS.find((item) => item.id === holder.dataset.id)
    holder.querySelector("[data-facts]").innerHTML = facts(form)
  }
}

// 見本は実寸の iframe を枠の幅に合わせて縮める。
function fit(holder) {
  holder.style.setProperty("--scale", String(holder.clientWidth / 1400))
}

const frames = [...document.querySelectorAll(".frame")]
const watcher = new ResizeObserver((entries) => {
  for (const entry of entries) {
    fit(entry.target)
  }
})
for (const holder of frames) {
  watcher.observe(holder)
}

function load(holder, url) {
  const sample = holder.querySelector("iframe")
  if (sample.dataset.url !== url) {
    sample.dataset.url = url
    sample.src = `${url}&bar=0`
  }
  holder.querySelector(".frame-link").href = url
  fit(holder)
}

function apply() {
  document.documentElement.style.setProperty("--cols", state.cols)
  for (const holder of cards.querySelectorAll(".frame")) {
    load(holder, sampleUrl(holder.closest(".card").dataset.id))
  }
  for (const step of document.querySelectorAll(".path-step")) {
    load(step.querySelector(".frame"), step.dataset.url)
  }
  for (const choices of document.querySelectorAll(".seg")) {
    for (const button of choices.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.value === state[choices.dataset.control]))
    }
  }
  renderNumbers()
  history.replaceState(null, "", `?${new URLSearchParams(state)}`)
}

for (const choices of document.querySelectorAll(".seg")) {
  choices.addEventListener("click", (event) => {
    const button = event.target.closest("button")
    if (button === null) {
      return
    }
    state[choices.dataset.control] = button.dataset.value
    apply()
  })
}

apply()
