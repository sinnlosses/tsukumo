// 案B の仕上げのページ。字の大きさの前後・常設の探す欄の4つの状態・頭の2つの形・一覧モードの表を、見本（index.html?design=b2）で並べる。
// 数は 1400×900 の見本を実ブラウザで測った値（2026-11-16）。題の字の大きさ（?type）と頭の形（?head）で変わる数は、組み合わせごとに持つ。

const TYPES = ["13", "12"]
const HEADS = ["stack", "inline"]
const SIZES = ["1400x900", "1920x1080"]

const params = new URLSearchParams(location.search)

function pick(name, allowed) {
  const value = params.get(name)
  return allowed.includes(value) ? value : allowed[0]
}

const state = { type: pick("type", TYPES), head: pick("head", HEADS), size: pick("size", SIZES) }

// サイドバーの通常の場面の実測値。鍵は「題の字の大きさ-頭の形」。
const MEASURED = {
  "13-stack": { title: "13px", rowHeight: "50px", head: "78px", shown: "12件中10件", toReady: "191px" },
  "13-inline": { title: "13px", rowHeight: "50px", head: "40px", shown: "12件中11件", toReady: "153px" },
  "12-stack": { title: "12px", rowHeight: "49px", head: "78px", shown: "12件中10件", toReady: "190px" },
  "12-inline": { title: "12px", rowHeight: "49px", head: "40px", shown: "12件中11件", toReady: "152px" },
}

function measured() {
  return MEASURED[`${state.type}-${state.head}`]
}

/** 仕上げの見本の URL。字の大きさと頭の形は、上部の切り替えの値を引き継ぐ。 */
function refinedUrl(view, head = state.head) {
  return `index.html?design=b2&view=${view}&type=${state.type}&head=${head}`
}

function typeCards() {
  const after = measured()
  return [
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
      pick: `題 ${after.title}・頭 ${state.head === "stack" ? "2行" : "1行"}`,
      url: refinedUrl("rest"),
      idea: "行の題を締め、2段目とラベルは下限の 12px のまま。行の余白と印も合わせて締め、頭に探す欄を常設した。",
      facts: [
        ["行の題", after.title],
        ["行の高さ（題が1行）", after.rowHeight],
        ["見えるタスク", after.shown],
        ["最初の着手可まで", after.toReady],
      ],
    },
  ]
}

function typeRows() {
  const after = measured()
  return [
    ["行の題", "14px", after.title],
    ["行の2段目（待ちの相手・ID・難しさ）", "12px", "12px（下限）"],
    ["行の状態の印", "16px", "14px"],
    ["サイドバーの見出し", "13px", state.head === "stack" ? "12px" : "画面には出さない（読み上げには残す）"],
    ["行の高さ（題が1行）", "57px", after.rowHeight],
    ["サイドバーの頭の高さ", "44px（探す欄なし）", `${after.head}（探す欄を常設）`],
    ["スクロールなしで見えるタスク", "12件中8件", after.shown],
    ["上端から最初の着手可まで", "170px", after.toReady],
    ["サイドシートの幅", "520px", "480px"],
    ["サイドシートの題", "20px", "17px"],
    ["サイドシートの本文", "15px", "14px"],
    ["主ボタン（頼む口）", "高さ 34px・字 14px", "高さ 30px・字 13px"],
  ]
}

const SEARCH_STEPS = [
  {
    view: "rest",
    name: "通常",
    text: "欄は常に出ている。右端の <kbd>/</kbd> は、欄へ移るキーの案内。虫眼鏡の口は無く、頭の口は最新化と一覧を見るの2つ。",
  },
  {
    view: "search",
    name: "欄にフォーカス",
    text: "欄を押すか <kbd>/</kbd> を打つと、欄に枠が付く。一覧は全件のままで、頭の高さも変わらない。",
  },
  {
    view: "typed",
    name: "入力中",
    text: "ID・題・本文の部分一致で、段ごとに絞る。当たった語を強調し、欄の右端は件数と × に替わる。当たりの無い段は出さず、済みの段は開く。↑↓ の位置は最初の当たりから始まる。",
  },
  {
    view: "none",
    name: "当たりなし",
    text: "段を出さず、探した範囲を1文で言う。× か <kbd>Esc</kbd> で語を消すと全件に戻る。",
  },
]

