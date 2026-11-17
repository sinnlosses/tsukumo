// 並べて比べるページ。画（index.html）は見えているあいだだけ読み込み、幅に合わせて縮める。動きの一覧は、1回だけの動きを数秒おきに掛け直す。

const PORTRAIT = "../../../../characters/shirasuzu/"

// 場面ごとの立ち絵の動き。今の形は 2026-11-17 の main を疑似セッションで撮って測ったものと、コードから読んだもの。
const MOTIONS = [
  {
    scene: "作業中（道具が走っている）",
    now: ["walk", "歩く"],
    next: ["walk", "歩く"],
    face: "default",
    basis: "変えない",
  },
  {
    scene: "背景の作業を待つ（ターンは閉じている）",
    now: ["breathe", "呼吸だけ"],
    next: ["walk", "歩く"],
    face: "default",
    basis: "疑似セッション work-strip-background で data-motion を計測",
  },
  {
    scene: "答え待ち（質問・許可）",
    now: ["walk", "歩く（作業中と同じ）"],
    next: ["beckon", "呼ぶ（3回で止まる）"],
    face: "curious",
    basis: "resolvePortraitMotion（ターンが走っていれば歩く）",
  },
  {
    scene: "セリフが届いた瞬間",
    now: ["still", "動かない（絵が替わるだけ）"],
    next: ["nod", "うなずく（1回）"],
    face: "thinking",
    basis: "動きの種類は5つで、セリフに応じるものが無い",
  },
  {
    scene: "依頼・補足・答えを送った瞬間",
    now: ["still", "動かない"],
    next: ["nod", "うなずく（1回）"],
    face: "default",
    basis: "同上。最初のセリフまでの中央値は7秒",
  },
  {
    scene: "作業が完了した",
    now: ["bounce", "跳ねる"],
    next: ["bounce", "跳ねる"],
    face: "proud",
    basis: "変えない",
  },
  {
    scene: "背景の作業を残してターンが閉じた",
    now: ["bounce", "跳ねる（閉じるたび）"],
    next: ["walk", "跳ねない（歩くまま）"],
    face: "default",
    basis: "疑似セッション background-task で data-motion を計測",
  },
  {
    scene: "利用者が止めた",
    now: ["bounce", "跳ねる（完了と同じ）"],
    next: ["breathe", "跳ねない（呼吸だけ）"],
    face: "default",
    basis: "中断は終わり方が完了と同じ形に畳まれる（turnEnding）",
  },
  {
    scene: "失敗した",
    now: ["flinch", "びくっ"],
    next: ["flinch", "びくっ"],
    face: "flustered",
    basis: "変えない",
  },
]

const ONCE = new Set(["nod", "beckon", "bounce", "flinch"])

function cell([motion, name], face, changed) {
  return `<td><span class="motion-cell${changed ? " is-changed" : ""}">
    <span class="motion-stage"><img class="motion-figure" src="${PORTRAIT}${face}.png" alt="" data-play="${motion}" /></span>
    <span class="motion-name">${name}</span>
  </span></td>`
}

document.querySelector("#motion-rows").innerHTML = MOTIONS.map(
  (row) =>
    `<tr><th scope="row">${row.scene}</th>${cell(row.now, row.face, false)}${cell(row.next, row.face, row.now[0] !== row.next[0])}<td>${row.basis}</td></tr>`,
).join("")

function play(figure) {
  figure.removeAttribute("data-motion")
  // 同じ動きを掛け直すために、いちど描かせる。
  void figure.offsetWidth
  if (figure.dataset.play !== "still") {
    figure.dataset.motion = figure.dataset.play
  }
}

for (const figure of document.querySelectorAll(".motion-figure")) {
  play(figure)
  if (ONCE.has(figure.dataset.play)) {
    // 呼ぶは3回で 10.8 秒かかるので、掛け直しの間を空ける。
    setInterval(() => play(figure), figure.dataset.play === "beckon" ? 13000 : 2600)
  }
}

// 画は 1400×900 で開き、枠の幅に合わせて縮める。
const resize = new ResizeObserver((entries) => {
  for (const entry of entries) {
    entry.target.style.setProperty("--k", String(entry.contentRect.width / 1400))
  }
})

// 見えているあいだだけ読み込む。見えなくなったら外して、動きを止める。
const watch = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      const frame = entry.target
      if (entry.isIntersecting && frame.firstElementChild === null) {
        const page = document.createElement("iframe")
        page.src = frame.dataset.src
        page.title = frame.nextElementSibling?.querySelector("b")?.textContent ?? "見本"
        page.setAttribute("scrolling", "no")
        frame.append(page)
      } else if (!entry.isIntersecting) {
        frame.replaceChildren()
      }
    }
  },
  { rootMargin: "120px 0px" },
)

for (const frame of document.querySelectorAll(".frame")) {
  resize.observe(frame)
  watch.observe(frame)
}
