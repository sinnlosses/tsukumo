// 案B の仕上げのページ。字の大きさの前後・探す欄の4つの状態・一覧モードの2つの形を、見本（index.html?design=b2）で並べる。
// 数は 1400×900 の見本を実ブラウザで測った値（2026-11-16）。題の字の大きさ（?type）で変わる数は、大きさごとに持つ。

const TYPES = ["13", "12"]
const SIZES = ["1400x900", "1920x1080"]

const params = new URLSearchParams(location.search)

function pick(name, allowed) {
  const value = params.get(name)
  return allowed.includes(value) ? value : allowed[0]
}

const state = { type: pick("type", TYPES), size: pick("size", SIZES) }

// 題の字の大きさごとの実測値（サイドバーの通常の場面）。
const MEASURED = {
  13: { title: "13px", rowHeight: "50px", shown: "12件中11件", toReady: "153px" },
  12: { title: "12px", rowHeight: "49px", shown: "12件中11件", toReady: "152px" },
}

function typeCards() {
  const after = MEASURED[state.type]
  return [
    {
      id: "before",
      letter: "前",
      name: "最初の案B",
      pick: "",
      url: "index.html?design=b&view=rest",
      idea: "行の題は 14px。今のアプリの本文と同じ段で、ラベルの段（12px）で出している今のサイドバーより大きい。",
      facts: [
        ["行の題", "14px"],
        ["行の高さ（題が1行）", "57px"],
        ["見えるタスク", "12件中8件"],
        ["最初の着手可まで", "170px"],
      ],
    },
    {
      id: "after",
      letter: "後",
      name: "仕上げ",
      pick: `題 ${after.title}`,
      url: `index.html?design=b2&view=rest&type=${state.type}`,
      idea: "行の題を締め、2段目とラベルは下限の 12px のまま。行の余白と印も合わせて締めたので、同じ高さに3件多く入る。",
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
  const after = MEASURED[state.type]
  return [
    ["行の題", "14px", after.title],
    ["行の2段目（待ちの相手・ID・難しさ）", "12px", "12px（下限）"],
    ["行の状態の印", "16px", "14px"],
    ["サイドバーの見出し", "13px", "12px"],
    ["行の高さ（題が1行）", "57px", after.rowHeight],
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
    name: "押す前",
    text: "頭の右に、探す・最新化・一覧を見るの3つの口が並ぶ。<kbd>/</kbd> キーでも探す欄が開く。",
  },
  {
    view: "search",
    name: "押した直後",
    text: "頭の2行目に欄が開き、フォーカスが入る。口は押された状態で残り、もう一度押すと欄が閉じる。一覧は全件のままで、頭の高さは 40px から 108px になる。",
  },
  {
    view: "typed",
    name: "入力中",
    text: "ID・題・本文の部分一致で、段ごとに絞る。当たった語を強調し、件数を欄の右に出す。当たりの無い段は出さず、済みの段は開く。↑↓ の位置は最初の当たりから始まる。",
  },
  {
    view: "none",
    name: "当たりなし",
    text: "段を出さず、探した範囲を1文で言う。× か <kbd>Esc</kbd> で語を消すと全件に戻る。",
  },
]

const SEARCH_KEYS = [
  ["虫眼鏡を押す・<kbd>/</kbd>", "欄を開いてフォーカスを移す。開いているときに押すと、欄を閉じて語も消す"],
  ["文字を入力する", "入力のたびに絞る（今のモーダルの検索と同じ規則で、ID・題・本文の部分一致）"],
  ["<kbd>↑</kbd> <kbd>↓</kbd>", "当たりの行を移動する。フォーカスは欄に残す"],
  ["<kbd>Enter</kbd>", "選んでいる行のサイドシートを開く。変換中の Enter は確定に使い、開かない"],
  ["<kbd>Esc</kbd>", "語があれば語を消す（欄は開いたまま）。語が空なら欄を閉じ、フォーカスを虫眼鏡へ戻す"],
  ["欄の ×", "語を消す。欄は開いたまま"],
  ["「一覧を見る」を押す", "語を引き継いで一覧モードを開く"],
  ["再読み込み", "語は保存しない（今の絞り込みと同じ扱い）"],
]

function listCards() {
  return [
    {
      id: "table",
      letter: "表",
      name: "1行1件の表",
      pick: "推奨",
      url: `index.html?design=b2&view=list&list=table&type=${state.type}`,
      idea: "題は1行に収め、待ちの相手・ID・難しさ・ループ可を列でそろえる。段の区分（いま・つぎ・待ち・ドラフト・済み）はサイドバーと同じ。詳細は右の 440px に出す。",
      facts: [
        ["見えるタスク", "15件中15件"],
        ["行の高さ", "30px"],
        ["一覧の幅", "800px"],
        ["詳細の幅", "440px"],
      ],
      pros: [
        "1400×900 で15件すべてがスクロールなしで見える",
        "列がそろうので、待ちの相手・難しさ・ループ可を縦に比較できる",
        "サイドバー（2段の行）と役割が分かれ、開く理由が明確になる",
      ],
      cons: ["行の形がサイドバーと異なる（印・語・順序は共通）", "題が長いと末尾を省略する（この見本の15件では切れ 0 件）"],
    },
    {
      id: "rows",
      letter: "行",
      name: "サイドバーと同じ2段の行",
      pick: "",
      url: `index.html?design=b2&view=list&list=rows&type=${state.type}`,
      idea: "サイドバーと同じ行を左の 380px に並べ、詳細を広く使う。今のモーダル（左に一覧・右に詳細）に最も近い。",
      facts: [
        ["見えるタスク", "15件中10件"],
        ["行の高さ", "50px"],
        ["一覧の幅", "380px"],
        ["詳細の幅", "860px"],
      ],
      pros: ["サイドバーと同じ行なので、見た目を覚え直さない", "詳細が広く、長い本文を読みやすい"],
      cons: [
        "見えるのは10件で、サイドバー（11件）より一覧性が上がらない",
        "サイドバーを広げただけに近く、モードを分ける理由が弱い",
      ],
    },
  ]
}

const OPEN_ITEMS = [
  "<b>題の字の大きさ。</b>13px は、今の字の段（12px・14px）に無い新しい段になる。12px なら今の段のままで、題と2段目の差は色だけになる。",
  "<b>一覧モードの形。</b>表（推奨）か、サイドバーと同じ2段の行か。",
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
        ${item.pick === "" ? "" : `<span class="pick"${item.pick === "推奨" ? ' data-pick="best"' : ""}>${item.pick}</span>`}
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

function step(item, index) {
  const url = `index.html?design=b2&view=${item.view}&type=${state.type}`
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
  document.querySelector("#search-strip").innerHTML = SEARCH_STEPS.map(step).join("")
  document.querySelector("#search-keys").innerHTML = `
    <thead><tr><th scope="col">操作</th><th scope="col">挙動</th></tr></thead>
    <tbody>${SEARCH_KEYS.map(([key, text]) => `<tr><th scope="row">${key}</th><td>${text}</td></tr>`).join("")}</tbody>`
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
