// レイアウト候補の比較ページ。候補の一覧からカードと表を作り、場面・大きさ・列の数の切り替えを見本の枠へ反映する。
// 一覧の数は、layouts.html の各候補を 1400×900 で撮って測った値（流れの高さは待つ場面、ほかは読む場面と答える場面）。

const CANDIDATES = [
  {
    id: "a",
    name: "基準（図4）",
    aim: "基準",
    head: "上部バー",
    body: "3列・1本の流れ",
    idea: "上部バーの下に、左からやり取りと立ち絵・会話の流れ・タスクを並べる。ほかの候補はここからの差分。",
    flow: 674,
    measure: 729,
    composer: 795,
    margin: false,
    portrait: 342,
    tasks: "5件",
    ask: "60px",
    pros: ["今の画面からの移動が最少", "タスク5件と使用量が常に読める"],
    cons: ["1400 幅では余白の札が出ない", "上部バーと進行の帯で、縦に 110px を使う"],
  },
  {
    id: "b",
    name: "サイドレール",
    aim: "機能",
    head: "左端の縦レール（64px）",
    body: "3列・1本の流れ",
    idea: "ヘッダーを左端の縦レールに替え、上部バーの 52px を会話の流れへ渡す。背景は面の上端まで届く。",
    flow: 726,
    measure: 665,
    composer: 731,
    margin: false,
    portrait: 342,
    tasks: "5件",
    ask: "60px",
    pros: ["流れの高さが 52px 増える", "画面の切り替えが、常に同じ縦の位置に並ぶ"],
    cons: ["流れの幅が 64px 減る（本文 665px）", "ラベルは 12px。部屋の名前はやり取りの列の頭へ移る"],
  },
  {
    id: "c",
    name: "整列バー",
    aim: "機能",
    head: "3列に整列した上部バー",
    body: "3列・1本の流れ",
    idea: "上部バーを下の3列と同じ幅に区切り、進行（状態・段・経過・手順）を中央の列の頭に統合する。",
    flow: 732,
    measure: 729,
    composer: 795,
    margin: false,
    portrait: 342,
    tasks: "5件",
    ask: "60px",
    pros: ["進行の帯の1行が要らなくなり、流れの高さが 58px 増える", "列ごとに頭がそろい、視線が縦に動く"],
    cons: [
      "画面の切り替え（全体）と進行（今のやり取り）が1本に混在する",
      "1400 幅では段の名前に使える幅が約 170px",
    ],
  },
  {
    id: "d",
    name: "左ピラー",
    aim: "リッチと機能",
    head: "バー無し（左の柱へ）",
    body: "3列・1本の流れ",
    idea: "上部バーを廃止し、部屋・モード・やり取り・ほかの画面への入口を左の柱に集約する。背景が面の全体に届く。",
    flow: 726,
    measure: 729,
    composer: 795,
    margin: false,
    portrait: 342,
    tasks: "5件",
    ask: "60px",
    pros: ["流れの高さが 52px 増え、幅は変わらない", "「いまどこにいるか」が左の柱の1か所にまとまる"],
    cons: ["やり取りの一覧に使える高さが約 140px 減る", "ほかの画面への入口が柱の足元へ移り、今より目立たない"],
  },
  {
    id: "e",
    name: "HUD とコンソール",
    aim: "リッチ",
    head: "バー無し（四隅へ）",
    body: "3列・1本の流れ",
    idea: "入口を四隅（左上に部屋とモード、右上にほかの画面、右下に使用量）へ分け、進行を入力欄の頭に入れる。パネルは背景を透過する。",
    flow: 728,
    measure: 729,
    composer: 795,
    margin: false,
    portrait: 342,
    tasks: "5件",
    ask: "18px",
    pros: ["進行と「止める」ボタンが同じ場所（入力欄）に並ぶ", "会話の流れが面の上端から始まり、背景の見える面積が最大"],
    cons: [
      "半透明とぼかしは描画の負荷が増え、明るい背景では文字のコントラストの確認が要る",
      "入力欄が 56px 高くなり、情報の置き場が6か所に分散する",
    ],
  },
  {
    id: "f",
    name: "見開き",
    aim: "機能",
    head: "タスクを集めた上部バー",
    body: "2列・会話と紙を分離",
    idea: "左を会話の列（投稿・セリフ・立ち絵・入力欄）、右を紙（進行・計画・お伺い・レポート）に分ける。タスクと使用量はヘッダーへ集約する。",
    flow: 764,
    measure: 613,
    composer: 413,
    margin: true,
    portrait: 180,
    tasks: "1件と件数",
    ask: "別の列",
    pros: [
      "返事を書いてもレポートの位置が動かず、1400 幅でも余白の札が出る",
      "「セリフと詳細を別々の場所に出す」という今の位置づけを変えずに済む",
    ],
    cons: ["入力欄が 413px（物差しの 560px 未満）で、立ち絵は 180px", "お伺いと入力欄が別の列になり、タスクの一覧は開く操作が要る"],
  },
  {
    id: "g",
    name: "タスクバー",
    aim: "機能",
    head: "タスクを集めた上部バー",
    body: "2列・1本の流れ",
    idea: "1本の流れのまま、タスクと使用量を上部バーへ集約して右の列を空ける。空いた幅は会話の流れと余白へ渡す。",
    flow: 674,
    measure: 760,
    composer: 826,
    margin: true,
    portrait: 342,
    tasks: "1件と件数",
    ask: "60px",
    pros: ["1400 幅で余白の札が出て、本文は上限の 760px", "骨格は基準と同じで、移行の範囲が小さい"],
    cons: ["作業中以外のタスクの名前は、開かないと読めない", "上部バーが満杯で、1400 幅ではほかの画面への入口が記号だけになる"],
  },
  {
    id: "h",
    name: "集中モード",
    aim: "機能",
    head: "上部バー",
    body: "両側をレールに折り畳み",
    idea: "基準の両側のパネルを 44px のレールへ折り畳んだ状態。キー1つで基準と往復する想定で、ほかの候補にも重ねられる。",
    flow: 674,
    measure: 760,
    composer: 826,
    margin: true,
    portrait: 252,
    tasks: "件数だけ",
    ask: "60px",
    pros: ["読むときだけ幅を確保でき、余白の札が出る", "単独の案ではなく状態なので、A〜E のどれにも追加できる"],
    cons: ["やり取りの題とタスクの名前が隠れる", "状態が2つになり、切り替えを覚える必要がある"],
  },
]

