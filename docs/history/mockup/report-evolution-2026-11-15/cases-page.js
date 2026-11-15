// 案A の題材の一覧のページ。題材の名前と読み方は cases.js の reportCaseList から読み、見本（index.html）を縮小して並べる。
// 数は 1400×900 の見本を実ブラウザで開いて測った値（2026-11-15。段3 の形）。

// figure は最初の1画面の図の割合（%）、claims は最初の1画面に入る主張の数、paper は紙の長さ、
// turn は紙の上端からお願いまで（お願いが無い題材は null）。
const NUMBERS = {
  work: { figure: 38, claims: 1, paper: 1788, turn: 1367 },
  decide: { figure: 28, claims: 2, paper: 1386, turn: 1096 },
  bug: { figure: 21, claims: 2, paper: 1329, turn: null },
  shape: { figure: 25, claims: 2, paper: 1265, turn: null },
  speed: { figure: 32, claims: 2, paper: 1358, turn: null },
  many: { figure: 50, claims: 1, paper: 1781, turn: 1491 },
  study: { figure: 18, claims: 2, paper: 1068, turn: 811 },
  plan: { figure: 29, claims: 2, paper: 1059, turn: 830 },
  halt: { figure: 36, claims: 1, paper: 1414, turn: 1185 },
  ask: { figure: 34, claims: 1, paper: 1017, turn: 739 },
  short: { figure: 0, claims: 0, paper: 269, turn: null },
}

const NOTES = {
  work: "いちばん効いた変化の前後の画を先頭に置き、続きを「名前｜前｜後」の行で並べる。",
  decide: "対は「今｜採ったあと」。その下に、案を並べた棒と、条件の表が続く。",
  bug: "前後の画で直ったことを先に見せ、原因は流れとコードの前後で示す。お願いは無く、続きの提案だけが末尾に出る。",
  shape: "構成図を前後で並べ、足した箱と付け替えた矢印だけを強調する。見た目を変えていないことは「変えていないこと」で言う。",
  speed: "数の対は左右に分けず、同じ軸の1枚に前と後を重ねる。測るたびの揺れは点で見せる。",
  many: "対が多いときは、下の小さな画から選んで上の対を入れ替える。紙はいちばん長くなる。",
  study: "変化が無いので対にならない。主の図は分かったことの1枚で、行を「問い｜分かったこと」に読み替える。",
  plan: "前が空なので対にならない。主の図は依存の図の1枚で、件数だけを前後の行にする。",
  halt: "対は「狙い｜今」。落ちた主張が帯の先頭に立ち、お願いは「どちらを直すか」の3択になる。",
  ask: "対は「今｜消したあと」。戻せない操作なので、お願いの札の上に注意を1つ立てる。",
  short: "図も、裏づけの帯も置かない。結論と、名前と値の3行だけで終える。",
}

const WEAK = [
  ["調べて分かった", "変化が無い", "主の図は分かったことの1枚（14 か所のうち2か所、の粒の図）。行は「問い｜分かったこと」", "粒の図の部品が今は無い。Chart の割合の図か、表で代える"],
  ["タスクに分けて積んだ", "前が空（0件）", "主の図は依存の図の1枚。前後は件数の行だけに使う", "今の Graph で描ける"],
  ["短く答えた", "見せる変化が無い", "図・裏づけの帯・変えていないこと・やっていないことを全部置かない", "今の DescriptionList で描ける"],
]

const ENDS = [
  ["お願いがある", "「お願い」の見出し、結果の画つきの札、続きの提案の順", "画面を変えた・判断・多い変更・調べもの・タスクの登録"],
  ["お願いが無く、続きの提案がある", "見出しを置かず、「このあと」の行だけ", "不具合を直した・数を良くした"],
  ["どちらも無い", "「やっていないこと」か、本文の最後の行で終わる", "構造を組み替えた・短く答えた"],
  ["止めた・戻せない操作の前", "お願いが再開に要る判断になる。戻せないときは札の上に注意を1つ", "落ちたので止めた・戻せない操作の前に聞く"],
]

