// 融合案の見本の切り替え。URL の検索引数から場面とパックを読み、body の印・素材・入力欄の中身を決める。

const SCENES = ["read", "greet", "work", "ask"]
const PACKS = {
  tsukumo: { name: "つくも", accent: "#6fe3cd" },
  shirasuzu: { name: "白鈴", accent: "#f9c3cd" },
}

const params = new URLSearchParams(location.search)
const requested = params.get("scene")
const scene = SCENES.includes(requested) ? requested : SCENES[0]
const packId = Object.hasOwn(PACKS, params.get("pack")) ? params.get("pack") : "tsukumo"
const pack = PACKS[packId]

document.body.dataset.scene = scene
if (params.get("bar") === "0") {
  document.body.dataset.bar = "0"
}

// 別のパックでも成り立つかを見るために、背景・立ち絵・差し色・名前を差し替える。
if (packId !== "tsukumo") {
  const root = document.documentElement
  root.style.setProperty("--accent", pack.accent)
  root.style.setProperty("--art", `url("../../../../characters/${packId}/background.png")`)
  for (const image of document.querySelectorAll('img[src*="/characters/tsukumo/"]')) {
    image.src = image.getAttribute("src").replace("/characters/tsukumo/", `/characters/${packId}/`)
  }
  for (const name of document.querySelectorAll("[data-pack-name]")) {
    name.textContent = pack.name
  }
}

for (const link of document.querySelectorAll('.mock-bar-group[data-param="scene"] a')) {
  const next = new URLSearchParams({ scene: link.dataset.value })
  if (packId !== "tsukumo") {
    next.set("pack", packId)
  }
  link.href = `?${next}`
  if (link.dataset.value === scene) {
    link.setAttribute("aria-current", "true")
  }
}

const draft = document.querySelector("#draft")
if (draft !== null) {
  draft.placeholder = `${pack.name} への依頼を書く`
  if (scene === "read") {
    draft.value =
      "2行目の文言は「ほかのタブを見ているとき」にそろえてほしい。ほかの画面と同じ言い方にしたい。"
  }
  if (scene === "work") {
    draft.placeholder = `${pack.name} への補足を書く`
  }
  if (scene === "ask") {
    draft.placeholder = "選択肢以外の答えを書く"
  }
}

// 新しい紙を下端に出す。scroll-initial-target を持たないブラウザでは、ここで下端へ送る。
const stream = document.querySelector(".stream")
if (stream !== null && !CSS.supports("scroll-initial-target", "nearest")) {
  stream.scrollTop = stream.scrollHeight
}

document.querySelector(".composer")?.addEventListener("submit", (event) => {
  event.preventDefault()
})
