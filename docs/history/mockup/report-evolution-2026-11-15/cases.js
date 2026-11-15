// 案A「前と後」を採ったときの、題材ごとのレポートの見本。index.html?case=<id> で1つずつ出し、cases.html が一覧にする。
// 題材の並びと読み方は reportCaseList、紙の中身は reportCases（evolve.js が部品を渡して呼ぶ）が持つ。
// 中身はすべて架空で、実物の会話ではない。

// 題材の一覧。lead は主の図の型、reading は対の見出しの読み方、parts は今の部品で描けるか。
globalThis.reportCaseList = [
  { id: "work", query: "genre=work", name: "画面を変えた", lead: "前後の画", reading: "前｜後", parts: "Compare（画像）" },
  { id: "decide", query: "genre=decide", name: "案を比べて決めた", lead: "今と採ったあとの流れ", reading: "今｜採ったあと", parts: "Compare・Chart・Matrix" },
  { id: "bug", query: "case=bug", name: "不具合を直した", lead: "前後の画と、コードの前後", reading: "前｜後", parts: "Compare（画像・コード）・ItemList（flow）" },
  { id: "shape", query: "case=shape", name: "構造を組み替えた", lead: "前後の構成図", reading: "前｜後", parts: "Compare（svg）" },
  { id: "speed", query: "case=speed", name: "数を良くした", lead: "前後の棒を1枚に重ねる", reading: "前｜後（同じ軸）", parts: "Chart・Plot" },
  { id: "many", query: "case=many", name: "画面をいくつも変えた", lead: "対の束（選んで見比べる）", reading: "前｜後", parts: "Tabs と Compare（選ぶ帯は無い）" },
  { id: "study", query: "case=study", name: "調べて分かった", lead: "分かったことの図が1枚", reading: "問い｜分かったこと", parts: "粒の図は無い。行は Table" },
  { id: "plan", query: "case=plan", name: "タスクに分けて積んだ", lead: "依存の図が1枚", reading: "前｜後（件数だけ）", parts: "Graph・Table" },
  { id: "halt", query: "case=halt", name: "落ちたので止めた", lead: "狙いと今の画", reading: "狙い｜今", parts: "Compare（画像）・Trace" },
  { id: "ask", query: "case=ask", name: "戻せない操作の前に聞く", lead: "今と消したあとの一覧", reading: "今｜消したあと", parts: "Compare（points）・Note" },
  { id: "short", query: "case=short", name: "短く答えた", lead: "図を置かない", reading: "対にしない", parts: "DescriptionList" },
]