const CONTROLS = {
  scene: ["read", "greet", "work", "ask"],
  size: ["1400x900", "1920x1080"],
  cols: ["2", "1", "3"],
}

const params = new URLSearchParams(location.search)
const state = Object.fromEntries(
  Object.entries(CONTROLS).map(([name, allowed]) => {
    const value = params.get(name)
    return [name, allowed.includes(value) ? value : allowed[0]]
  }),
)

function sampleUrl(id) {
  return `layouts.html?layout=${id}&scene=${state.scene}`
}

function listItems(lines) {
  return lines.map((line) => `<li>${line}</li>`).join("")
}

function card(candidate) {
  const letter = candidate.id.toUpperCase()
  return `
    <article class="card" data-id="${candidate.id}">
      <header class="card-head">
        <span class="letter">${letter}</span>
        <h2>${candidate.name}</h2>
        <span class="aim">${candidate.aim}</span>
      </header>
      <div class="frame">
        <iframe title="候補 ${letter} の見本" loading="lazy" tabindex="-1"></iframe>
        <a class="frame-link" target="_blank" rel="noopener" aria-label="候補 ${letter}（${candidate.name}）を実寸で開く"></a>
      </div>
      <p class="idea">${candidate.idea}</p>
      <dl class="facts">
        <div><dt>流れの高さ</dt><dd>${candidate.flow}px</dd></div>
        <div><dt>本文の幅</dt><dd>${candidate.measure}px</dd></div>
        <div><dt>余白の札</dt><dd>${candidate.margin ? "出る" : "出ない"}</dd></div>
        <div><dt>立ち絵</dt><dd>${candidate.portrait}px</dd></div>
        <div><dt>読めるタスク</dt><dd>${candidate.tasks}</dd></div>
      </dl>
      <div class="judge">
        <section><h3>長所</h3><ul>${listItems(candidate.pros)}</ul></section>
        <section><h3>短所</h3><ul>${listItems(candidate.cons)}</ul></section>
      </div>
    </article>`
}

function best(key) {
  return Math.max(...CANDIDATES.map((candidate) => candidate[key]))
}

function numberCell(candidate, key) {
  const value = `${candidate[key]}px`
  return candidate[key] === best(key) ? `<td class="num"><b>${value}</b></td>` : `<td class="num">${value}</td>`
}

function row(candidate) {
  return `
    <tr>
      <th scope="row"><span class="letter">${candidate.id.toUpperCase()}</span>${candidate.name}</th>
      <td>${candidate.head}</td>
      <td>${candidate.body}</td>
      ${numberCell(candidate, "flow")}
      ${numberCell(candidate, "measure")}
      ${numberCell(candidate, "composer")}
      <td>${candidate.margin ? "<b>出る</b>" : "出ない"}</td>
      <td class="num">${candidate.portrait}px</td>
      <td>${candidate.tasks === "5件" ? "<b>5件</b>" : candidate.tasks}</td>
      <td>${candidate.ask}</td>
    </tr>`
}

const cards = document.querySelector("#cards")
cards.innerHTML = CANDIDATES.map(card).join("")

document.querySelector("#summary").innerHTML = `
  <thead>
    <tr>
      <th scope="col">候補</th>
      <th scope="col">ヘッダー</th>
      <th scope="col">本体</th>
      <th scope="col">流れの高さ</th>
      <th scope="col">本文の幅</th>
      <th scope="col">入力欄の幅</th>
      <th scope="col">余白の札</th>
      <th scope="col">立ち絵</th>
      <th scope="col">開かずに読めるタスク</th>
      <th scope="col">お伺いから入力欄</th>
    </tr>
  </thead>
  <tbody>${CANDIDATES.map(row).join("")}</tbody>`

function sampleSize() {
  const [width, height] = state.size.split("x").map(Number)
  return { width, height }
}

// 見本は実寸の iframe を枠の幅に合わせて縮める。
function fit(frame) {
  frame.style.setProperty("--scale", String(frame.clientWidth / sampleSize().width))
}

const frames = [...cards.querySelectorAll(".frame")]
const watcher = new ResizeObserver((entries) => {
  for (const entry of entries) {
    fit(entry.target)
  }
})
for (const frame of frames) {
  watcher.observe(frame)
}

function apply() {
  const { width, height } = sampleSize()
  const root = document.documentElement
  root.style.setProperty("--cols", state.cols)
  root.style.setProperty("--sample-w", String(width))
  root.style.setProperty("--sample-h", String(height))
  for (const frame of frames) {
    const url = sampleUrl(frame.closest(".card").dataset.id)
    const sample = frame.querySelector("iframe")
    if (sample.dataset.url !== url) {
      sample.dataset.url = url
      sample.src = `${url}&bar=0`
    }
    frame.querySelector(".frame-link").href = url
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
