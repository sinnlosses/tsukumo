// 会話の流れの見比べのページ。見本（index.html）を形ごとの枠に入れ、枠の幅に合わせて縮める。

const MOMENTS = ["work", "ask", "late", "read"]
const params = new URLSearchParams(location.search)
const moment = MOMENTS.includes(params.get("moment")) ? params.get("moment") : "work"
const pack = params.get("pack") === "tsukumo" ? "tsukumo" : "shirasuzu"

const FORMS = [
  ["now", "今の形", "今の画面を測って写した形"],
  ["spec", "見本どおり", "採用済みの見本にあって、今の画面に無い形を入れた"],
  ["next", "提案まで", "見本どおりの上に、提案 A〜E を重ねた"],
]

// 提案ごとに、差がいちばん見える場面で、見本どおりの形と並べる。
const PLUS = [
  {
    id: "attach",
    title: "A 物をセリフに添える",
    text: "済んだフェーズの控え・質問の札・最終レポートの紙を、それを連れてきたセリフのすぐ下に添える。行の間は、同じ話し手の続き・セリフと添えた物・話し手の交代の3段にする。",
    moment: "late",
  },
  {
    id: "live",
    title: "B いまの一言",
    text: "立ち絵がいま従っているセリフを1件だけ明るくし、尾を立ち絵の側へ向ける。過ぎたセリフは一段静かにする。",
    moment: "work",
  },
  {
    id: "dialog",
    title: "C 質問を会話にする",
    text: "答えは利用者の投稿として右に残し、質問は聞いたセリフに添える1行にする。書いて答えられることの案内は、入力欄の上の1行だけにする。",
    moment: "late",
  },
  {
    id: "verb",
    title: "D 「いま」を動詞で言う",
    text: "流れの末尾の札を、道具の名前ではなく、していること（読んでいる・探している・書き換えている・コマンドを走らせている）と対象で言う。",
    moment: "work",
  },
  {
    id: "minute",
    title: "E 時刻は分が変わった行だけ",
    text: "同じ分の時刻をくり返さない。",
    moment: "late",
  },
]

function shot(query, title, note) {
  const src = `index.html?${query}&pack=${pack}`
  return `<figure class="shot">
    <figcaption><a href="${src}">${title}</a><span>${note}</span></figcaption>
    <div class="frame"><iframe src="${src}&bar=0" title="${title}" tabindex="-1"></iframe></div>
  </figure>`
}

document.querySelector("#forms").innerHTML = FORMS.map(([form, title, note]) =>
  shot(`form=${form}&moment=${moment}`, title, note),
).join("")

document.querySelector("#plus").innerHTML = PLUS.map(
  (plus) => `<h3>${plus.title}</h3>
    <p>${plus.text}</p>
    <div class="grid grid-2">
      ${shot(`form=spec&moment=${plus.moment}`, "見本どおり", "重ねる前")}
      ${shot(`only=${plus.id}&moment=${plus.moment}`, plus.title, "この提案だけを重ねた")}
    </div>`,
).join("")

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
    entry.target.style.setProperty("--fit", String(entry.contentRect.width / 1400))
  }
})
for (const frame of document.querySelectorAll(".frame")) {
  fit.observe(frame)
}
