// 並べて比べるページ。画（index.html）は見えているあいだだけ読み込み、幅に合わせて縮める。
// 動きの一覧と表情ごとの出方は、1回だけの動きを数秒おきに掛け直す。

const PORTRAIT = "../../../../characters/shirasuzu/"

// 提案 I: 表情ごとの、立ち絵の1回だけの動きと吹き出しの出方（voice.js の ARRIVAL と同じ対応）。
const ARRIVALS = [
  { expression: "default", label: "にっと", body: ["nod", "うなずく"], bubble: ["pop", "弾んで出る（今と同じ）"] },
  { expression: "thinking", label: "ふむ", body: ["lean", "身を乗り出す"], bubble: ["ease", "ゆっくり出る"] },
  { expression: "proud", label: "えへん", body: ["bounce", "跳ねる"], bubble: ["swell", "ふくらんで出る"] },
  { expression: "excited", label: "わくわく", body: ["bounce", "跳ねる"], bubble: ["swell", "ふくらんで出る"] },
  { expression: "flustered", label: "あわわ", body: ["flinch", "びくっ"], bubble: ["shake", "震えて出る"] },
  { expression: "curious", label: "きょとん", body: ["tilt", "首をかしげる"], bubble: ["ease", "ゆっくり出る"] },
  { expression: "sad", label: "しょんぼり", body: ["sink", "沈む"], bubble: ["sink", "上から沈んで出る"] },
  { expression: "bored", label: "たいくつ", body: ["sink", "沈む"], bubble: ["sink", "上から沈んで出る"] },
  { expression: "serious", label: "きりっ", body: ["still", "動かない"], bubble: ["snap", "すっと出る"] },
]

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
    basis: "B（採用済み）。疑似セッション work-strip-background で計測",
  },
  {
    scene: "答え待ち（質問・許可）",
    now: ["walk", "歩く（作業中と同じ）"],
    next: ["beckon", "呼ぶ（3回で止まる）"],
    face: "curious",
    basis: "B（採用済み）",
  },
  {
    scene: "セリフが届いた瞬間",
    now: ["still", "動かない（絵が替わるだけ）"],
    next: ["tilt", "表情に合った1回の動き"],
    face: "curious",
    basis: "I。上の表の9つ",
  },
  {
    scene: "依頼・補足・答えを送った瞬間",
    now: ["still", "動かない"],
    next: ["nod", "うなずく（1回）"],
    face: "default",
    basis: "B（採用済み）",
  },
  {
    scene: "入力欄に書いているあいだ",
    now: ["walk", "歩き続ける"],
    next: ["listen", "身を寄せて止まる"],
    face: "default",
    basis: "L",
  },
  {
    scene: "タスクの作業が完了した",
    now: ["bounce", "1回跳ねる"],
    next: ["celebrate", "2回跳ねて、光が散る"],
    face: "proud",
    basis: "M。光は index.html の完了した直後の場面で見える",
  },
  {
    scene: "短い答えが完了した",
    now: ["bounce", "1回跳ねる"],
    next: ["bounce", "1回跳ねる"],
    face: "default",
    basis: "変えない",
  },
  {
    scene: "背景の作業を残してターンが閉じた",
    now: ["bounce", "跳ねる（閉じるたび）"],
    next: ["walk", "跳ねない（歩くまま）"],
    face: "default",
    basis: "B（採用済み）。疑似セッション background-task で計測",
  },
  {
    scene: "利用者が止めた",
    now: ["bounce", "跳ねる（完了と同じ）"],
    next: ["breathe", "跳ねない（呼吸だけ）"],
    face: "default",
    basis: "B（採用済み）",
  },
  {
    scene: "失敗した",
    now: ["flinch", "びくっ"],
    next: ["flinch", "びくっ"],
    face: "flustered",
    basis: "変えない",
  },
]

const ONCE = new Set(["nod", "beckon", "bounce", "flinch", "tilt", "lean", "sink", "celebrate"])

function figure(motion, face) {
  return `<span class="motion-stage"><img class="motion-figure" src="${PORTRAIT}${face}.png" alt="" data-play="${motion}" /></span>`
}

function cell([motion, name], face, changed) {
  return `<td><span class="motion-cell${changed ? " is-changed" : ""}">${figure(motion, face)}<span class="motion-name">${name}</span></span></td>`
}

document.querySelector("#motion-rows").innerHTML = MOTIONS.map(
  (row) =>
    `<tr><th scope="row">${row.scene}</th>${cell(row.now, row.face, false)}${cell(row.next, row.face, row.now[0] !== row.next[0])}<td>${row.basis}</td></tr>`,
).join("")

document.querySelector("#arrival-rows").innerHTML = ARRIVALS.map(
  (row) =>
    `<tr><th scope="row">${row.label}<small>${row.expression}</small></th>
      <td><span class="motion-cell">${figure(row.body[0], row.expression)}<span class="motion-name">${row.body[1]}</span></span></td>
      <td><span class="motion-cell"><span class="demo-bubble bubble-say" data-arrival="${row.bubble[0]}">架空のセリフ</span><span class="motion-name">${row.bubble[1]}</span></span></td></tr>`,
).join("")

function play(target) {
  target.removeAttribute("data-motion")
  // 同じ動きを掛け直すために、いちど描かせる。
  void target.offsetWidth
  if (target.dataset.play !== "still") {
    target.dataset.motion = target.dataset.play
  }
}

for (const target of document.querySelectorAll(".motion-figure")) {
  play(target)
  if (ONCE.has(target.dataset.play)) {
    // 呼ぶは3回で 10.8 秒かかるので、掛け直しの間を空ける。
    setInterval(() => play(target), target.dataset.play === "beckon" ? 13000 : 2600)
  }
}

for (const bubble of document.querySelectorAll(".demo-bubble")) {
  const arrive = () => {
    bubble.classList.remove("is-arriving")
    void bubble.offsetWidth
    bubble.classList.add("is-arriving")
  }
  arrive()
  setInterval(arrive, 2600)
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
