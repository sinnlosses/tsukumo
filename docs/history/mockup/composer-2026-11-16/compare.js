// 今の画と4つの案の枠を、選んだ場面・幅で並べる。案と場面の名前は composer.js の window.ComposerMock から引く。
;(() => {
  const { DESIGNS, SCENES } = window.ComposerMock
  const params = new URLSearchParams(location.search)
  const scene = Object.hasOwn(SCENES, params.get("scene") ?? "") ? params.get("scene") : "images"
  const w = ["1400", "1000"].includes(params.get("w") ?? "") ? Number(params.get("w")) : 1400
  const cols = ["1", "2"].includes(params.get("cols") ?? "") ? params.get("cols") : "2"

  /** 今の画が無い場面は、近い画に「今はどうなっているか」を重ねる。 */
  const NOW = {
    empty: { img: "empty" },
    images: { img: "images" },
    settings: { img: "settings" },
    running: { img: "running" },
    drag: { img: "empty", note: "今は掴んでいる間に何も変わらない。落とせるのは入力の面だけ" },
    plus: { img: "empty", note: "今は ＋ が無く、道具4つと札3つが常に並ぶ（1000px 以下では ＋ が「新規」になる）" },
  }

  document.getElementById("controls").innerHTML = [
    seg("scene", "場面", SCENES, scene),
    seg("w", "幅", { 1400: "1400", 1000: "1000" }, String(w)),
    seg("cols", "並べる列", { 1: "1列", 2: "2列" }, cols),
  ].join("")
  for (const button of document.querySelectorAll("[data-key]")) {
    button.addEventListener("click", () => {
      const next = new URLSearchParams(location.search)
      next.set(button.dataset.key, button.dataset.value)
      location.search = next.toString()
    })
  }

  const grid = document.getElementById("grid")
  grid.style.setProperty("--cols", cols)
  const ratio = `${w} / 420`
  const now = NOW[scene]
  const nowCell = `<section class="cell is-now">
    <div class="cell-head"><h2>今</h2><p>疑似セッションで撮った今の入力欄</p></div>
    <div class="shot" style="--ratio:${ratio}">
      <img src="now-${now.img}-${w}.png" alt="今の入力欄（${SCENES[scene]}）" />
      ${now.note ? `<span class="shot-note">${now.note}</span>` : ""}
    </div>
  </section>`
  const designCells = Object.entries(DESIGNS).map(([key, design]) => {
    const src = `index.html?design=${key}&scene=${scene}&w=${w}`
    return `<section class="cell">
      <div class="cell-head"><h2>${design.name}</h2><p>${design.lead}</p><a href="${src}">実寸で開く</a></div>
      <a class="shot" href="${src}" style="--ratio:${ratio}" aria-label="${design.name} を実寸で開く">
        <iframe src="${src}&embed" width="${w}" height="420" title="${design.name}・${SCENES[scene]}" tabindex="-1" loading="lazy"></iframe>
      </a>
    </section>`
  })
  grid.innerHTML = nowCell + designCells.join("")

  const fit = () => {
    for (const shot of grid.querySelectorAll(".shot")) {
      shot.style.setProperty("--s", String(shot.clientWidth / w))
    }
  }
  new ResizeObserver(fit).observe(grid)
  fit()

  // 口の数・押す回数は数えた値、高さ・絵の見える高さ・× の大きさは 1400×420 の枠を実ブラウザで測った値。
  // 列は 今・案0・案A・案B・案C の順（DESIGNS の並び）。
  const ROWS = [
    ["下の行に並ぶ口", ["9", "9", "8", "5 ＋外の行 4", "3"], 4],
    ["区切り（道具｜設定）", ["なし", "仕切り", "窪み＋仕切り", "段", "畳む"], -1],
    ["モデル・effort・許可を変える", ["2回", "2回", "2回", "2回", "2回"], -1],
    ["マークダウンの切り替え", ["1回", "1回", "1回", "1回", "2回"], -1],
    ["新しい会話を始める", ["1回・送信の隣", "1回・送信の隣", "2回・頭から", "1回・外の行", "2回・札から"], -1],
    ["空の入力欄の高さ", ["96px", "96px", "96px", "132px", "96px"], -1],
    ["添えた絵の見える高さ", ["48 / 64px", "名前の札", "64 / 64px", "64 / 64px", "64 / 64px"], -1],
    ["外す × の見た目・押せる的", ["18・18px", "20・20px", "22・30px", "22・30px", "22・30px"], -1],
    ["送るキーの案内", ["title だけ", "常に", "文を書くと", "常に", "文を書くと"], -1],
  ]
  const label = (key) => (key === "s" ? "案0" : `案${key.toUpperCase()}`)
  document.getElementById("table").innerHTML = `<table>
    <thead><tr><th></th><th>今</th>${Object.keys(DESIGNS)
      .map((key) => `<th>${label(key)}</th>`)
      .join("")}</tr></thead>
    <tbody>${ROWS.map(
      ([label, cells, best]) =>
        `<tr><td>${label}</td>${cells.map((c, i) => `<td class="${i === best ? "best" : ""}">${c}</td>`).join("")}</tr>`,
    ).join("")}</tbody>
  </table>`

  function seg(key, label, options, current) {
    return `<div class="seg" role="group" aria-label="${label}">${Object.entries(options)
      .map(
        ([value, text]) =>
          `<button type="button" data-key="${key}" data-value="${value}" aria-pressed="${value === current}">${text}</button>`,
      )
      .join("")}</div>`
  }
})()
