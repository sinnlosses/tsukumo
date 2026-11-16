// 案B の仕上げのページ。決めたこと・字の大きさの前後・常設の探す欄の4つの状態・一覧モードの表と仕切りを、
// 見本（index.html?design=b2）で並べる。数は 1400×900 の見本を実ブラウザで測った値（2026-11-16）。

const SIZES = ["1400x900", "1920x1080"]

const params = new URLSearchParams(location.search)

function pick(name, allowed) {
  const value = params.get(name)
  return allowed.includes(value) ? value : allowed[0]
}

const state = { size: pick("size", SIZES) }

const DECIDED = [
  "<b>構造は案B。</b>サイドバーの一覧を「いま・つぎ・待ち・ドラフト・済み」の段に分け、1件の詳細はサイドバーの左に開くサイドシートに出す。",
  "<b>行の題は 13px。</b>2段目（待ちの相手・ID・ループ可・難しさ）とラベルは 12px。",
  "<b>探す欄はサイドバーに常設。</b>虫眼鏡の口は置かない。題と件数の行の下に欄を積む。",
  "<b><kbd>/</kbd> は探す欄に割り当てない。</b>入力欄（依頼を書く欄）へ移るキーに使う。",
  "<b>一覧モードは残す。</b>今と同じモーダルで、1行1件の表にする。列は ID・題・難しさ・ループ可の順。",
  "<b>一覧モードの一覧（概要）と詳細の境は、つまみを引いて動かせる。</b>",
]

const TYPE_CARDS = [
  {
    letter: "前",
    name: "最初の案B",
    pick: "",
    url: "index.html?design=b&view=rest",
    idea: "行の題は 14px。今のアプリの本文と同じ段で、ラベルの段（12px）で出している今のサイドバーより大きい。探す欄は、虫眼鏡を押すまで出ない。",
    facts: [
      ["行の題", "14px"],
      ["行の高さ（題が1行）", "57px"],
      ["見えるタスク", "12件中8件"],
      ["最初の着手可まで", "170px"],
    ],
  },
  {
    letter: "後",
    name: "仕上げ",
    pick: "決定",
    url: "index.html?design=b2&view=rest",
    idea: "行の題を締め、2段目とラベルは下限の 12px のまま。行の余白と印も合わせて締め、頭に探す欄を常設した。",
    facts: [
      ["行の題", "13px"],
      ["行の高さ（題が1行）", "50px"],
      ["見えるタスク", "12件中10件"],
      ["最初の着手可まで", "191px"],
    ],
  },
]

const TYPE_ROWS = [
  ["行の題", "14px", "13px"],
  ["行の2段目（待ちの相手・ID・難しさ）", "12px", "12px（下限）"],
  ["行の状態の印", "16px", "14px"],
  ["サイドバーの見出し", "13px", "12px"],
  ["行の高さ（題が1行）", "57px", "50px"],
  ["サイドバーの頭の高さ", "44px（探す欄なし）", "78px（探す欄を常設）"],
  ["スクロールなしで見えるタスク", "12件中8件", "12件中10件"],
  ["上端から最初の着手可まで", "170px", "191px"],
  ["サイドシートの幅", "520px", "480px"],
  ["サイドシートの題", "20px", "17px"],
  ["サイドシートの本文", "15px", "14px"],
  ["主ボタン（頼む口）", "高さ 34px・字 14px", "高さ 30px・字 13px"],
]

const SEARCH_STEPS = [
  {
    view: "rest",
    name: "通常",
    text: "欄は常に出ている。虫眼鏡の口は無く、頭の口は最新化と一覧を見るの2つ。",
  },
  {
    view: "search",
    name: "欄にフォーカス",
    text: "欄を押すと、欄に枠が付く。一覧は全件のままで、頭の高さも変わらない。",
  },
  {
    view: "typed",
    name: "入力中",
    text: "ID・題・本文の部分一致で、段ごとに絞る。当たった語を強調し、欄の右端に件数と × が出る。当たりの無い段は出さず、済みの段は開く。↑↓ の位置は最初の当たりから始まる。",
  },
  {
    view: "none",
    name: "当たりなし",
    text: "段を出さず、探した範囲を1文で言う。× か <kbd>Esc</kbd> で語を消すと全件に戻る。",
  },
]

const SEARCH_KEYS = [
  ["欄を押す", "欄にフォーカスを移す（欄へ移るキーは持たない。<kbd>/</kbd> は入力欄へ移るキー）"],
  ["文字を入力する", "入力のたびに絞る（今のモーダルの検索と同じ規則で、ID・題・本文の部分一致）"],
  ["<kbd>↑</kbd> <kbd>↓</kbd>", "当たりの行を移動する。フォーカスは欄に残す"],
  ["<kbd>Enter</kbd>", "選んでいる行のサイドシートを開く。変換中の Enter は確定に使い、開かない"],
  ["<kbd>Esc</kbd>", "語があれば語を消す。語が空なら、フォーカスを入力欄（依頼を書く欄）へ戻す"],
  ["欄の ×", "語を消す。フォーカスは欄に残す"],
  ["「一覧を見る」を押す", "語を引き継いで一覧モードを開く"],
  ["再読み込み", "語は保存しない（今の絞り込みと同じ扱い）"],
]

