// 並べて比べるページ。画（index.html）は見えているあいだだけ読み込み、枠の幅に合わせて縮める。

const resize = new ResizeObserver((entries) => {
  for (const entry of entries) {
    entry.target.style.setProperty("--k", String(entry.contentRect.width / 1400))
  }
})

// 見えているあいだだけ読み込む。見えなくなったら外して、回る印を止める。
const watch = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      const frame = entry.target
      if (entry.isIntersecting && frame.firstElementChild === null) {
        const page = document.createElement("iframe")
        page.src = frame.dataset.src
        page.title = frame.nextElementSibling?.querySelector("b")?.textContent ?? "見本"
        page.setAttribute("scrolling", "no")
        page.setAttribute("tabindex", "-1")
        frame.append(page)
      } else if (!entry.isIntersecting) {
        frame.replaceChildren()
      }
    }
  },
  { rootMargin: "160px 0px" },
)

for (const frame of document.querySelectorAll(".frame")) {
  resize.observe(frame)
  watch.observe(frame)
  // 枠の下の説明に、その画を1枚で開く口を足す。
  const link = document.createElement("a")
  link.href = frame.dataset.src.replace("&bar=0", "")
  link.textContent = "1枚で開く"
  frame.nextElementSibling?.append(link)
}