const CONTROLS = {
  lv: ["3", "2", "1"],
  cols: ["3", "2", "4"],
}

const params = new URLSearchParams(location.search)
const state = Object.fromEntries(
  Object.entries(CONTROLS).map(([name, allowed]) => {
    const value = params.get(name)
    return [name, allowed.includes(value) ? value : allowed[0]]
  }),
)

const CASES = globalThis.reportCaseList

function sampleUrl(item) {
  return `index.html?form=pair&${item.query}&lv=${state.lv}`
}

function px(value) {
  return value === null ? "無い" : `${value.toLocaleString("ja-JP")}px`
}

function card(item) {
  const numbers = NUMBERS[item.id]
  const end = numbers.turn === null ? "" : `<a href="index.html?form=pair&${item.query}&at=end" target="_blank" rel="noopener">末尾の「お願い」まで送った形</a>`
  return `
    <article class="card" data-id="${item.id}">
      <header class="card-head"><h2>${item.name}</h2><span class="lead-tag">${item.lead}</span></header>
      <div class="frame">
        <iframe title="${item.name}の見本" loading="lazy" tabindex="-1"></iframe>
        <a class="frame-link" target="_blank" rel="noopener" aria-label="${item.name}の見本を実寸で開く"></a>
      </div>
      <p class="idea">${NOTES[item.id]}</p>
      ${end === "" ? "" : `<p class="card-links">${end}</p>`}
      <dl class="facts facts-4">
        <div><dt>対の見出し</dt><dd>${item.reading}</dd></div>
        <div><dt>最初の1画面の図</dt><dd>${numbers.figure}%</dd></div>
        <div><dt>紙の長さ</dt><dd>${px(numbers.paper)}</dd></div>
        <div><dt>お願いまで</dt><dd>${px(numbers.turn)}</dd></div>
      </dl>
    </article>`
}

function table(id, head, rows) {
  document.querySelector(id).innerHTML = `
    <thead><tr>${head.map((text) => `<th scope="col">${text}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(([name, ...cells]) => `<tr><th scope="row">${name}</th>${cells.map((text) => `<td>${text}</td>`).join("")}</tr>`).join("")}</tbody>`
}

const cards = document.querySelector("#cards")
cards.innerHTML = CASES.map(card).join("")

table(
  "#lead",
  ["題材", "主の図", "対の見出し", "今の部品で描くなら", "最初の1画面の図", "紙の長さ", "お願いまで"],
  CASES.map((item) => {
    const numbers = NUMBERS[item.id]
    return [item.name, item.lead, item.reading, item.parts, `${numbers.figure}%`, px(numbers.paper), px(numbers.turn)]
  }),
)
table("#weak", ["題材", "対にならないわけ", "この見本での形", "今の部品"], WEAK)
table("#ends", ["紙の末尾", "形", "当たる題材"], ENDS)

// 見本は実寸の iframe を枠の幅に合わせて縮める。
function fit(holder) {
  holder.style.setProperty("--scale", String(holder.clientWidth / 1400))
}

const frames = [...cards.querySelectorAll(".frame")]
const watcher = new ResizeObserver((entries) => {
  for (const entry of entries) {
    fit(entry.target)
  }
})
for (const holder of frames) {
  watcher.observe(holder)
}

function apply() {
  document.documentElement.style.setProperty("--cols", state.cols)
  for (const holder of frames) {
    const item = CASES.find((entry) => entry.id === holder.closest(".card").dataset.id)
    const url = sampleUrl(item)
    const sample = holder.querySelector("iframe")
    if (sample.dataset.url !== url) {
      sample.dataset.url = url
      sample.src = `${url}&bar=0`
    }
    holder.querySelector(".frame-link").href = url
    fit(holder)
  }
  for (const choices of document.querySelectorAll(".seg")) {
    for (const button of choices.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.value === state[choices.dataset.control]))
    }
  }
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