const SEARCH_KEYS = [
  ["欄を押す・<kbd>/</kbd>", "欄にフォーカスを移す"],
  ["文字を入力する", "入力のたびに絞る（今のモーダルの検索と同じ規則で、ID・題・本文の部分一致）"],
  ["<kbd>↑</kbd> <kbd>↓</kbd>", "当たりの行を移動する。フォーカスは欄に残す"],
  ["<kbd>Enter</kbd>", "選んでいる行のサイドシートを開く。変換中の Enter は確定に使い、開かない"],
  ["<kbd>Esc</kbd>", "語があれば語を消す。語が空なら、フォーカスを入力欄（依頼を書く欄）へ戻す"],
  ["欄の ×", "語を消す。フォーカスは欄に残す"],
  ["「一覧を見る」を押す", "語を引き継いで一覧モードを開く"],
  ["再読み込み", "語は保存しない（今の絞り込みと同じ扱い）"],
]

const HEAD_STEPS = [
  {
    head: "stack",
    name: "2行に積む",
    text: "題「タスク」と件数の行の下に、欄を置く。頭の高さは 78px、見えるタスクは12件中10件。題と総件数が常に読める。",
  },
  {
    head: "inline",
    name: "1行にまとめる",
    text: "欄と2つの口を1行に置き、題は画面に出さない（欄の薄い字「タスクを探す」が題の代わりになり、読み上げには題を残す）。頭の高さは 40px、見えるタスクは12件中11件。総件数は出ない（段ごとの件数は出る）。",
  },
]

function listCards() {
  return [
    {
      letter: "表",
      name: "1行1件の表",
      pick: "採用",
      url: `index.html?design=b2&view=list&type=${state.type}&head=${state.head}`,
      idea: "列は ID・題・難しさ・ループ可の順。状態の印は ID の前に置き、待ちの相手は列にせず題の後ろに添える（サイドバーの行と同じ「待ち T-104」の語）。段の区分（いま・つぎ・待ち・ドラフト・済み）はサイドバーと同じ。詳細は右の 440px に出す。",
      facts: [
        ["見えるタスク", "15件中15件"],
        ["行の高さ", "30px"],
        ["一覧の幅", "800px"],
        ["詳細の幅", "440px"],
      ],
      pros: [
        "1400×900 で15件すべてがスクロールなしで見える",
        "ID が左端にそろうので、番号で探しやすい",
        "難しさとループ可が右にそろい、縦に比較できる",
      ],
      cons: [
        "行の形がサイドバー（2段の行）と異なる（印・語・順序は共通）",
        "題が長いと末尾を省略する（この見本の15件では切れ 0 件）",
      ],
    },
  ]
}

const OPEN_ITEMS = [
  "<b>題の字の大きさ。</b>13px は、今の字の段（12px・14px）に無い新しい段になる。12px なら今の段のままで、題と2段目の差は色だけになる。",
  "<b>サイドバーの頭の形。</b>2行に積む（題と総件数が読める・見えるのは10件）か、1行にまとめる（題を出さない・見えるのは11件）か。",
  "<b>一覧モードでのドラフトの分類。</b>今のモーダルは絞り込み「ドラフト」で一括の分類ができる。仕上げではサイドシートに置いたので、一覧モードにも置くかは未決。",
  "<b>一覧モードの表示中の会話。</b>一覧モードは今と同じモーダルで、表示中は会話の流れと入力欄を操作できない。",
  "<b>狭い幅と中間の幅。</b>760px 以下の引き出しと柱の形は、今回も見本に含めていない。",
]

