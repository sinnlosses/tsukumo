// 入力欄の案（採用済みの見本どおりにそろえる案0と、新しい3案）の見本を描く。
// ?design=s|a|b|c 案（0 見本どおりにそろえる・A 区画で分ける・B 設定は欄の外の行へ・C ＋と札1つにまとめる）
// ?scene=empty|images|drag|settings|plus|running   場面
// ?w=1400|1000    枠の幅（ビューポートの幅。枠は画面の下 420px を写す）
// ?embed          枠だけを描く（compare.html の中で使う）
// 中身はすべて架空。添える画像は同じリポジトリの見本の画を借りる。

// file:// で開いても動くよう、モジュールにせず素のスクリプトで読む（compare.html は window.ComposerMock から案と場面の名前を引く）。
const DESIGNS = {
  s: {
    name: "案0 見本どおりにそろえる",
    lead: "採用済みの見本（conversation-directions の layouts.html?layout=a2）にあって今の実物に無い形だけを入れる。道具と札の間の仕切り・送るキーの案内・入っている間の縁・名前の札を並べる引き出し。",
  },
  a: {
    name: "案A 区画で分ける",
    lead: "左は書く道具だけを1つの窪みに、右は設定の札と送信に分ける。「新規」は入力欄から外し、頭の切り替えへ寄せる。いちばん小さな直し。",
  },
  b: {
    name: "案B 設定は欄の外の行へ",
    lead: "本体には「この依頼」に効くものだけを残し、モデル・effort・許可と「新しい会話」は本体の下の細い行へ出す。",
  },
  c: {
    name: "案C ＋と札1つにまとめる",
    lead: "書く道具は ＋ の1つに、3つの設定は値を読める札1つに畳む。札を開くと3つが1枚に並び、足元に「新しい会話」を置く。",
  },
}

const SCENES = {
  empty: "空",
  images: "画像2枚と文",
  drag: "画像をドラッグ中",
  settings: "設定を開く",
  plus: "＋を開く",
  running: "実行中に書き足す",
}

const WIDTHS = {
  1400: { lane: [28, 214], portrait: 240, center: [276, 775], side: [1073, 310], paper: 186 },
  1000: { lane: [20, 210], portrait: 210, center: [270, 650], side: undefined, paper: 186 },
}

const IMAGES = [
  "../sidebar-task-board-2026-11-16/now-peek.png",
  "../sidebar-task-board-2026-11-16/now-side.png",
]

const ICON = {
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  imagePlus:
    '<path d="M16 5h6"/><path d="M19 2v6"/><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/><circle cx="9" cy="9" r="2"/>',
  slash: '<path d="M22 2 2 22"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  heading: '<path d="M6 12h12"/><path d="M6 20V4"/><path d="M18 20V4"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  stop: '<rect width="18" height="18" x="3" y="3" rx="3"/>',
  shield:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  shieldEmpty:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
}