const LIST_CARDS = [
  {
    letter: "表",
    name: "既定の幅",
    pick: "決定",
    url: "index.html?design=b2&view=list",
    idea: "列は ID・題・難しさ・ループ可の順。状態の印は ID の前に置き、待ちの相手は列にせず題の後ろに添える（サイドバーの行と同じ「待ち T-104」の語）。一覧と詳細のあいだの細い線が仕切りで、中央のつまみを引く。",
    facts: [
      ["見えるタスク", "15件中15件"],
      ["行の高さ", "30px"],
      ["一覧の幅", "791px"],
      ["詳細の幅", "440px"],
    ],
  },
  {
    letter: "幅",
    name: "つまみで詳細を広げた状態",
    pick: "",
    url: "index.html?design=b2&view=list&split=wide",
    idea: "つまみを左へ引くと詳細が広がり、一覧が狭まる。一覧が狭いあいだ、題は末尾を省略して1行のまま保つ。幅は覚えておき、次に開いたときも同じ位置にする（今のモーダルの仕切りと同じ扱い）。",
    facts: [
      ["見えるタスク", "15件中15件"],
      ["行の高さ", "30px"],
      ["一覧の幅", "611px"],
      ["詳細の幅", "620px"],
    ],
  },
]

const OPEN_ITEMS = [
  "<b>狭い幅（760px 以下）。</b>見本は 1400×900 と 1920×1080 だけ。狭い幅では、行を押すとサイドシートではなく一覧モード（今の狭い幅のモーダルの形）でそのタスクを開く。",
  "<b>中間の幅（761〜1100px）の柱。</b>今の形（開く口と進行中の件数）のままにする。",
  "<b>ドラフトの分類。</b>サイドシートに置く（ドラフトの段の「仕分ける」から開く）。一覧モードには置かない。",
  "<b>探す欄のキーの動き。</b>見本は状態ごとの静止した画で、↑↓・Enter・Esc は動かない。",
]

function listItems(lines) {
  return lines.map((line) => `<li>${line}</li>`).join("")
}

function card(item) {
  return `
    <article class="card" data-url="${item.url}">
      <header class="card-head">
        <span class="letter">${item.letter}</span>
        <h2>${item.name}</h2>
        ${item.pick === "" ? "" : `<span class="pick" data-pick="best">${item.pick}</span>`}
      </header>
      <div class="frame">
        <iframe title="${item.name} の見本" loading="lazy" tabindex="-1"></iframe>
        <a class="frame-link" target="_blank" rel="noopener" aria-label="${item.name} を実寸で開く"></a>
      </div>
      <p class="idea">${item.idea}</p>
      <dl class="facts">${item.facts.map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join("")}</dl>
    </article>`
}

/** サイドバーの範囲だけを実寸で切り出した1枚。 */
function step(item, index) {
  const url = `index.html?design=b2&view=${item.view}`
  return `<li class="step">
    <div class="clip">
      <iframe title="${item.name} の見本" src="${url}&bar=0" loading="lazy" tabindex="-1"></iframe>
      <a class="frame-link" href="${url}" target="_blank" rel="noopener" aria-label="${item.name} を実寸で開く"></a>
    </div>
    <h3><span class="letter">${index + 1}</span>${item.name}</h3>
    <p>${item.text}</p>
  </li>`
}

document.querySelector("#decided-list").innerHTML = listItems(DECIDED)
document.querySelector("#type-cards").innerHTML = TYPE_CARDS.map(card).join("")
document.querySelector("#type-table").innerHTML = `
  <thead><tr><th scope="col">部位</th><th scope="col">最初の案B</th><th scope="col">仕上げ</th></tr></thead>
  <tbody>${TYPE_ROWS.map(([name, before, after]) => `<tr><th scope="row">${name}</th><td>${before}</td><td>${after}</td></tr>`).join("")}</tbody>`
document.querySelector("#search-strip").innerHTML = SEARCH_STEPS.map(step).join("")
document.querySelector("#search-keys").innerHTML = `
  <thead><tr><th scope="col">操作</th><th scope="col">挙動</th></tr></thead>
  <tbody>${SEARCH_KEYS.map(([key, text]) => `<tr><th scope="row">${key}</th><td>${text}</td></tr>`).join("")}</tbody>`
document.querySelector("#list-cards").innerHTML = LIST_CARDS.map(card).join("")
document.querySelector("#open-list").innerHTML = listItems(OPEN_ITEMS)

function sampleSize() {
  const [width, height] = state.size.split("x").map(Number)
  return { width, height }
}

// 見本は実寸の iframe を枠の幅に合わせて縮める。
function fit(frame) {
  frame.style.setProperty("--scale", String(frame.clientWidth / sampleSize().width))
}

const frames = [...document.querySelectorAll(".frame")]
const watcher = new ResizeObserver((entries) => {
  for (const entry of entries) {
    fit(entry.target)
  }
})
for (const frame of frames) {
  const url = frame.closest(".card").dataset.url
  frame.querySelector("iframe").src = `${url}&bar=0`
  frame.querySelector(".frame-link").href = url
  watcher.observe(frame)
}

function apply() {
  const { width, height } = sampleSize()
  const root = document.documentElement
  root.style.setProperty("--sample-w", String(width))
  root.style.setProperty("--sample-h", String(height))
  for (const frame of frames) {
    fit(frame)
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
