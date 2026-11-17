// やり取りの列の「畳んだ形」と「始め方の一覧のあいだの出し方」の見比べのページ。
// 見本（index.html）を枠に入れ、左上の範囲だけを切り出して、実寸に近い大きさで並べる。

const pack = new URLSearchParams(location.search).get("pack") === "shirasuzu" ? "shirasuzu" : "tsukumo"

// view は切り出す範囲（左上からの幅と高さ。px）。
function shot(query, title, note, view) {
  const src = `index.html?design=now&${query}&pack=${pack}`
  return `<figure class="shot">
    <figcaption><a href="${src}">${title}</a><span>${note}</span></figcaption>
    <div class="frame" style="--w: 1400; --h: 900; --vw: ${view.width}; --vh: ${view.height}">
      <iframe src="${src}&bar=0" title="${title}" tabindex="-1"></iframe>
    </div>
  </figure>`
}

const CORNER = { width: 330, height: 250 }
const WELCOME = { width: 560, height: 330 }

document.querySelector("#folded").innerHTML = [
  shot("moment=many&folded=1&form=now", "今の形", "42×54 の箱に山形だけ", CORNER),
  shot("moment=many&folded=1&form=bar", "1 見出しの帯", "頭の行を残し、件数を足す", CORNER),
  shot("moment=many&folded=1&form=here", "2 現在地の帯", "帯に、見ているやり取りの1行を足す", CORNER),
  shot("moment=many&folded=1&form=chip", "3 小さい札", "名前と件数だけの口", CORNER),
].join("")

document.querySelector("#toggle").innerHTML = [
  shot("moment=many&form=bar", "開いた状態", "山形は上向き。口は右端", CORNER),
  shot("moment=many&folded=1&form=bar", "畳んだ状態", "山形は下向き。口は同じ位置", CORNER),
].join("")

document.querySelector("#first").innerHTML = [
  shot("moment=first&empty=now", "今の形", "列ごと出ない", WELCOME),
  shot("moment=first&empty=bar", "1 見出しの帯", "「やり取り 0」で置き場を示す", WELCOME),
  shot("moment=first&empty=guide", "2 案内つき", "並ぶことと、キーを2行で言う", WELCOME),
].join("")

document.querySelector("#sent").innerHTML = [
  shot("moment=first&empty=bar", "依頼を送る前", "「やり取り 0」の帯", CORNER),
  shot("moment=work&form=bar", "最初の依頼を送ったあと", "同じ頭の行の下へ1件目が伸びる", CORNER),
].join("")

const fit = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const width = Number(entry.target.style.getPropertyValue("--vw"))
    entry.target.style.setProperty("--fit", String(entry.contentRect.width / width))
  }
})
for (const frame of document.querySelectorAll(".frame")) {
  fit.observe(frame)
}