function listItems(lines) {
  return lines.map((line) => `<li>${line}</li>`).join("")
}

function card(item) {
  const judge =
    item.pros === undefined
      ? ""
      : `<div class="judge"><section><h3>長所</h3><ul>${listItems(item.pros)}</ul></section><section><h3>短所</h3><ul>${listItems(item.cons)}</ul></section></div>`
  return `
    <article class="card" data-url="${item.url}">
      <header class="card-head">
        <span class="letter">${item.letter}</span>
        <h2>${item.name}</h2>
        ${item.pick === "" ? "" : `<span class="pick"${item.pick === "採用" ? ' data-pick="best"' : ""}>${item.pick}</span>`}
      </header>
      <div class="frame">
        <iframe title="${item.name} の見本" loading="lazy" tabindex="-1"></iframe>
        <a class="frame-link" target="_blank" rel="noopener" aria-label="${item.name} を実寸で開く"></a>
      </div>
      <p class="idea">${item.idea}</p>
      <dl class="facts">${item.facts.map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join("")}</dl>
      ${judge}
    </article>`
}

/** サイドバーの範囲だけを実寸で切り出した1枚。 */
function step(item, index, url) {
  return `<li class="step">
    <div class="clip">
      <iframe title="${item.name} の見本" src="${url}&bar=0" loading="lazy" tabindex="-1"></iframe>
      <a class="frame-link" href="${url}" target="_blank" rel="noopener" aria-label="${item.name} を実寸で開く"></a>
    </div>
    <h3><span class="letter">${index + 1}</span>${item.name}</h3>
    <p>${item.text}</p>
  </li>`
}

function sampleSize() {
  const [width, height] = state.size.split("x").map(Number)
  return { width, height }
}

// 見本は実寸の iframe を枠の幅に合わせて縮める。
function fit(frame) {
  frame.style.setProperty("--scale", String(frame.clientWidth / sampleSize().width))
}

const watcher = new ResizeObserver((entries) => {
  for (const entry of entries) {
    fit(entry.target)
  }
})

function render() {
  const { width, height } = sampleSize()
  const root = document.documentElement
  root.style.setProperty("--sample-w", String(width))
  root.style.setProperty("--sample-h", String(height))

  document.querySelector("#type-cards").innerHTML = typeCards().map(card).join("")
  document.querySelector("#type-table").innerHTML = `
    <thead><tr><th scope="col">部位</th><th scope="col">最初の案B</th><th scope="col">仕上げ</th></tr></thead>
    <tbody>${typeRows()
      .map(([name, before, after]) => `<tr><th scope="row">${name}</th><td>${before}</td><td>${after}</td></tr>`)
      .join("")}</tbody>`
  document.querySelector("#search-strip").innerHTML = SEARCH_STEPS.map((item, index) =>
    step(item, index, refinedUrl(item.view)),
  ).join("")
  document.querySelector("#search-keys").innerHTML = `
    <thead><tr><th scope="col">操作</th><th scope="col">挙動</th></tr></thead>
    <tbody>${SEARCH_KEYS.map(([key, text]) => `<tr><th scope="row">${key}</th><td>${text}</td></tr>`).join("")}</tbody>`
  document.querySelector("#head-strip").innerHTML = HEAD_STEPS.map((item, index) =>
    step(item, index, refinedUrl("rest", item.head)),
  ).join("")
  document.querySelector("#list-cards").innerHTML = listCards().map(card).join("")
  document.querySelector("#open-list").innerHTML = listItems(OPEN_ITEMS)

  watcher.disconnect()
  for (const frame of document.querySelectorAll(".frame")) {
    const url = frame.closest(".card").dataset.url
    frame.querySelector("iframe").src = `${url}&bar=0`
    frame.querySelector(".frame-link").href = url
    watcher.observe(frame)
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
    render()
  })
}

render()
