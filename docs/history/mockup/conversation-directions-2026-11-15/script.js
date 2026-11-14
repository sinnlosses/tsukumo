// 見本の切り替え。URL の検索引数から方向性と場面を読み、body の印と立ち絵の置き場を決める。

const VARIANTS = ["desk", "buddy", "stage"]
const SCENES = ["read", "work", "ask"]

const params = new URLSearchParams(location.search)

function pick(name, allowed) {
  const value = params.get(name)
  return allowed.includes(value) ? value : allowed[0]
}

const variant = pick("v", VARIANTS)
const scene = pick("scene", SCENES)

document.body.dataset.v = variant
document.body.dataset.scene = scene
if (params.get("bar") === "0") {
  document.body.dataset.bar = "0"
}

// 「手元の窓」だけ、キャラビューをやり取りの列の下へ移す。
if (variant === "desk") {
  const slot = document.querySelector('[data-slot="desk"]')
  const stage = document.querySelector(".stage")
  if (slot !== null && stage !== null) {
    slot.append(stage)
  }
}

for (const group of document.querySelectorAll(".mock-bar-group")) {
  const name = group.dataset.param
  const current = name === "v" ? variant : scene
  for (const link of group.querySelectorAll("a")) {
    const next = new URLSearchParams({ v: variant, scene })
    next.set(name, link.dataset.value)
    link.href = `?${next}`
    if (link.dataset.value === current) {
      link.setAttribute("aria-current", "true")
    }
  }
}

const draft = document.querySelector("#draft")
if (draft !== null) {
  if (scene === "read") {
    draft.value =
      "2行目の文言は「ほかのタブを見ているとき」にそろえてほしい。ほかの画面と同じ言い方にしたい。"
  }
  if (scene === "work") {
    draft.placeholder = "つくも への補足を書く"
  }
  if (scene === "ask") {
    draft.placeholder = "選択肢以外の答えを書く"
  }
}

document.querySelector(".composer")?.addEventListener("submit", (event) => {
  event.preventDefault()
})
