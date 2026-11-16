// サイドバーとタスク一覧の課題と3案の比較ページ。課題・共通の土台・案ごとの文と数を一覧で持ち、見本（index.html）を縮小して並べる。
// 「今」の寸法は疑似セッションの画面を scripts/capture/capture-view.ts の --measure で測った値、
// 3案の寸法は見本を実ブラウザ（1400×900）で測った値（2026-11-16）。
// アイコンの種類の数は、設計のレビューの担当が src/browser/components/frame/sidebar と src/browser/features/task-board のコードから数えた値。

const ISSUES = [
  {
    level: "P0",
    title: "サイドバーの行を押しても、プレビューが画面外で表示されない",
    body: "プレビューは left 1724px（ビューポートは 1400px）に配置される。サイドバーのぼかし（<code>backdrop-filter</code>）が <code>position: fixed</code> の基準をサイドバーへ移すため、行の左に出るはずの面がサイドバーの内側の座標で配置され、切り取られる。題の全文と「これを始める」はサイドバーから到達できない。",
    image: ["now-peek.png", "KZ-142 の行を押した直後。行の枠だけが変化し、左には何も出ない"],
    fix: "3案とも解消（A・C は最上位の層のポップオーバー、B はプレビュー自体を廃止）",
  },
  {
    level: "P1",
    title: "状態の印と色が、サイドバーとモーダルで逆の意味になる",
    body: "空の輪はサイドバーで「着手可」、モーダルで「待ち」。塗りの点はサイドバーで「進行中」、モーダルで「着手可」。琥珀色はサイドバーで「保留」、モーダルで「待ち」。語も「着手可・未着手」「依存待ち・待ち」が混在する。",
    image: ["now-board-list.png", "モーダルの一覧。着手可が塗りの点、待ちが琥珀の輪"],
    fix: "共通の土台で解消（状態の印を1つの部品に統合）",
  },
  {
    level: "P1",
    title: "サイドバーの行で読める題が約9字で、上段を見出しと完了が占める",
    body: "1400×900 で題の列は 118px（行の幅 270px の 44%）。見出しの帯 124px と凡例 33px が先頭に常設され、進行中の直後は完了の3行が続く。最初の着手可のタスクは、サイドバーの上端から 411px の位置になる。",
    image: ["now-side.png", "今のサイドバー（1400×900）"],
    fix: "共通の土台で解消（題を2行・完了を末尾・凡例を廃止）",
  },
  {
    level: "P2",
    title: "モーダルを開いた直後が、完了タスクと押せない主ボタンになる",
    body: "初期の選択は ID の昇順の先頭で、完了タスクが選択される。主ボタン「tsukumo に頼む」は「終わったタスクです」で無効。絞り込みは7枚で、1400×900 では2行に折り返す。サイドバーの絞り込み（4枚）とは語も枚数も異なる。",
    fix: "共通の土台で解消（進行中 → 着手可の順に並べ、絞り込みを同じ6種に統一）",
  },
  {
    level: "P2",
    title: "アイコンの出どころが4系統で、寸法と線幅が不統一",
    body: "lucide の直描きが13種・18か所（寸法 11〜16px の6種、線幅 1.8〜2.4 の4種）、字の記号が8種（↻・›・●・✓ など）、CSS の図形が5種、共通の部品 <code>ui/icon</code> 経由は1種。難しさの点3つはメニューの「…」に、ループ可の ↻ は隣の「最新化」の印に見える。",
    fix: "共通の土台で解消（<code>ui/icon</code> 経由に集約、寸法2段・線幅1種）",
  },
  {
    level: "P2",
    title: "同じ操作の語とボタンの形が面ごとに異なり、詳細に生の値が出る",
    body: "着手の操作は「これを始める」「tsukumo に頼む」「実行する」の3通り。閉じる・最新化のボタンは、サイドバーとモーダルで大きさと枠が異なる。詳細には <code>done</code>・<code>todo</code>・<code>Y</code>・<code>N</code> の生の値が出て、状態が2か所に重複する。「保留」はタスクの状態と分類の選択肢の2義で同じ画面に並ぶ。",
    image: ["now-board-detail.png", "モーダルの詳細。todo の札と「待ち」が重複し、ループは N の1字"],
    fix: "共通の土台で解消（頼む口を1種に統一、分類の「保留」は「あとで」に改称）",
  },
  {
    level: "P2",
    title: "中間の幅（1000px 前後）では、状態と使用量が開かずに読めない",
    body: "サイドバーは右上の柱に折り畳まれ、進行中の件数「1」だけが残る。数字の意味は <code>title</code> だけで、開閉のアイコンは描画されていない。5時間・7日間の使用量も出ない。",
    image: ["now-mid.png", "1000×800 の右上。柱には「1」だけが出る"],
    fix: "今回の見本の範囲外（柱と狭い幅は追加の検討が必要）",
  },
]