globalThis.reportCases = ({ icon, from, seal, receipt, countLine, switcher }) => {
  // ---------- 紙の骨組み ----------

  function head({ tag, name, change, title, rest = "" }) {
    const line =
      tag === undefined
        ? ""
        : `<p class="task-line"><span class="task-tag">${tag}</span><span>${name}</span><span>${change}</span>
        <span class="widen">${icon("expand", " icon-sm")}広げる</span></p>`
    return `${line}<h1 class="tight">${title}</h1>${rest === "" ? "" : `<p class="conclusion-rest">${rest}</p>`}`
  }

  // 主張と図の組。見出しが主張、その下に図、注記、裏づけの順。
  function fig({ id, claim, tools = "", body, note = "", proof = "", lead = false, min = 1, kind = "" }) {
    return `<section class="fig${lead ? " fig-lead" : ""}${kind === "" ? "" : ` ${kind}`}" aria-labelledby="claim-${id}"${min > 1 ? from(min) : ""}>
      <header class="fig-head"><h2 class="claim" id="claim-${id}">${claim}</h2>${tools}</header>
      ${body}
      ${note === "" ? "" : `<p class="fig-note">${note}</p>`}
      ${proof === "" ? "" : `<div class="proof-line">${proof}</div>`}
    </section>`
  }

  function pair(before, after, names = ["前", "後"], kind = "") {
    return `<div class="pair${kind === "" ? "" : ` ${kind}`}" data-view="side">
      <figure class="pair-side" data-side="before"><figcaption>${names[0]}</figcaption>${before}</figure>
      <figure class="pair-side" data-side="after"><figcaption>${names[1]}</figcaption>${after}</figure>
    </div>`
  }

  function viewSwitch(names = ["前", "後"]) {
    return switcher("view", "見比べ方", [
      ["side", "並べる"],
      ["after", `${names[1]}だけ`],
      ["before", `${names[0]}だけ`],
    ])
  }

  // 「名前｜前｜後」の行。数は前を灰、後を明るい字にする。
  function rows(names, items) {
    const body = items.map(
      ({ what, was, now, proof = "" }) => `<li class="pair-row">
        <span class="pair-what">${what}</span><span class="pair-was">${was}</span>
        <span class="pair-arrow">${icon("right")}</span><span class="pair-now">${now}</span>
        ${proof === "" ? "" : `<span class="pair-proof">${proof}</span>`}
      </li>`,
    )
    return `<ol class="pair-rows">
      <li class="pair-row pair-row-head" aria-hidden="true"><span></span><span>${names[0]}</span><span></span><span>${names[1]}</span></li>
      ${body.join("")}
    </ol>`
  }

  const num = (was, now, unit, diff = "") =>
    ({
      was: `<span class="num-was">${was}</span> ${unit}`,
      now: `<b class="num-now">${now}</b> ${unit}${diff === "" ? "" : `<span class="delta-diff">${diff}</span>`}`,
    })

  function marks(klass, items) {
    return `<ul class="${klass}">${items.map((text) => `<li>${icon("minus")}<span>${text}</span></li>`).join("")}</ul>`
  }

  function kept(items, proof) {
    return fig({ id: "kept", claim: "変えていないこと", body: marks("kept-list", items), proof })
  }

  // やっていないことの欄は、無いときも「無い」と書く（黙っているのと区別する）。
  function undone(items) {
    const body = items.length === 0 ? `<p class="fig-note undone-none">無い。検証は全部走らせた。</p>` : marks("undone-list", items)
    return fig({ id: "undone", claim: "やっていないこと", body, min: 2, kind: "fig-undone" })
  }

  function files(list, rest = "") {
    const body = list.map(
      ([dir, name, add, del]) =>
        `<li><code><span class="path-dir">${dir}</span>${name}</code><span class="file-bar" aria-hidden="true"><i class="bar-add" style="--n: ${add}"></i><i class="bar-del" style="--n: ${del}"></i></span><span class="file-num">+${add} −${del}</span></li>`,
    )
    return `<ul class="files">${body.join("")}</ul>${rest === "" ? "" : `<p class="files-rest">${rest}</p>`}`
  }

  function flow(nodes, key = "") {
    const body = nodes.map((node) =>
      typeof node === "string"
        ? `<li class="flow-step"><span>${node}</span>${icon("right")}</li>`
        : `<li class="flow-node${node.mark === true ? " flow-new" : ""}"><b>${node.title}</b>${node.sub === undefined ? "" : `<span>${node.sub}</span>`}</li>`,
    )
    return `<ol class="flowline">${body.join("")}</ol>${key === "" ? "" : `<p class="fig-key"><span class="key key-new"></span>${key}</p>`}`
  }

  function code(lines) {
    return `<pre class="code">${lines.map(([kind, text]) => `<span class="code-line" data-kind="${kind}">${text}</span>`).join("")}</pre>`
  }

  // 続けて頼める提案の行（今の「次の一手」）。お願いが無い紙では、この行だけが末尾に出る。
  function follow(chips, alone = false) {
    const body = chips.map(([text, draft]) => `<li><button class="next-chip" type="button" data-draft="${draft}">${text}</button></li>`)
    return `<div class="follow${alone ? " follow-alone" : ""}"${from(3)}><span class="follow-label">このあと</span><ul class="next-chips">${body.join("")}</ul></div>`
  }

  function choice({ name, preview, draft, main = false }) {
    return `<button class="choice${main ? " choice-main" : ""}" type="button" data-draft="${draft}" aria-pressed="false">
      <span class="choice-preview" aria-hidden="true">${preview}</span><span class="choice-name">${name}</span>
    </button>`
  }

  // お願い。置き場は最下部。戻せない操作は、札の上に注意を1つ立てる。
  function turn({ text, warn = "", choices, chips = [] }) {
    const plain = choices.map(
      ({ name, draft }) => `<li><button class="next-chip" type="button" data-draft="${draft}">${name}</button></li>`,
    )
    return `<section class="turn-end" id="turn-end" aria-labelledby="turn-title">
      <h2 class="turn-title" id="turn-title">お願い</h2>
      <ol class="asks"><li class="ask">
        <p class="turn-text">${text}</p>
        ${warn === "" ? "" : `<p class="ask-warn">${icon("alert")}<span>${warn}</span></p>`}
        <div class="choices"${from(3)}>${choices.map(choice).join("")}</div>
        <ul class="next-chips" data-lv-max="2">${plain.join("")}</ul>
      </li></ol>
      ${chips.length === 0 ? "" : follow(chips)}
      <p class="next-note">押すと入力欄に下書きが入る。送るのは自分で</p>
    </section>`
  }

  const kept1 = (spec) => `${seal("kept")}${receipt(spec)}`
  const said1 = (why) => `${seal("said")}<span class="proof-why"${from(2)}>${why}</span>`

  // ---------- 描いた画 ----------

  // 設定の面の画。compact のときは字を線に置き換える。
  function win({ nav, active, groups, compact = false, name }) {
    const word = (text, klass = "") =>
      compact
        ? `<span class="greek${klass === "" ? "" : ` ${klass}`}" style="--w: ${text.length}"></span>`
        : `<span${klass === "" ? "" : ` class="${klass}"`}>${text}</span>`
    const control = (value) => {
      if (value === "on" || value === "off") {
        return `<span class="shot-toggle${value === "on" ? " shot-toggle-on" : ""}"></span>`
      }
      return compact ? `<span class="greek" style="--w: 4"></span>` : `<span class="shot-select">${value}</span>`
    }
    const tone = { new: " shot-new", bad: " shot-bad" }
    const pane = groups.map(
      ({ title, items }) =>
        `${word(title, "shot-group")}${items
          .map(
            ([label, value, mark = "", hint = ""]) =>
              `<div class="shot-row${tone[mark] ?? ""}${hint === "" ? "" : " shot-row-hint"}">${word(label, "shot-label")}${control(value)}${hint === "" || compact ? "" : `<small>${hint}</small>`}</div>`,
          )
          .join("")}`,
    )
    return `<div class="shot${compact ? " shot-compact" : ""}" role="img" aria-label="${name}">
      <div class="shot-bar"><span></span><span></span><span></span>${compact ? "" : "<b>設定</b>"}</div>
      <div class="shot-body">
        <div class="shot-nav">${nav.map((item) => word(item, item === active ? "shot-on" : "")).join("")}</div>
        <div class="shot-pane">${pane.join("")}</div>
      </div>
    </div>`
  }

  const NAV = ["見た目", "知らせ", "キー"]

  // ---------- 題材: 不具合を直した ----------

  function phone(fixed) {
    return `<div class="phone" role="img" aria-label="390px の幅のタスクの一覧（${fixed ? "前。3行目の題の2行目が欠ける" : "後。3行目が全部見える"}）">
      <div class="phone-bar"><b>タスク</b><span>3 件</span></div>
      <ul class="phone-list">
        <li><b>設定の検索を足す</b><span>T-101</span></li>
        <li><b>知らせの音量を保存する</b><span>T-102</span></li>
        <li class="${fixed ? "phone-cut" : "phone-new"}"><b>狭い幅で一覧の3行目が欠けるのを直して、画で確かめる</b><span>T-107</span></li>
      </ul>
    </div>`
  }

  function bug() {
    return `${head({
      tag: "T-107",
      name: "狭い幅で一覧の3行目が欠ける",
      change: `変更 2 ファイル <span class="change change-add">+9</span> <span class="change change-del">−3</span>`,
      title: "390px の幅で、一覧の3行目が欠けなくなった",
      rest: "原因は、行の高さを 44px に固定していたこと。",
    })}
    ${countLine(["said", "kept", "kept", "kept"])}
    ${fig({
      id: "screen",
      lead: true,
      claim: "題が2行になる行も、全部見える",
      tools: viewSwitch(),
      body: pair(phone(true), phone(false), ["前", "後"], "pair-phone"),
      note: "390×844 で撮った。囲んだ3行目だけが変わり、上の2行の高さは同じ。",
      proof: kept1({ command: "capture-view.ts", figure: "390×844 の前後 2 枚", time: "16:12" }),
    })}
    ${fig({
      id: "cause",
      claim: "行の高さを 44px に固定していたので、2行の題があふれていた",
      body: `${flow(
        [{ title: "題が2行になる", sub: "390px の幅で 21 字を超える" }, "すると", { title: "中身は 52px 要る" }, "しかし", { title: "行の高さは 44px に固定", sub: "あふれた分は隠していた", mark: true }],
        "今回直した所",
      )}
      ${pair(
        code([
          ["", ".task-row {"],
          ["del", "  block-size: 44px;"],
          ["del", "  overflow: hidden;"],
          ["", "}"],
        ]),
        code([
          ["", ".task-row {"],
          ["ins", "  min-block-size: 44px;"],
          ["", "}"],
        ]),
        ["前", "後"],
        "pair-code",
      )}`,
      proof: kept1({ command: "pnpm run test task-row", figure: "欠ける形を再現するテスト 1 件が通った", time: "16:09" }),
    })}
    ${kept(
      ["760px を超える幅の見た目", "行の並びと、押せる範囲"],
      kept1({ command: "pnpm run test:e2e", figure: "画の比較 18 枚で差分なし", time: "16:14" }),
    )}
    ${fig({
      id: "safari",
      min: 2,
      claim: "実機の Safari でも欠けない",
      body: "",
      proof: said1("撮ったのは Chromium だけ。確かめ方: iPhone の Safari でタスクの一覧を開き、3行目の題が2行とも見えるかを見る"),
    })}
    ${undone(["やり取りの列など、ほかの一覧に同じ固定が無いかの洗い出し"])}
    ${follow(
      [
        ["ほかの一覧も調べる", "ほかの一覧にも、行の高さの固定が無いか調べて。"],
        ["このまま送り出す", "このまま送り出して。"],
      ],
      true,
    )}`
  }

  // ---------- 題材: 構造を組み替えた ----------

  // 構成図。箱と矢印を座標で置く（実物では書き手が箱とつながりを書き、配置は tsukumo が決める）。
  function diagram({ label, width, height, boxes, links }) {
    const id = `tip-${label.length}-${boxes.length}-${links.length}`
    const lines = links.map(
      ([x1, y1, x2, y2, tone = ""]) =>
        `<path class="dg-link${tone === "" ? "" : ` dg-link-${tone}`}" d="M${x1} ${y1} L${x2} ${y2}" marker-end="url(#${id}${tone === "new" ? "-new" : ""})" />`,
    )
    const rects = boxes.map(
      ([x, y, w, h, text, tone = ""]) =>
        `<rect class="dg-box${tone === "" ? "" : ` dg-box-${tone}`}" x="${x}" y="${y}" width="${w}" height="${h}" rx="7" />
         <text class="dg-text" x="${x + w / 2}" y="${y + h / 2 + 4.5}" text-anchor="middle">${text}</text>`,
    )
    return `<svg class="diagram" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
      <defs>
        <marker id="${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path class="dg-tip" d="M0 0 8 4 0 8Z" /></marker>
        <marker id="${id}-new" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path class="dg-tip dg-tip-new" d="M0 0 8 4 0 8Z" /></marker>
      </defs>
      ${lines.join("")}${rects.join("")}
    </svg>`
  }

  function shape() {
    const modules = [
      [8, 12, 112, 34, "見た目の設定"],
      [8, 64, 112, 34, "知らせの設定"],
      [8, 116, 112, 34, "キーの設定"],
    ]
    const before = diagram({
      label: "前の構成。3つの設定が、それぞれ localStorage を直に読み書きする",
      width: 356,
      height: 162,
      boxes: [...modules, [252, 64, 96, 34, "localStorage"]],
      links: [
        [120, 29, 250, 74],
        [120, 81, 250, 81],
        [120, 133, 250, 88],
      ],
    })
    const after = diagram({
      label: "後の構成。3つの設定は端末ごとの好みを通り、そこだけが localStorage を読み書きする",
      width: 356,
      height: 162,
      boxes: [...modules, [142, 64, 96, 34, "端末ごとの好み", "new"], [252, 64, 96, 34, "localStorage"]],
      links: [
        [120, 29, 140, 72, "new"],
        [120, 81, 140, 81, "new"],
        [120, 133, 140, 90, "new"],
        [238, 81, 250, 81, "new"],
      ],
    })
    return `${head({
      tag: "T-110",
      name: "設定の保存を1か所にまとめる",
      change: `変更 5 ファイル <span class="change change-add">+64</span> <span class="change change-del">−148</span>`,
      title: "設定の保存の口が、3か所から1か所になった",
      rest: "画面の見た目とふるまいは変えていない。",
    })}
    ${countLine(["kept", "kept", "kept", "kept"])}
    ${fig({
      id: "shape",
      lead: true,
      claim: "3つの設定は、端末ごとの好みを通して保存する",
      tools: viewSwitch(),
      body: `${pair(before, after)}<p class="fig-key"><span class="key key-new"></span>今回足した箱と、付け替えた矢印</p>`,
      note: "localStorage を直に触るのは「端末ごとの好み」だけになった。鍵の名前は同じで、前に保存した値がそのまま読める。",
      proof: kept1({ command: "pnpm run check", figure: "依存の向きの検査を含めて通った", time: "17:40" }),
    })}
    ${fig({
      id: "rows",
      claim: "重なっていた読み書きの 84 行が無くなった",
      body: rows(
        ["前", "後"],
        [
          { what: "保存を呼ぶ所", ...num("3", "1", "か所") },
          { what: "重なった読み書き", ...num("84", "0", "行", "−84") },
          { what: "単体テスト", ...num("12", "15", "件", "+3"), proof: kept1({ command: "pnpm run test device-preference", figure: "15 件が通った", time: "17:38" }) },
        ],
      ),
    })}
    ${fig({
      id: "code",
      claim: "触ったのは5ファイルで、消した行のほうが多い",
      body: files([
        ["src/browser/utils/", "device-preference.ts", 38, 6],
        ["src/browser/features/setting/", "setting-look.tsx", 8, 52],
        ["src/browser/features/setting/", "setting-notice.tsx", 8, 48],
        ["src/browser/features/setting/", "setting-key.tsx", 6, 42],
        ["test/browser/utils/", "device-preference.test.ts", 4, 0],
      ]),
    })}
    ${kept(
      ["画面の見た目とふるまい", "保存の鍵の名前（前の値がそのまま読める）"],
      kept1({ command: "pnpm run test:e2e", figure: "E2E 98 件・画の比較 18 枚で差分なし", time: "17:44" }),
    )}
    ${undone([])}`
  }

  // ---------- 題材: 数を良くした ----------

  const PARTS = [
    ["起動", 0.3, 0.3],
    ["束の読み込み", 1.1, 0.3],
    ["最初の描画", 0.4, 0.3],
  ]

  // 前と後の棒を同じ軸に重ねる。縮んだ所だけを強調の色にし、値は棒の先に書く。
  function partBars() {
    const top = 1.2
    const bar = (value, tone, side) =>
      `<span class="part-bar" data-tone="${tone}"><em>${side}</em><i style="inline-size: ${(value / top) * 100}%"></i><b>${value.toFixed(1)}</b></span>`
    const body = PARTS.map(
      ([name, was, now]) => `<li><span class="part-name">${name}</span>
        <span class="part-pair">${bar(was, "was", "前")}${bar(now, was === now ? "same" : "now", "後")}</span></li>`,
    )
    return `<ul class="part-bars" role="img" aria-label="画面が出るまでの時間の内訳。起動は 0.3 秒のまま、束の読み込みは 1.1 秒から 0.3 秒、最初の描画は 0.4 秒から 0.3 秒">${body.join("")}</ul>
      <p class="fig-key"><span class="key key-new"></span>縮んだ所　単位は秒。10 回測った中央の値</p>`
  }

  function strip() {
    const span = [0.6, 2]
    const at = (value) => ((value - span[0]) / (span[1] - span[0])) * 100
    const dots = (values, tone) => values.map((value) => `<i data-tone="${tone}" style="inset-inline-start: ${at(value)}%"></i>`).join("")
    const ticks = [0.6, 1, 1.4, 1.8].map((value) => `<span style="inset-inline-start: ${at(value)}%">${value.toFixed(1)}</span>`).join("")
    return `<div class="strip" role="img" aria-label="10 回ずつの測定。前は 1.71 秒から 1.93 秒、後は 0.84 秒から 0.98 秒">
      <div class="strip-row"><span class="strip-name">前</span><span class="strip-track">${dots([1.71, 1.74, 1.76, 1.78, 1.79, 1.8, 1.82, 1.84, 1.88, 1.93], "was")}</span></div>
      <div class="strip-row"><span class="strip-name">後</span><span class="strip-track">${dots([0.84, 0.86, 0.87, 0.88, 0.89, 0.9, 0.9, 0.92, 0.94, 0.98], "now")}</span></div>
      <div class="strip-row strip-axis"><span class="strip-name">秒</span><span class="strip-track">${ticks}</span></div>
    </div>`
  }

  function speed() {
    return `${head({
      tag: "T-111",
      name: "起動を速くする",
      change: `変更 6 ファイル <span class="change change-add">+41</span> <span class="change change-del">−17</span>`,
      title: "画面が出るまでの時間が、1.8 秒から 0.9 秒になった",
      rest: "縮んだのは束の読み込みで、画面の中身は変えていない。",
    })}
    ${countLine(["said", "kept", "kept", "kept", "none"])}
    ${fig({
      id: "parts",
      lead: true,
      claim: "縮んだ 0.9 秒のうち、0.8 秒は束の読み込み",
      body: partBars(),
      note: "図と設定の部品を、開いたときに読む形へ分けた。最初に読む束は 2.4 MB から 0.9 MB になった。",
      proof: kept1({ command: "measure-start.ts --runs 10", figure: "前後 10 回ずつ", time: "13:20" }),
    })}
    ${fig({
      id: "spread",
      claim: "後のいちばん遅い回も、前のいちばん速い回より速い",
      body: strip(),
      note: "点は1回の測定。前と後の点が重ならないので、差は測るたびの揺れではない。",
    })}
    ${fig({
      id: "rows",
      claim: "最初に読む束は 0.9 MB で、後から読む部品が4つできた",
      body: rows(
        ["前", "後"],
        [
          { what: "最初に読む束", ...num("2.4", "0.9", "MB", "−1.5") },
          { what: "後から読む部品", ...num("0", "4", "個") },
        ],
      ),
      proof: kept1({ command: "pnpm run build", figure: "束の大きさの表", time: "13:12" }),
    })}
    ${kept(["画面の中身と操作", "図と設定を開いたあとの見た目"], kept1({ command: "pnpm run test:e2e", figure: "E2E 98 件", time: "13:26" }))}
    ${fig({
      id: "slow",
      min: 2,
      claim: "遅い回線でも、同じだけ縮む",
      body: "",
      proof: said1("測ったのは手元の回線だけ。確かめ方: 回線を絞る設定で同じ測り方を 10 回行う"),
    })}
    ${undone(["古い端末での測定"])}
    ${follow([["遅い回線でも測る", "回線を絞った条件でも、同じ測り方で 10 回測って。"]], true)}`
  }

  // ---------- 題材: 画面をいくつも変えた ----------

  const FACES = [
    {
      id: "look",
      name: "見た目",
      changed: "3 行",
      before: [{ title: "色", items: [["地の色", "夜"], ["差し色", "パック"], ["背景の暗さ", "75%"]] }],
      after: [{ title: "色", items: [["地の色", "夜", "new", "画面全体の地"], ["差し色", "パック", "new", "ボタンと今の位置"], ["背景の暗さ", "75%", "new", "70% より明るくできない"]] }],
    },
    {
      id: "notice",
      name: "知らせ",
      changed: "2 行",
      before: [{ title: "知らせ", items: [["通知を出す", "判断が要るとき"], ["鈴を鳴らす", "on"]] }],
      after: [{ title: "知らせ", items: [["通知を出す", "判断が要るとき", "new", "許しは初回に聞く"], ["鈴を鳴らす", "on", "new", "このタブを見ていないとき"]] }],
    },
    {
      id: "key",
      name: "キー",
      changed: "4 行",
      before: [{ title: "キー", items: [["送る", "⌘⏎"], ["止める", "⌘."], ["前のやり取り", "["], ["次のやり取り", "]"]] }],
      after: [{ title: "キー", items: [["送る", "⌘⏎", "new", "入力欄の中で"], ["止める", "⌘.", "new", "作業中だけ"], ["前のやり取り", "[", "new"], ["次のやり取り", "]", "new"]] }],
    },
  ]

  function facePair(face, hidden) {
    const shot = (groups, side) => win({ nav: NAV, active: face.name, groups, name: `設定の「${face.name}」の面（${side}）` })
    return `<div class="bundle-pane" data-face="${face.id}"${hidden ? " hidden" : ""}>${pair(shot(face.before, "前"), shot(face.after, "後"))}</div>`
  }

  function many() {
    const picks = FACES.map(
      (face, index) => `<button class="bundle-pick" type="button" data-face="${face.id}" aria-pressed="${index === 0}">
        ${win({ nav: NAV, active: face.name, groups: face.after, compact: true, name: `設定の「${face.name}」の面の小さな画` })}
        <span class="bundle-name">${face.name}<small>変わった ${face.changed}</small></span>
      </button>`,
    )
    return `${head({
      tag: "T-113",
      name: "設定の3枚を同じ並びにする",
      change: `変更 12 ファイル <span class="change change-add">+212</span> <span class="change change-del">−167</span>`,
      title: "設定の3枚（見た目・知らせ・キー）が、同じ並びになった",
      rest: "設定の値と、保存のしかたは変えていない。",
    })}
    ${countLine(["said", "kept", "kept", "kept", "kept"])}
    ${fig({
      id: "faces",
      lead: true,
      claim: "どの面も、行の下に説明が1行付いた",
      tools: viewSwitch(),
      body: `<div class="bundle">${FACES.map((face, index) => facePair(face, index !== 0)).join("")}
        <div class="bundle-strip" role="group" aria-label="見比べる面">${picks.join("")}</div></div>`,
      note: "下の3枚から面を選ぶと、上の対が入れ替わる。説明を右から下へ移したので、行の高さは 36px から 52px になった。",
      proof: kept1({ command: "capture-view.ts", figure: "3 面 × 2 幅の 6 枚", time: "19:02" }),
    })}
    ${fig({
      id: "rows",
      claim: "そろえたのは、見出し・行の高さ・説明の位置の3つ",
      body: rows(
        ["前", "後"],
        [
          { what: "群の見出し", was: "13px・面ごとに太さが違う", now: "14px・600 にそろえた" },
          { what: "行の高さ", ...num("36", "52", "px", "+16") },
          { what: "説明の位置", was: "行の右（キーの面には無い）", now: "行の下（3面とも）" },
          { what: "面の長さ（キー）", ...num("412", "492", "px", "+80"), proof: said1("長くなった面が 720px の高さで送らずに収まるかは、見ていない") },
        ],
      ),
    })}
    ${fig({
      id: "code",
      claim: "触ったのは 12 ファイルで、行の部品を1つにまとめた",
      body: files(
        [
          ["src/browser/features/setting/", "setting-row.tsx", 74, 0],
          ["src/browser/features/setting/", "setting-key.tsx", 31, 58],
          ["src/browser/features/setting/", "setting-look.tsx", 28, 44],
          ["src/browser/features/setting/", "setting-notice.tsx", 22, 39],
        ],
        "ほか 8 ファイル（+57 −26）",
      ),
      proof: kept1({ command: "pnpm run check", figure: "単体 2,874・E2E 98", time: "19:10" }),
    })}
    ${kept(["設定の値と、保存のしかた", "キーの割り当て"], kept1({ command: "git diff --stat", figure: "保存とキーの定義に差分なし", time: "19:10" }))}
    ${undone(["720px の高さでの見え方"])}
    ${turn({
      text: "説明を行の下に置いたので、キーの面が 80px 長くなった。このままでよいか決めてほしい。",
      choices: [
        { name: "このままにする", preview: `<span class="shot-label">3面とも行の下</span><b class="choice-lag">492px</b>`, draft: "説明は3面とも行の下のままでよい。", main: true },
        { name: "キーの面だけ右に戻す", preview: `<span class="shot-label">キーだけ行の右</span><b class="choice-lag">412px</b>`, draft: "キーの面だけ、説明を行の右に戻して。" },
      ],
      chips: [["720px の高さでも撮る", "720px の高さで、3面を撮って確かめて。"]],
    })}`
  }

  // ---------- 題材: 調べて分かった ----------

  function units() {
    const cells = Array.from({ length: 14 }, (_, index) => `<i${index < 2 ? ' class="unit-new"' : ""}></i>`).join("")
    return `<div class="units-figure">
      <div class="units" role="img" aria-label="使っている 14 か所のうち、変わるのは 2 か所">${cells}</div>
      <ul class="unit-notes">
        <li><span class="key key-new"></span><code>chart.ts:73</code><span>目盛りの設定の書き方が変わる</span></li>
        <li><span class="key key-new"></span><code>chart-block.tsx:58</code><span>触れたときに呼ばれる関数の引数が変わる</span></li>
        <li><span class="key"></span><span class="unit-rest">残りの 12 か所は、そのまま動く</span></li>
      </ul>
    </div>`
  }

  function study() {
    return `${head({
      tag: "T-112",
      name: "Chart.js を 5 に上げられるか調べる",
      change: "調べもの・コードは変えていない",
      title: "Chart.js は 5 に上げられる。直す所は2か所で、どちらも1行",
    })}
    ${countLine(["said", "kept", "kept", "none"])}
    ${fig({
      id: "units",
      lead: true,
      claim: "使っている 14 か所のうち、変わるのは2か所",
      body: units(),
      note: "四角は、Chart.js を呼んでいる1か所。移行の文書に載っている変更 23 件を、呼んでいる所と1件ずつ照らした。",
      proof: kept1({ command: "grep -rn chart.js src", figure: "14 か所・移行の文書 23 件と照合", time: "10:31" }),
    })}
    ${fig({
      id: "answers",
      claim: "束は小さくなり、見た目は余白が 2px 変わる見込み",
      body: rows(
        ["問い", "分かったこと"],
        [
          { what: "壊れる所", was: "上げると、どこが壊れるか", now: "2か所。目盛りの設定と、触れたときの関数", proof: seal("kept") },
          { what: "束の大きさ", was: "束は大きくなるか", now: `小さくなる。<span class="num-was">210</span> KB から <b class="num-now">188</b> KB`, proof: kept1({ command: "pnpm run build", figure: "5 を入れた枝で組んだ値", time: "10:44" }) },
          { what: "見た目", was: "図の見た目は変わるか", now: "既定の余白が 2px 変わる見込み", proof: said1("移行の文書からの見込み。上げた形で撮って比べてはいない") },
        ],
      ),
    })}
    ${undone(["上げた形で E2E と画の比較を流すこと"])}
    ${turn({
      text: "上げる作業を、タスクに積んでよいか決めてほしい。直すのは2か所で、画の比較で余白を確かめる段を入れる。",
      choices: [
        { name: "タスクに積む", preview: `<span class="shot-label">直す 2 か所＋画の比較</span>`, draft: "Chart.js を 5 に上げる作業を、タスクに積んで。", main: true },
        { name: "今は上げない", preview: `<span class="shot-label">4 のまま</span>`, draft: "Chart.js は今は上げない。調べた結果だけ残して。" },
      ],
    })}`
  }

  // ---------- 題材: タスクに分けて積んだ ----------

  function plan() {
    const box = (column, line, text, tone = "") => [10 + column * 240, 10 + line * 50, 208, 34, text, tone]
    const link = (fromColumn, fromLine, toLine) => [218 + fromColumn * 240, 27 + fromLine * 50, 248 + fromColumn * 240, 27 + toLine * 50]
    const graph = diagram({
      label: "タスク 8 件の依存。先に始められるのは3件で、残りの5件はそのあとに開く",
      width: 708,
      height: 164,
      boxes: [
        box(0, 0, "T-121 末尾の行と回る印", "new"),
        box(0, 1, "T-122 冒頭の印", "new"),
        box(0, 2, "T-123 タブの題", "new"),
        box(1, 0, "T-124 「手順」の一覧"),
        box(1, 1, "T-125 お願いの知らせ"),
        box(1, 2, "T-126 離席の境目"),
        box(2, 0, "T-127 所要の帯の移動"),
        box(2, 1, "T-128 見た目の仕上げ"),
      ],
      links: [link(0, 0, 0), link(0, 1, 1), link(0, 0, 2), link(1, 0, 0), link(1, 0, 1), link(1, 1, 1)],
    })
    return `${head({
      title: "進行とレポートの出し方を、タスク8件に分けて積んだ",
      rest: "コードは変えていない。積んだだけで、どれも着手していない。",
    })}
    ${countLine(["kept", "kept"])}
    ${fig({
      id: "graph",
      lead: true,
      claim: "先に始められるのは3件で、残りは順に開く",
      body: `${graph}<p class="fig-key"><span class="key key-new"></span>いま着手できる</p>`,
      note: "矢印は「これが済むと次が始められる」の向き。いちばん長い道は3件で、3件を並べて進められる。",
      proof: kept1({ command: "tw status", figure: "未着手 8 件・着手できる 3 件", time: "20:18" }),
    })}
    ${fig({
      id: "rows",
      claim: "案のうち、タスクにしたのは8件で、5件は後回し",
      body: rows(
        ["前", "後"],
        [
          { what: "タスク", ...num("0", "8", "件") },
          { what: "着手できる", ...num("0", "3", "件") },
          { what: "後回しにした案", was: "なし", now: "5件（見込みの時間・やり直しの周 ほか）" },
        ],
      ),
    })}
    ${undone(["後回しにした5件の登録"])}
    ${turn({
      text: "分け方と順番を見てほしい。よければ、着手できる3件から始められる。",
      choices: [
        { name: "このまま始める", preview: `<span class="shot-label">T-121 から</span>`, draft: "/next-task T-121", main: true },
        { name: "分け方を直す", preview: `<span class="shot-label">積んだ 8 件を見直す</span>`, draft: "タスクの分け方を直したい。" },
      ],
    })}`
  }

  // ---------- 題材: 落ちたので止めた ----------

  function halt() {
    const face = (value, mark) =>
      win({
        nav: NAV,
        active: "知らせ",
        groups: [{ title: "知らせ", items: [["通知を出す", "判断が要るとき"], ["鈴を鳴らす", "on"], ["背面のときだけ鳴らす", value, mark]] }],
        name: `読み直したあとの設定の「知らせ」の面（${mark === "bad" ? "今。切り替えが切に戻っている" : "狙い。切り替えが入ったまま"}）`,
      })
    const tests = [
      ["ok", "切り替えを入れられる"],
      ["ok", "入れた直後に、入った形で出る"],
      ["ng", "読み直しても、入ったまま出る"],
      ["ng", "別のタブで開いても、入ったまま出る"],
    ]
    return `${head({
      tag: "T-106",
      name: "知らせの切り替えの E2E を足す",
      change: `変更 1 ファイル <span class="change change-add">+58</span> <span class="change change-del">−0</span>（送っていない）`,
      title: "切り替えの E2E を足したが、2件が落ちたので送らずに止めた",
      rest: "落ちたのは、読み直したあとを見る2件。足した E2E は残してある。",
    })}
    ${countLine(["fail", "fail", "said", "kept", "kept"])}
    ${fig({
      id: "gap",
      lead: true,
      claim: "読み直すと、入れた切り替えが切に戻る",
      tools: viewSwitch(["狙い", "今"]),
      body: pair(face("on", "new"), face("off", "bad"), ["狙い", "今"]),
      note: "切り替えを入れて読み直したあとの面。狙いは入ったまま、今は切に戻る。",
      proof: `${seal("fail")}${receipt({ command: "pnpm run test:e2e setting-notice", figure: "4 件中 2 件が落ちた", time: "15:06", peek: { id: "peek-fail", label: "出力を見る", body: `<pre class="output"><span class="out-ng">✕</span> 読み直しても、入ったまま出る
  <span class="out-dim">期待</span> aria-checked="true"
  <span class="out-dim">実際</span> aria-checked="false"
  <span class="out-dim">setting-notice.e2e.ts:48</span></pre>` } })}`,
    })}
    ${fig({
      id: "tests",
      claim: "足した4件のうち、落ちたのは読み直しを挟む2件",
      body: `<ul class="tests">${tests.map(([status, text]) => `<li data-state="${status}">${icon(status === "ok" ? "check" : "cross")}<span>${text}</span></li>`).join("")}</ul>`,
    })}
    ${fig({
      id: "guess",
      min: 2,
      claim: "原因は、好みを読む前に画面を描いていること",
      body: "",
      proof: said1("落ち方からの見立てで、実装は読んでいない。確かめ方: 設定の面を開く処理が、好みを読み終えてから描いているかを読む"),
    })}
    ${fig({
      id: "left",
      claim: "足した E2E は残し、実装には触っていない",
      body: rows(
        ["止める前", "今"],
        [
          { what: "足した E2E", was: "作業ツリーに 4 件", now: `退避した（<code>/tmp/t-106.patch</code>）` },
          { what: "切り替えの実装", was: "触っていない", now: "触っていない" },
          { what: "着手の印", was: "立っている", now: "外した" },
        ],
      ),
    })}
    ${undone(["落ちた原因の実装側の確認"])}
    ${turn({
      text: "どちらを直して進めるか決めてほしい。見立てどおりなら、直すのは実装の側になる。",
      choices: [
        { name: "実装を直してから通す", preview: `<span class="shot-label">読み直しても入ったまま</span>`, draft: "切り替えの実装を直してから、E2E を通して。", main: true },
        { name: "E2E を今の形に合わせる", preview: `<span class="shot-label">読み直すと切に戻る</span>`, draft: "E2E を今のふるまいに合わせて直して。" },
        { name: "ここで止める", preview: `<span class="shot-label">patch を残して終える</span>`, draft: "ここで止める。patch は残しておいて。" },
      ],
    })}`
  }

  // ---------- 題材: 戻せない操作の前に聞く ----------

  function ask() {
    const KEYS = [
      ["tsukumo-device-preference:v1", ""],
      ["tsukumo-layout-split:v2", ""],
      ["tsukumo-outline-panel", ""],
      ["tsukumo-figure-preference", ""],
      ["tsukumo-layout-split:v1", "old"],
      ["tsukumo-notice-sound", "old"],
      ["tsukumo-sidebar-tab", "old"],
    ]
    const list = (after) =>
      `<ul class="keys" role="img" aria-label="${after ? "消したあとの鍵 4 つ" : "今の鍵 7 つ。うち 3 つは古い"}">${KEYS.filter(([, tone]) => !after || tone === "")
        .map(([name, tone]) => `<li${tone === "old" ? ' class="key-old"' : ""}><code>${name}</code>${tone === "old" ? "<span>古い</span>" : ""}</li>`)
        .join("")}</ul>`
    return `${head({
      tag: "T-114",
      name: "古い設定の鍵を消す",
      change: `変更 2 ファイル <span class="change change-add">+18</span> <span class="change change-del">−0</span>（消す処理はまだ走らせていない）`,
      title: "古い設定の鍵を消す用意ができた。消す前に、1つ確かめたい",
    })}
    ${countLine(["said", "kept", "kept"])}
    ${fig({
      id: "keys",
      lead: true,
      claim: "消すのは、どこからも読まれていない3つ",
      tools: viewSwitch(["今", "消したあと"]),
      body: pair(list(false), list(true), ["今", "消したあと"], "pair-keys"),
      note: "3つとも、読む所が <code>src</code> に 0 件。値は、消す前にファイルへ書き出せる。",
      proof: kept1({ command: "grep -rn tsukumo-notice-sound src", figure: "3 つとも 0 件", time: "18:02" }),
    })}
    ${fig({
      id: "other",
      min: 2,
      claim: "ほかの端末にも、古い鍵だけを読む版は残っていない",
      body: "",
      proof: said1("見たのはこの端末だけ。古い版を開いたままの端末があると、そこでは設定が既定に戻る"),
    })}
    ${undone(["消す処理そのもの（答えを待っている）"])}
    ${turn({
      text: "古い鍵を消してよいか決めてほしい。",
      warn: "消すと元に戻せない。先に書き出しておけば、手で戻せる。",
      choices: [
        { name: "書き出してから消す", preview: `<span class="shot-label">3 つを書き出して消す</span>`, draft: "古い鍵を、ファイルに書き出してから消して。", main: true },
        { name: "消さずに残す", preview: `<span class="shot-label">7 つのまま</span>`, draft: "古い鍵は消さずに残して。" },
      ],
    })}`
  }

  // ---------- 題材: 短く答えた ----------

  function short() {
    return `${head({ title: "知らせの設定は、ブラウザの localStorage に端末ごとに保存される" })}
    <dl class="facts-list">
      <div><dt>鍵</dt><dd><code>tsukumo-device-preference:v1</code> の <code>notice</code></dd></div>
      <div><dt>読み書きする所</dt><dd><code>src/browser/utils/device-preference.ts:42</code></dd></div>
      <div><dt>消えるとき</dt><dd>ブラウザのサイトのデータを消したとき。ほかの端末へは写らない</dd></div>
    </dl>
    <div class="proof-line">${kept1({ command: "grep -rn device-preference src", figure: "読み書きは 1 か所", time: "9:41" })}</div>`
  }

  return {
    bug: {
      request: "狭い幅で一覧の3行目が欠けるのを直して",
      say: ["直ったぞ。行の高さを決め打ちにしてたのが原因だったのだ。", "16:15"],
      worklog: "3フェーズ・4分20秒・セリフ 3件",
      phases: 3,
      total: "4分20秒",
      steps: 11,
      heads: ["一覧の3行目が欠けなくなった", "全部見える", "高さの固定が原因", "変えていないこと"],
      paper: bug,
    },
    shape: {
      request: "設定の保存を1か所にまとめて",
      say: ["まとめたぞ。見た目は1画素も変わってないのだ、えへん。", "17:45"],
      worklog: "4フェーズ・11分05秒・セリフ 4件",
      phases: 4,
      total: "11分05秒",
      steps: 26,
      heads: ["保存の口が1か所になった", "端末ごとの好みを通す", "84 行が無くなった", "触ったのは5ファイル", "変えていないこと"],
      paper: shape,
    },
    speed: {
      request: "起動が遅いので速くして",
      say: ["半分になったぞ！束を分けたのが効いたのだ。", "13:27"],
      worklog: "4フェーズ・14分30秒・セリフ 5件",
      phases: 4,
      total: "14分30秒",
      steps: 31,
      heads: ["1.8 秒から 0.9 秒になった", "0.8 秒は束の読み込み", "遅い回も前より速い", "束は 0.9 MB", "変えていないこと"],
      paper: speed,
    },
    many: {
      request: "設定の3枚を同じ並びにして",
      say: ["3枚ともそろえたぞ。キーの面だけ少し長くなったから、見てほしいのだ。", "19:11"],
      worklog: "5フェーズ・18分40秒・セリフ 6件",
      phases: 5,
      total: "18分40秒",
      steps: 44,
      asks: 1,
      heads: ["設定の3枚が同じ並びになった", "行の下に説明が付いた", "そろえたのは3つ", "触ったのは 12 ファイル", "変えていないこと", "お願い"],
      paper: many,
    },
    study: {
      request: "Chart.js を 5 に上げられるか調べて",
      say: ["上げられるぞ。直すのは2か所だけなのだ。", "10:46"],
      worklog: "2フェーズ・7分10秒・セリフ 3件",
      phases: 2,
      total: "7分10秒",
      steps: 18,
      asks: 1,
      heads: ["Chart.js は 5 に上げられる", "変わるのは2か所", "束は小さくなる", "お願い"],
      paper: study,
    },
    plan: {
      request: "進行とレポートの出し方を、タスクに分けて積んで",
      say: ["8件に分けて積んだぞ。順番を見てほしいのだ。", "20:19"],
      worklog: "2フェーズ・5分50秒・セリフ 2件",
      phases: 2,
      total: "5分50秒",
      steps: 14,
      asks: 1,
      heads: ["タスク8件に分けて積んだ", "先に始められるのは3件", "5件は後回し", "お願い"],
      paper: plan,
    },
    halt: {
      state: "halt",
      request: "知らせの切り替えの E2E を足して",
      say: ["……2件落ちたのだ。送らずに止めたぞ、どっちを直すか決めてほしいのだ。", "15:08"],
      worklog: "3フェーズ・9分15秒・セリフ 4件",
      phases: 4,
      done: 3,
      total: "9分15秒",
      steps: 19,
      asks: 1,
      heads: ["2件が落ちたので止めた", "読み直すと切に戻る", "落ちたのは2件", "E2E は残した", "お願い"],
      paper: halt,
    },
    ask: {
      state: "wait",
      request: "古い設定の鍵を消して",
      say: ["消す用意はできたぞ。戻せないから、先に聞いておくのだ。", "18:04"],
      worklog: "2フェーズ・3分40秒・セリフ 2件",
      phases: 3,
      done: 2,
      total: "3分40秒",
      steps: 9,
      asks: 1,
      heads: ["消す前に確かめたい", "消すのは3つ", "お願い"],
      paper: ask,
    },
    short: {
      request: "知らせの設定って、どこに保存されるんだっけ？",
      say: ["ブラウザの中なのだ。場所も書いておいたぞ。", "9:41"],
      phases: 0,
      total: "9秒",
      steps: 2,
      heads: ["localStorage に保存される"],
      paper: short,
    },
  }
}

// 対の束。下の小さな画を選ぶと、上の対が入れ替わる。
document.addEventListener("click", (event) => {
  const pick = event.target.closest(".bundle-pick")
  if (pick === null) {
    return
  }
  const bundle = pick.closest(".bundle")
  for (const pane of bundle.querySelectorAll(".bundle-pane")) {
    pane.hidden = pane.dataset.face !== pick.dataset.face
  }
  for (const other of bundle.querySelectorAll(".bundle-pick")) {
    other.setAttribute("aria-pressed", String(other === pick))
  }
})
