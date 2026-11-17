// 左の列の見比べのページ。見本（index.html）を形ごとの枠に入れ、枠の幅に合わせて縮める。

const MOMENTS = ["work", "read", "many"]
const params = new URLSearchParams(location.search)
const moment = MOMENTS.includes(params.get("moment")) ? params.get("moment") : "work"
const pack = params.get("pack") === "shirasuzu" ? "shirasuzu" : "tsukumo"

const DESIGNS = [
  ["now", "今の形", "今の画面を測って写した形"],
  ["a", "A 整える", "骨格は今のまま、列の幅と立ち絵の箱を直す"],
  ["b", "B いまに絞る", "見ているやり取りの題と見出しだけを常に出す"],
  ["c", "C 台座", "やり取りを下端の札にして、列を舞台にする"],
]

function shot(query, title, note, width = 1400, height = 900) {
  const src = `index.html?${query}&pack=${pack}`
  return `<figure class="shot">
    <figcaption><a href="${src}">${title}</a><span>${note}</span></figcaption>
    <div class="frame" style="--w: ${width}; --h: ${height}">
      <iframe src="${src}&bar=0" title="${title}" tabindex="-1"></iframe>
    </div>
  </figure>`
}

document.querySelector("#designs").innerHTML = DESIGNS.map(([design, title, note]) =>
  shot(`design=${design}&moment=${moment}`, title, note),
).join("")

document.querySelector("#wide").innerHTML = DESIGNS.map(([design, title]) =>
  shot(`design=${design}&moment=read`, title, "1920×1080", 1920, 1080),
).join("")

document.querySelector("#opened").innerHTML = [
  shot("design=b&moment=many&open=1", "B いまに絞る", "12件の一覧。列より広く開き、題を切らない"),
  shot("design=c&moment=read&open=1", "C 台座", "一覧は上へ開く。見出しもここで選ぶ"),
].join("")

document.querySelector("#widths").innerHTML = [
  shot("design=b&moment=many&left=200", "B・列の幅 200px", "仕切りの下限。「やり取り」の字を畳み、移る口を残す"),
  shot("design=b&moment=read&left=400", "B・列の幅 400px", "仕切りの上限。立ち絵は高さの上限で止まる"),
].join("")

for (const link of document.querySelectorAll("#moments a")) {
  const next = new URLSearchParams(location.search)
  next.set("moment", link.dataset.value)
  link.href = `?${next.toString()}`
  if (link.dataset.value === moment) {
    link.setAttribute("aria-current", "true")
  }
}

const fit = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const width = Number(entry.target.style.getPropertyValue("--w"))
    entry.target.style.setProperty("--fit", String(entry.contentRect.width / width))
  }
})
for (const frame of document.querySelectorAll(".frame")) {
  fit.observe(frame)
}