// 状態の印の対照。今の2面は語で言い、統一後は実物の印で見せる。
const MARKS = [
  ["進行中", "塗りの札「進行中」と 12px の塗りの円", "7px の塗りの点と光輪", "doing", "accent", "進行中"],
  ["着手可", "12px の灰色の輪（title は「未着手」）", "7px の差し色の塗りの点", "ready", "accent", "着手可"],
  ["待ち", "砂時計・青「依存待ち」", "7px の琥珀色の輪「待ち ID」", "blocked", "", "待ち T-104"],
  ["保留", "二本線 13px・琥珀色", "二本線 11px・灰色", "hold", "warn", "保留"],
  ["ドラフト", "破線の輪", "印なし", "draft", "", "ドラフト"],
  ["完了", "字の ✓ と、行全体の打ち消し線", "チェック 11px・灰色と、行の不透明度 0.6", "done", "", "完了"],
]

const OTHER_MARKS = [
  ["ループ可", "字の ↻（最新化の印と酷似）", "Repeat 12px。詳細は「Y」「N」", `${icon("loop")}<span>詳細では「ループ可」「手で進める」</span>`],
  ["難しさ", "非表示", "点3つ（メニューの「…」に見える）。詳細は生の値", `<span class="meter"><i class="on"></i><i class="on"></i><i></i></span><span class="mono">sonnet</span><span>モデル名の語と3段の目盛り</span>`],
  ["最新化・閉じる", "枠なし 24px・26px", "枠つき 34px", `<span class="tool">${icon("refresh")}</span><span class="tool">${icon("close")}</span><span>どの面でも枠なし 28px</span>`],
  ["頼む", "「これを始める →」", "「tsukumo に頼む」と吹き出しの印（雑談の印と同じ）", `<span class="ask">${icon("send")}つくも に頼む</span><span>入力欄の送信と同じ印。名前は入力欄と同じキャラクター名</span>`],
  ["絞り込み", "4枚（すべて・未完了・ドラフト・完了）", "7枚（2行に折り返す）", `<span>状態6種の件数の帯（印と件数）。絞り込みと凡例を兼用</span>`],
]

const RULES = [
  "<b>行の形</b>: 1段目に印と題（2行まで・文節で折り返す）、2段目に待ちの相手・ID・ループ可・難しさ。サイドバー・モーダル・ボードで同じ行を使用する。",
  "<b>順序</b>: 進行中 → 着手可 → 待ち → 保留 → ドラフト → 完了。完了は末尾に置き、打ち消し線は使用しない。",
  "<b>語</b>: 状態は「進行中・着手可・待ち・保留・ドラフト・完了」の6語。使用量は「コンテキスト・5時間・7日」。生の値（done・Y・N）は出さない。",
  "<b>使用量</b>: 3つを同じ形（語・割合・細い棒）で並べる。今は棒1つと円2つで、形が2種ある。",
  "<b>雑談のサイドバー</b>: 見出しの大きさと余白を、仕事中の見出しと同じにする（今は 12px ずれ、見出しが本文より大きい）。",
]

