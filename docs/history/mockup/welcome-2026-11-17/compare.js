// 初期表示（迎える場面）の見比べのページ。見本（index.html）を形ごとの枠に入れ、枠の幅に合わせて縮める。

const STATES = ["full", "tasks", "none", "writing", "loading", "unwritten"]
const params = new URLSearchParams(location.search)
const state = STATES.includes(params.get("state")) ? params.get("state") : "full"
const pack = params.get("pack") === "tsukumo" ? "tsukumo" : "shirasuzu"

const FORMS = [
  ["now", "今の形", "今の画面を測って写した形"],
  ["a", "A ひと声と一手", "声の定位置の挨拶と、そのすぐ上のおすすめの1行"],
  ["b", "B 引き継ぎ", "A の形に、前回のまとめの紙を流れへ足す"],
  ["c", "C 返事で始める", "おすすめ3件を、まだ送っていない自分の投稿として並べる"],
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

const fill = (id, shots) => {
  document.querySelector(id).innerHTML = shots.join("")
}

fill(
  "#forms",
  FORMS.map(([form, title, note]) => shot(`form=${form}&state=${state}`, title, note)),
)

fill("#keys", [
  shot("form=a&state=full&select=0", "A・空の入力欄で ↑", "いちばんのおすすめが選ばれ、送られる依頼が入力欄に出る"),
  shot("form=a&state=full&select=1", "A・もう一度 ↑", "畳んであった候補が上へ開き、2件目が選ばれる"),
  shot("form=a&state=full&open=1", "A・「ほか 2件」を押したとき", "上へ向けて開く。押した口と、いちばんのおすすめの行は動かない"),
  shot("form=c&state=full&select=1", "C・↑ を2回", "2件目の返事が選ばれる。フォーカスは入力欄のまま"),
])

fill("#sent", [
  shot("form=now&state=full&sent=1", "今の形", "始め方の一覧ごと、流れに入れ替わる"),
  shot("form=a&state=full&sent=1", "A・C", "候補と声が引いて、流れに投稿と「いまの行」が入る"),
  shot("form=b&state=full&sent=1", "B", "紙が流れの頭に残る"),
])

fill(
  "#wide",
  FORMS.map(([form, title]) => shot(`form=${form}&state=full`, title, "1920×1080", 1920, 1080)),
)

fill(
  "#middle",
  FORMS.map(([form, title]) => shot(`form=${form}&state=full`, title, "1000×800", 1000, 800)),
)

fill("#states", [
  shot("form=b&state=tasks", "B・前回の要約が無いとき", "紙は出ず、A と同じ形になる"),
  shot("form=a&state=none", "A・B・C・候補が無いとき", "声と入力欄だけになる"),
  shot("form=a&state=loading", "A・おすすめを選んでいるあいだ", "行と声の場所を先に取る。届いても入力欄は動かない"),
  shot("form=a&state=writing", "A・挨拶を書いているあいだ", "声の定位置に「…」が出る。候補は先に選べる"),
  shot("form=a&state=unwritten", "A・挨拶が書けなかったとき", "声の場所は空いたままで、候補の行は動かない"),
  shot("form=c&state=unwritten", "C・挨拶が書けなかったとき", "問いかけが無いまま、返事だけが並ぶ"),
  shot("form=a&state=full&long=1&open=1", "A・長い題", "題は2行まで折り返し、理由は1行で切る（全文は触れると読める）"),
  shot("form=b&state=full&long=1", "B・長い字（1000×800）", "紙の題は2行、まとめは3行まで", 1000, 800),
  shot("form=c&state=full&long=1", "C・長い依頼（1000×800）", "依頼の文は2行まで折り返す", 1000, 800),
])

for (const link of document.querySelectorAll("#states-tab a")) {
  const next = new URLSearchParams(location.search)
  next.set("state", link.dataset.value)
  link.href = `?${next.toString()}`
  if (link.dataset.value === state) {
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