const icon = (name, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`

const modelGlyph = (letter) =>
  `<svg class="i glyph-model" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2"/><text x="12" y="16" text-anchor="middle">${letter}</text></svg>`

/** effort の5段の棒。lit は灯す本数（Medium は2本）。 */
const effortGlyph = (lit) =>
  `<svg class="i glyph-effort" viewBox="0 0 24 24" aria-hidden="true">${[0, 1, 2, 3, 4]
    .map((n) => {
      const h = 5 + n * 3.5
      return `<rect class="${n < lit ? "on" : ""}" x="${2 + n * 4.3}" y="${20 - h}" width="2.6" height="${h}" rx="1"/>`
    })
    .join("")}</svg>`

const params = new URLSearchParams(location.search)
const state = {
  design: pick(params.get("design"), Object.keys(DESIGNS), "c"),
  scene: pick(params.get("scene"), Object.keys(SCENES), "images"),
  w: Number(pick(params.get("w"), Object.keys(WIDTHS), "1400")),
  embed: params.has("embed"),
}

function pick(value, allowed, fallback) {
  return allowed.includes(value ?? "") ? value : fallback
}

window.ComposerMock = { DESIGNS, SCENES }

const root = document.getElementById("root")
if (root !== null) {
  render(root)
}

function render(target) {
  if (state.embed) {
    document.body.classList.add("is-embed")
    target.innerHTML = frame()
    return
  }
  const design = DESIGNS[state.design]
  target.innerHTML = `
    <header class="top">
      <div>
        <h1>入力欄の見本（2026-11-16）— ${design.name}</h1>
        <p>${design.lead} 今の画と4つの案を並べて見るのは <a href="compare.html">compare.html</a>。中身はすべて架空。</p>
      </div>
      <div class="controls">
        ${seg("design", "案", { s: "0 見本どおり", a: "A 区画", b: "B 外の行", c: "C まとめる" })}
        ${seg("scene", "場面", SCENES)}
        ${seg("w", "幅", { 1400: "1400", 1000: "1000" })}
      </div>
    </header>
    <div class="stage-wrap">${frame()}</div>
    <section class="notes">${notes()}</section>`
  for (const button of target.querySelectorAll("[data-key]")) {
    button.addEventListener("click", () => {
      const next = new URLSearchParams(location.search)
      next.set(button.dataset.key, button.dataset.value)
      location.search = next.toString()
    })
  }
}

function seg(key, label, options) {
  const current = String(state[key])
  return `<div class="seg" role="group" aria-label="${label}">${Object.entries(options)
    .map(
      ([value, text]) =>
        `<button type="button" data-key="${key}" data-value="${value}" aria-pressed="${value === current}">${text}</button>`,
    )
    .join("")}</div>`
}

function frame() {
  const g = WIDTHS[state.w]
  const vars = [
    `--w:${state.w}px`,
    `--lane-l:${g.lane[0]}px`,
    `--lane-w:${g.lane[1]}px`,
    `--portrait-h:${g.portrait}px`,
    `--center-l:${g.center[0]}px`,
    `--center-w:${g.center[1]}px`,
    `--paper-h:${g.paper}px`,
    ...(g.side ? [`--side-l:${g.side[0]}px`, `--side-w:${g.side[1]}px`] : []),
  ].join(";")
  return `
    <div class="frame" data-w="${state.w}" data-design="${state.design}" data-scene="${state.scene}" style="${vars}">
      <div class="frame-bg"></div>
      <div class="lane"><img class="portrait" src="../../../../characters/tsukumo/${state.scene === "running" ? "thinking" : "default"}.png" alt="" /></div>
      <div class="paper">
        <h3>確かめたこと</h3>
        <ul>
          <li>設定ファイルの読み込み順を1か所に決めた（架空）</li>
          <li>単体テスト 42件が通った（架空）</li>
        </ul>
      </div>
      ${g.side ? side() : ""}
      <div class="dock">${dock()}</div>
    </div>`
}

function side() {
  return `<div class="side"><div class="side-foot">
    <span class="meter"><span>文脈 61%</span><i></i></span>
    <span class="pie"><b style="--p:34%"></b>5h 34%</span>
    <span class="pie"><b style="--p:61%"></b>7d 61%</span>
  </div></div>`
}

function dock() {
  const s = state.scene
  const drafted = s === "images" || s === "running"
  const text =
    s === "images"
      ? "この画面の入力欄を直したい。\n添えた2枚を見比べて、違和感のある所を挙げて。"
      : s === "running"
        ? "あと、狭い画面の撮り直しもお願い。"
        : ""
  // 案0 は見本の形だけを入れるので、ドラッグ中の受け皿と ＋ は持たない（見本に定めが無い）。
  const sample = state.design === "s"
  const focused = drafted || (s === "plus" && !sample)
  const placeholder = sample && s === "running" ? "tsukumo への補足を書く" : "tsukumo への依頼を書く"
  const body = `
    ${s === "images" && !sample ? shelf() : ""}
    <div class="text ${text === "" ? "is-empty" : ""}">${text === "" ? placeholder : `${text}<span class="caret"></span>`}</div>
    ${row(drafted)}
    ${s === "drag" && !sample ? drop() : ""}`
  const composer = `<div class="composer ${focused ? "is-focus" : ""} ${s === "drag" && !sample ? "is-drop" : ""}">${body}</div>`
  if (sample) {
    return (s === "images" ? tokenDrawer() : "") + composer
  }
  return state.design === "b" ? composer + strip() : composer
}

/** 見本の引き出し。本体より左右 16px 内側の低い棚に、添えた物を名前の札で並べる。 */
function tokenDrawer() {
  return `<div class="s-drawer" aria-label="添えた物">
    ${["now-peek.png", "now-side.png"]
      .map(
        (name) =>
          `<span class="token">${icon("image")}${name}<button type="button" aria-label="添付を外す">${icon("x")}</button></span>`,
      )
      .join("")}
  </div>`
}

function shelf() {
  return `<div class="shelf" aria-label="添えた画像">
    ${IMAGES.map(
      (src, i) => `<div class="att" title="押すと原寸で開く">
        <img src="${src}" alt="添えた画像 ${i + 1}" />
        <button type="button" class="rm" aria-label="この画像を外す">${icon("x")}</button>
      </div>`,
    ).join("")}
    <span class="shelf-count">2 / 2 枚</span>
  </div>`
}

function drop() {
  return `<div class="drop">${icon("imagePlus")}<strong>ここに落とすと添える</strong><span>あと 2 枚 · png・jpeg・gif・webp · 1枚 5 MB まで</span></div>`
}

function row(drafted) {
  const full = state.scene === "images"
  const imageLabel = full ? "画像は2枚まで（外すと添えられる）" : "画像を添える"
  switch (state.design) {
    case "s":
      return `<div class="row">
        ${ib("image", "画像を添える")}
        ${ib("slash", "コマンドを補完する")}
        ${ib("at", "ファイルを補完する")}
        ${ib("heading", "マークダウンエディタで書く")}
        <span class="vsep"></span>
        <div role="group" aria-label="実行の設定" style="display:flex;gap:2px">${chips("row-left")}</div>
        <div class="row-end">
          <button type="button" class="text-btn s-new" ${state.scene === "running" ? 'aria-disabled="true"' : ""}>${icon("plus")}新規</button>
          <kbd class="s-key">${state.scene === "running" ? "⌘." : "⌘⏎"}</kbd>
          ${state.scene === "running" ? `<button type="button" class="send stop" aria-label="中断">${icon("stop")}</button>` : `<button type="button" class="send" aria-label="送信">${icon("up")}</button>`}
        </div>
      </div>`
    case "a":
      return `<div class="row">
        <div class="well" role="group" aria-label="書く">
          ${ib("image", imageLabel, full)}
          ${ib("slash", "コマンドを補完する")}
          ${ib("at", "ファイルを補完する")}
          ${ib("heading", "マークダウンエディタで書く")}
        </div>
        <div class="row-end">
          <div role="group" aria-label="実行の設定" style="display:flex;gap:2px">${chips("row")}</div>
          <span class="vsep"></span>
          ${sendNote(drafted)}
          ${action(drafted)}
        </div>
      </div>`
    case "b":
      return `<div class="row">
        ${ib("image", imageLabel, full)}
        ${ib("slash", "コマンドを補完する")}
        ${ib("at", "ファイルを補完する")}
        ${ib("heading", "マークダウンエディタで書く")}
        <div class="row-end">${state.scene === "running" ? sendNote(drafted) : ""}${action(drafted)}</div>
      </div>`
    default:
      return `<div class="row">
        <span style="position:relative">
          <button type="button" class="ib plus ${state.scene === "plus" ? "is-open" : ""}" aria-label="添える・補完する" aria-expanded="${state.scene === "plus"}">${icon("plus")}</button>
          ${state.scene === "plus" ? plusMenu() : ""}
        </span>
        <span style="position:relative">
          <button type="button" class="pill ${state.scene === "settings" ? "is-open" : ""}" aria-label="この会話の設定 モデル Opus・effort Medium・許可 自動判定" aria-expanded="${state.scene === "settings"}">
            ${modelGlyph("O")}Opus<span class="dot">·</span>${effortGlyph(2)}Medium<span class="dot">·</span>${icon("shield")}自動判定${icon("chev", "chev")}
          </button>
          ${state.scene === "settings" ? panel() : ""}
        </span>
        <div class="row-end">${sendNote(drafted)}${action(drafted)}</div>
      </div>`
  }
}

function ib(name, label, disabled = false) {
  return `<button type="button" class="ib" aria-label="${label}" title="${label}" ${disabled ? 'aria-disabled="true"' : ""}>${icon(name)}</button>`
}

/** 設定の札3つ。place は row（本体の下の行の右）・row-left（下の行の左）・strip（案B の外の行）。 */
function chips(place) {
  const open = state.scene === "settings"
  const cap = (text) => (place === "strip" ? `<span class="cap">${text}</span>` : "")
  const popSide = place === "row" ? "right:-6px" : "left:-6px"
  return `
    <span style="position:relative">
      <button type="button" class="chip ${open ? "is-open" : ""}" aria-label="モデル Opus">${modelGlyph("O")}${cap("モデル")}Opus${icon("chev", "chev")}</button>
      ${open ? modelMenu(popSide) : ""}
    </span>
    <button type="button" class="chip" aria-label="effort Medium">${effortGlyph(2)}${cap("effort")}Medium${icon("chev", "chev")}</button>
    <button type="button" class="chip" aria-label="許可モード 自動判定">${icon("shield")}${cap("許可")}自動判定${icon("chev", "chev")}</button>`
}

function strip() {
  const running = state.scene === "running"
  return `<div class="strip" role="group" aria-label="この会話">
    ${chips("strip")}
    <div class="row-end">
      ${running ? "" : `<span class="hint"><kbd>⌘</kbd><kbd>⏎</kbd> 送る · <kbd>⏎</kbd> 改行</span><span class="vsep" style="margin:0 4px"></span>`}
      <button type="button" class="text-btn" ${running ? 'aria-disabled="true" title="作業中は始められない"' : ""}>${icon("plus")}新しい会話</button>
    </div>
  </div>`
}

/**
 * 送るキーの案内。文があるときだけ出す。
 * 実行中は ⌘⏎ が黙って無視されるので、書いた時点で「終わってから送れる」と言う。
 */
function sendNote(drafted) {
  if (!drafted) {
    return ""
  }
  if (state.scene === "running") {
    return `<span class="hint">作業中は送れない · 終わったら <kbd>⌘</kbd><kbd>⏎</kbd></span>`
  }
  return `<span class="hint"><kbd>⌘</kbd><kbd>⏎</kbd> 送る</span>`
}

function action(drafted) {
  if (state.scene === "running") {
    return `<button type="button" class="send stop" aria-label="中断" title="中断">${icon("stop")}</button>`
  }
  return `<button type="button" class="send" aria-label="送信" ${drafted ? "" : 'aria-disabled="true"'}>${icon("up")}</button>`
}

function modelMenu(side) {
  return `<div class="pop" style="${side};width:316px">
    <div class="pop-head">モデル</div>
    ${modelOptions()}
  </div>`
}

function modelOptions() {
  return [
    ["F", "Fable", "いちばん難しい判断に", "●●●●", false],
    ["O", "Opus", "難しい判断に", "●●●", true],
    ["S", "Sonnet", "ふだんの作業に", "●●", false],
    ["H", "Haiku", "速い雑用に · effort なし", "●", false],
  ]
    .map(
      ([letter, name, desc, weight, on]) =>
        `<div class="opt ${on ? "is-on" : ""}">${modelGlyph(letter)}<b>${name}</b><span class="desc">${desc}</span><span class="lead">${weight}</span></div>`,
    )
    .join("")
}

function plusMenu() {
  return `<div class="pop" style="left:-6px;width:268px">
    <div class="opt">${icon("image")}<b>画像を添える</b><span class="key desc">貼り付け・ドロップも</span></div>
    <div class="opt">${icon("slash")}<b>コマンド</b><span class="key"><kbd>/</kbd></span></div>
    <div class="opt">${icon("at")}<b>ファイルを参照</b><span class="key"><kbd>@</kbd></span></div>
    <hr />
    <div class="opt">${icon("heading")}<b>マークダウンで書く</b><span class="switch" role="switch" aria-checked="false"></span></div>
  </div>`
}

function panel() {
  const permission = [
    ["shieldEmpty", "毎回聞く", false, false],
    ["shieldEmpty", "編集は自動", false, false],
    ["shield", "自動判定", true, false],
    ["shieldEmpty", "プラン", false, false],
    ["shield", "全部許す", false, true],
  ]
  return `<div class="pop panel" style="left:-46px">
    <div class="panel-cols">
      <div class="panel-col"><div class="pop-head">モデル</div>${modelOptions()}</div>
      <div class="panel-col"><div class="pop-head">effort</div>
        <div class="effort-bars">${[0, 1, 2, 3, 4]
          .map((n) => `<span class="${n < 2 ? "on" : ""} ${n === 1 ? "cur" : ""}" style="height:${16 + n * 9}px"></span>`)
          .join("")}</div>
        <div class="effort-name">Medium</div>
        <div class="effort-note">Low · Medium · High · Xhigh · Max</div>
      </div>
      <div class="panel-col"><div class="pop-head">許可モード</div>${permission
        .map(
          ([glyph, label, on, ng]) =>
            `<div class="opt ${on ? "is-on" : ""} ${ng ? "is-ng" : ""}">${icon(glyph)}<b>${label}</b></div>`,
        )
        .join("")}</div>
    </div>
    <div class="panel-foot">
      <span>この会話の設定。変えると次の依頼から効く</span>
      <button type="button" class="text-btn">${icon("plus")}新しい会話を始める</button>
    </div>
  </div>`
}

function notes() {
  const common = `<div><h2>3案に共通の土台</h2><ul>
    <li>添えた画像は本体の内側の頭に置き、高さ 64px の絵を切らずに比率のまま出す（今は下の 16px が本体の裏に潜る）</li>
    <li>外す × は絵の角の外へ半分出し、見た目 22px・押せる的 30px にする（今は 18px で絵の上に重なる）</li>
    <li>拡大は絵を押す。虫眼鏡の重ね絵はやめ、ホバーは縁を明るくするだけにする</li>
    <li>枚数「2 / 2 枚」を段の末尾に出し、上限に達したら画像の口を押せなくする（今は3枚目が黙って落ちる）</li>
    <li>ドラッグ中は本体ごと受け皿になり、あと何枚・どの形式かを言う</li>
    <li>入っている間は縁を差し色に寄せる（今はマウスで入ると縁も影も変わらない）</li>
    <li>送信は文が空のあいだ押せない見た目にし、文があるときだけ「⌘⏎ 送る」を添える（今は ⏎ が改行で、送るキーは title にしか無い）</li>
    <li>実行中に文を書いたら「作業中は送れない · 終わったら ⌘⏎」と言う（今は ⌘⏎ が黙って無視される）</li>
  </ul></div>`
  const sample = `<div><h2>案0 で変わること（見本どおりに戻すだけ）</h2><ul>
    <li>道具4つと札3つの間に仕切りを入れる（見本の composer-rule。今の実装は仕切りの要素を持つが、入力欄では隠している）</li>
    <li>送信の左に「⌘⏎」、実行中は「⌘.」を置く（今は title だけ。⌘. で止めるキーは今の実装に無い）</li>
    <li>入っている間は縁を差し色に寄せる（見本の :focus-within。今はマウスで入ると変わらない）</li>
    <li>添えた物は本体より左右 16px 内側の低い棚に、名前の札（画像・書き添え）で並べる。絵の控えは出さない</li>
    <li>実行中の置き文字は「への補足を書く」。ただし今の実装は実行中の ⌘⏎ を黙って無視するので、送り先を決めないと置き文字と挙動が食い違う</li>
    <li>弱み: 9つの口と「新規」の近さはそのまま。添えた絵の中身は札からは見えない</li>
  </ul></div>`
  if (state.design === "s") {
    return sample
  }
  const own = {
    a: `<div><h2>案A で変わること</h2><ul>
      <li>左は書く道具4つだけを1つの窪み（地 6%）に入れ、設定の札3つは右へ移して送信と仕切りで隣り合わせる</li>
      <li>「新規」は入力欄から外す。新しい会話は頭の短縮IDの札（切り替え）から始める</li>
      <li>弱み: 下の行には8つの口が残る。入口が1つ減るので、新しい会話は1回ぶん遠くなる</li>
    </ul></div>`,
    b: `<div><h2>案B で変わること</h2><ul>
      <li>本体の行は書く道具4つと送信だけ。モデル・effort・許可は本体の下の細い行（高さ 30px）に「モデル Opus」の形で名前つきで並ぶ</li>
      <li>同じ行の右に「⌘⏎ 送る · ⏎ 改行」と「新しい会話」。送信と会話の操作が別の段に分かれる</li>
      <li>弱み: 入力欄の全体が 36px 高くなり、流れが同じだけ縮む。外の行は背景の上に字が載る</li>
    </ul></div>`,
    c: `<div><h2>案C で変わること</h2><ul>
      <li>下の行は ＋・設定の札1つ・送信の3つだけ。札は「Opus · Medium · 自動判定」と値を読ませる</li>
      <li>札を押すと3つの設定が1枚に横に並び、変える回数は今と同じ2回。足元に「新しい会話を始める」</li>
      <li>＋ からは画像・コマンド（/）・ファイル（@）・マークダウンの切り替え。キーの案内を兼ねる</li>
      <li>弱み: /・@・マークダウンと「新しい会話」は1回ぶん奥になる（/ と @ は打てば今と同じ）</li>
    </ul></div>`,
  }
  return common + own[state.design]
}