const PLANS = [
  {
    id: "a",
    name: "統一リスト",
    pick: "変更範囲が最小",
    idea: "骨格（1本のリスト・行のそばのプレビュー・中央のモーダル）は現行のまま、印・語・順序・行の形だけを統一する。件数の帯が絞り込みと凡例を兼ね、完了は末尾に折り畳む。モーダルは検索を頭の1行に入れ、絞り込みを1行に収める。",
    toReady: 146,
    chrome: 80,
    shown: "12件中9件",
    surfaces: 2,
    talk: "モーダルの表示中は不可",
    pros: [
      "既存の部品（一覧・プレビュー・モーダル）の構成を維持でき、キー操作（↑↓・検索）もそのまま継承できる",
      "件数の帯で、状態別の件数が開かずに読める",
    ],
    cons: [
      "詳細の表示面が2つ（プレビューとモーダル）のまま残る",
      "モーダルの表示中は、会話の流れと入力欄を操作できない",
      "件数の帯は幅 520px 未満で印と数だけになり、語は title と読み上げに依存する",
    ],
  },
  {
    id: "b",
    name: "段階グループとサイドシート",
    pick: "推奨",
    idea: "リストを「いま・つぎ・待ち・ドラフト・済み」の段階に分割し、見出しが状態を説明する（絞り込みと凡例は不要）。詳細は、サイドバーの左に開く非モーダルのサイドシート1つに集約する。シートは進行の帯と入力欄を隠さず、拡大すると中央の列の幅まで広がる。リストは常にサイドバーの位置から動かない。",
    toReady: 170,
    chrome: 44,
    shown: "12件中8件",
    surfaces: 1,
    talk: "可能（非モーダル）",
    pros: [
      "詳細の表示面が1つになり、プレビューとモーダルの二重の実装が不要になる",
      "進行の帯と入力欄が残るので、タスクを読みながら依頼・補足ができる",
      "「つぎ」の段が常に上位にあり、次の着手対象が開かずに読める",
      "ドラフトの段に分類の入口が常設され、未処理の件数が常に見える",
    ],
    cons: [
      "中央のモーダルを廃止するので、3案で変更範囲が最大になる",
      "リストが右・詳細が左で、一般的な一覧と詳細の配置と左右が逆になる",
      "狭い幅では、シートを全画面にする別の設計が必要",
    ],
  },
  {
    id: "c",
    name: "フローボード",
    pick: "俯瞰を重視",
    idea: "サイドバーは要約（フローの帯・進行中の1件・次の3件）に限定し、全件は状態の列に並べるボードで俯瞰する。待ちの相手は、ボード上の札の破線の輪郭で示す。1件の確認は案A と同じプレビュー。",
    toReady: 220,
    chrome: 88,
    shown: "4件（要約）",
    surfaces: 2,
    talk: "ボードの表示中は不可",
    pros: [
      "状態ごとの件数と偏りが、帯の色面で読める（縮小表示でも残る）",
      "待ちの関係が、ボード上の位置として把握できる",
      "サイドバーの下半分が空き、背景が見える",
    ],
    cons: [
      "サイドバーだけでは、待ち・ドラフトの題が読めない",
      "1400×900 ではボードの列の幅が約 168px で、題が3行に折り返す",
      "15件の規模では列の空白が多く、新規の部品（ボード・フローの帯）が3案で最多",
    ],
  },
]

// 数値の比較の行。best は、値が小さいほど良い行だけに付ける。
const NUMBERS = [
  { name: "上端から最初の着手可のタスクまで", now: 411, key: "toReady", unit: "px", best: "min" },
  { name: "見出し・絞り込み・凡例の高さ", now: 157, key: "chrome", unit: "px", best: "min" },
  { name: "題の表示", now: "1行・約9字", text: "2行・全文（切れ 0 件）" },
  { name: "スクロールなしで見えるタスク", now: "15件中12件（先頭の3件は完了）", key: "shown" },
  { name: "詳細を表示する面の数", now: 2, key: "surfaces", unit: "", best: "min" },
  { name: "詳細の表示中の会話", now: "モーダルの表示中は不可", key: "talk" },
  { name: "状態の印", now: "2面で別の体系", text: "6種を全面で共通" },
  { name: "アイコンの寸法と線幅", now: "寸法6種・線幅4種", text: "寸法2段・線幅1種" },
]

const STEPS = [
  "<b>共通の土台を先行して適用する。</b>状態・属性・操作の印と語を1つの部品に統合し、行の形と順序を統一する。どの案でも必要で、これだけで「一貫性」の課題と、プレビューが表示されない不具合が解消する。",
  "<b>構造は案B を推奨する。</b>詳細の表示面が1つになり、会話を継続したままタスクを読める。次の着手対象は「つぎ」の段で、開かずに読める。",
  "<b>変更範囲を抑制するなら案A。</b>案B のサイドバー（段階のグループ）だけを先行して採用し、詳細は案A のモーダルを継続する組み合わせも成立する。",
  "<b>案C のフローの帯は、単独でも追加できる。</b>案A・案B のサイドバーの頭に置けば、状態別の件数が縮小表示でも読める。",
  "<b>未検討の範囲。</b>狭い幅（760px 以下）の引き出しと、中間の幅の柱は、今回の見本に含めていない。",
]

const VIEWS = ["rest", "task", "list", "draft"]
const SIZES = ["1400x900", "1920x1080"]
const COLS = ["1", "2", "3"]

const params = new URLSearchParams(location.search)

function pick(name, allowed, fallback) {
  const value = params.get(name)
  return allowed.includes(value) ? value : fallback
}

const state = {
  view: pick("view", VIEWS, "rest"),
  size: pick("size", SIZES, "1400x900"),
  cols: pick("cols", COLS, "3"),
}

function icon(name) {
  return `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><use href="#tk-${name}" /></svg>`
}

function sampleUrl(id) {
  return `index.html?design=${id}&view=${state.view}`
}

function listItems(lines) {
  return lines.map((line) => `<li>${line}</li>`).join("")
}

function issue(item) {
  const figure = item.image
    ? `<figure class="issue-figure"><img src="${item.image[0]}" alt="${item.image[1]}" loading="lazy" /><figcaption>${item.image[1]}</figcaption></figure>`
    : ""
  return `<li class="issue">
    <div class="issue-text">
      <h3><span class="level" data-level="${item.level}">${item.level}</span>${item.title}</h3>
      <p>${item.body}</p>
      <p class="issue-fix">${item.fix}</p>
    </div>
    ${figure}
  </li>`
}

function card(plan) {
  return `
    <article class="card" data-id="${plan.id}">
      <header class="card-head">
        <span class="letter">${plan.id.toUpperCase()}</span>
        <h2>${plan.name}</h2>
        <span class="pick"${plan.pick === "推奨" ? ' data-pick="best"' : ""}>${plan.pick}</span>
      </header>
      <div class="frame">
        <iframe title="案${plan.id.toUpperCase()} の見本" loading="lazy" tabindex="-1"></iframe>
        <a class="frame-link" target="_blank" rel="noopener" aria-label="案${plan.id.toUpperCase()}（${plan.name}）を実寸で開く"></a>
      </div>
      <p class="idea">${plan.idea}</p>
      <dl class="facts">
        <div><dt>最初の着手可まで</dt><dd>${plan.toReady}px</dd></div>
        <div><dt>見えるタスク</dt><dd>${plan.shown}</dd></div>
        <div><dt>詳細の面</dt><dd>${plan.surfaces}つ</dd></div>
        <div><dt>詳細の表示中の会話</dt><dd>${plan.talk}</dd></div>
      </dl>
      <div class="judge">
        <section><h3>長所</h3><ul>${listItems(plan.pros)}</ul></section>
        <section><h3>短所</h3><ul>${listItems(plan.cons)}</ul></section>
      </div>
    </article>`
}

function numberRow(line) {
  if (line.text !== undefined) {
    return `<tr><th scope="row">${line.name}</th><td>${line.now}</td><td colspan="3" class="span">${line.text}</td></tr>`
  }
  const values = PLANS.map((plan) => plan[line.key])
  const best = line.best === "min" ? Math.min(...values) : undefined
  const cells = PLANS.map((plan) => {
    const text = `${plan[line.key]}${line.unit ?? ""}`
    const cls = line.best ? ' class="num"' : ""
    return plan[line.key] === best ? `<td${cls}><b>${text}</b></td>` : `<td${cls}>${text}</td>`
  })
  const now = line.best ? `<td class="num">${line.now}${line.unit}</td>` : `<td>${line.now}</td>`
  return `<tr><th scope="row">${line.name}</th>${now}${cells.join("")}</tr>`
}

document.querySelector("#issues").innerHTML = ISSUES.map(issue).join("")

document.querySelector("#marks").innerHTML = `
  <thead>
    <tr><th scope="col">概念</th><th scope="col">今のサイドバー</th><th scope="col">今のモーダル</th><th scope="col">統一後（全面で共通）</th></tr>
  </thead>
  <tbody>
    ${MARKS.map(
      ([name, side, modal, state, tone, word]) =>
        `<tr><th scope="row">${name}</th><td>${side}</td><td>${modal}</td><td><span class="after" data-tone="${tone}">${icon(state)}${word}</span></td></tr>`,
    ).join("")}
    ${OTHER_MARKS.map(
      ([name, side, modal, after]) =>
        `<tr><th scope="row">${name}</th><td>${side}</td><td>${modal}</td><td><span class="after">${after}</span></td></tr>`,
    ).join("")}
  </tbody>`

document.querySelector("#rules").innerHTML = listItems(RULES)

const cards = document.querySelector("#cards")
cards.innerHTML = PLANS.map(card).join("")

document.querySelector("#numbers").innerHTML = `
  <thead>
    <tr><th scope="col">項目</th><th scope="col">今</th>${PLANS.map((plan) => `<th scope="col">案${plan.id.toUpperCase()} ${plan.name}</th>`).join("")}</tr>
  </thead>
  <tbody>${NUMBERS.map(numberRow).join("")}</tbody>`

document.querySelector("#steps").innerHTML = listItems(STEPS)

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
