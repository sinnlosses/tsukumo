// レポートと進行の出し方の3案の比較ページ。案ごとの文と数を一覧で持ち、見本（index.html）を縮小して並べる。
// 数は 1400×900 の見本を scripts/capture/capture-view.ts の --measure で測った値（2026-11-15）。

const PLANS = [
  {
    id: "base",
    no: "1",
    name: "今の計画のまま",
    pick: "",
    idea: "ADR 0058 と見本 A2 のとおり。進行の帯は1行、フェーズごとの札が流れに並び、今のフェーズの札に「いま」と「できた」が出る。レポートは今の頭（完了の札・確かめたこと・かかった時間）のまま載せる。",
    flowWork: 702,
    flowBack: 702,
    nowAt: "流れの途中",
    nowMove: "620px → 675px（セリフのたびに動く）",
    currentNames: 2,
    doneNames: 2,
    next: "丸を1つずつ押す",
    head: 383,
    favor: "紙の末尾（431px 下）",
    pros: ["ADR 0058 と GH-2405 の計画を変えずに進められる", "フェーズが始まった位置に札が残り、流れを上から読むと章立てになる"],
    cons: [
      "今のフェーズの名前が、帯と流れの札の2か所に出る",
      "「いま」の行がセリフのたびに上へ流れ、のぞく位置が定まらない",
      "利用者への用件は紙の末尾で、頭には「お願い 1 ↓」の印だけが出る",
    ],
    links: [],
  },
  {
    id: "tail",
    no: "2",
    name: "帯と末尾の行",
    pick: "採用（2026-11-15）",
    idea: "帯は位置（どのフェーズか）だけを言い、「いま何をしているか」は流れの末尾の1行に、回る印と一緒に出す。流れに足すのは済んだことだけで、今のフェーズの札は置かない。「手順」を押すと、計画の全体とフェーズごとの手順が帯の下に開いたままになる。レポートは結論の直後に確かさを置き、利用者への用件「あなたの番」はいちばん下に置く。",
    flowWork: 702,
    flowBack: 702,
    nowAt: "入力欄の 40px 上",
    nowMove: "729px → 729px（動かない）",
    currentNames: 1,
    doneNames: 2,
    next: "「手順」を1回押す",
    head: 127,
    favor: "レポートの末尾（147px 下）。入力欄の上に知らせ",
    pros: [
      "「いま」と回る印が、入力欄のすぐ上の決まった位置に出る",
      "流れは足すだけで、書き換わる札が無い",
      "A2 の見た目と流れの高さがそのまま",
      "「手順」を開くと、案3 と同じ一覧が開いたままになる（そのあいだの流れの高さは 451px）",
      "書き手の道具（report・work_plan）に欄を足さない",
    ],
    cons: [
      "これからのフェーズの名前は、「手順」を押すまで読めない",
      "済んだフェーズの名前は、流れの札とやり取りの列（目次）の2か所に出る",
    ],
    links: [
      ["「手順」を開いた形", "open=steps", "work"],
      ["読む場面で「手順」を開いた形", "open=steps", "read"],
      ["末尾の「あなたの番」まで送った形", "at=end", "read"],
    ],
  },
  {
    id: "shelf",
    no: "3",
    name: "頭に計画の一覧",
    pick: "",
    idea: "働くあいだ、中央の列の頭に計画の一覧（済んだ・今・これから）を開いたまま置く。「いま」は一覧の今の行に出す。流れは投稿とセリフとレポートだけになる。終わると一覧は帯の1行に畳まれ、押すと道筋とかかった時間が開く。レポートの頭は案2 と同じ。",
    flowWork: 511,
    flowBack: 465,
    nowAt: "頭の一覧の今の行",
    nowMove: "181px → 292px（一覧の中で下がる）",
    currentNames: 1,
    doneNames: 1,
    next: "常に見える",
    head: 127,
    favor: "レポートの末尾（147px 下）。入力欄の上に知らせ",
    pros: [
      "計画の全体が、押さずに1か所で読める",
      "フェーズの名前の置き場が1か所になる（流れにもやり取りの列にも出ない）",
      "以前の画面の「紙の中の計画の一覧」に近い",
    ],
    cons: [
      "働くあいだの流れの高さが 702px から 511px に減る（4フェーズのとき。増えるとさらに減る）",
      "ADR 0058 の「フェーズの札は流れの中」を改める必要がある",
      "お伺いが届いたら一覧を畳む決まりが要り、畳むたびに流れの高さが変わる",
    ],
    links: [["道筋を開いた形", "open=path", "read"]],
  },
]

const PLACES = [
  ["状態の語（作業中・完了など）", "帯", "帯", "頭の一覧の1行目"],
  ["フェーズの位置", "帯の丸", "帯の丸", "頭の一覧（畳むと丸）"],
  ["今のフェーズの名前", "帯と、流れの今の札", "帯", "頭の一覧"],
  ["いま走っている手順", "流れの今の札（流れの途中）", "流れの末尾の行", "頭の一覧の今の行"],
  ["済んだフェーズのまとめ", "流れの札。押す: 丸の吹き出し", "流れの札", "頭の一覧"],
  ["これからのフェーズの名前", "押す: 丸の吹き出し（1つずつ）", "押す:「手順」の一覧（全部）", "頭の一覧"],
  ["道具の呼び出しの一覧", "押す:「手順」（今と同じ、帯の下の一覧）", "押す:「手順」の一覧の、フェーズごとの中", "見本では未設計"],
  ["回る印", "見本 A2 では未定（今の実物は、帯の今のフェーズの番号の外周）", "流れの末尾の行の頭の1個", "見本では未設計"],
  ["離れていたあいだの境目", "無い", "流れの線", "流れの線と、一覧の印"],
  ["終わり方（完了・止めた・失敗）", "帯と、紙の頭の札", "帯", "帯（畳んだ一覧）"],
  [
    "利用者への用件",
    "紙の末尾。頭には「お願い 1 ↓」の印",
    "紙の末尾の「あなたの番」。入力欄の上に知らせの1行",
    "紙の末尾の「あなたの番」。入力欄の上に知らせの1行",
  ],
  ["検証の結果と裏取り", "紙の頭。裏取りの印は無い", "紙の頭。記録あり・申告のみの印つき", "紙の頭。記録あり・申告のみの印つき"],
  ["フェーズごとのかかった時間", "紙の頭", "「手順」の一覧を開いた中", "頭の一覧を開いた中"],
]

const VERDICTS = { adopt: "採る", later: "後で", drop: "採らない" }

const CARRY = [
  ["道具の1行を人の言葉の実況にする（GH-2355）", "「pnpm run test を走らせている」", "adopt", "tsukumo が道具の名前と入力から作るので、書き手の欄は増えない。"],
  ["止まって見えるときの言い方（GH-2358）", "待ち・再試・上限・動かないの固定の文", "adopt", "長い検査のあいだに「止まってはいない」と言える。出来事の無い時間を数えるだけで出せる。"],
  ["離れていたあいだのまとめ（GH-2354・GH-2367）", "紙の頭に「離れていた 23 分のあいだに…」", "adopt", "形を替えて採る。1本の流れでは「ここから新しい」の線が同じ役を持つ。前に見た位置はタブのメモリだけに置く。"],
  ["委譲先の進みを役ごとの1行で（GH-2357）", "紙の「任せた」の行", "adopt", "「いま」の行に役の名前を添える。ブラウザのメモリにだけ置く決まり（ADR 0056 論点 6）は変えない。"],
  ["タブの題に状態を出す（GH-2359 の一部）", "「● あなたの番」など", "adopt", "複数の部屋を並べる使い方で、開かずに番が分かる。今は答え待ちの「●」だけが出る。"],
  ["「あなたの番」（GH-2334）", "判定の行の直後の箱", "adopt", "形を替えて採る。位置は今と同じレポートのいちばん下（利用者の決定）。名前と、続けて頼める選択肢を足し、「お願い 1 ↓」の印は入力欄の上の知らせの1行へ移す。欄は増えない。"],
  ["確かさの台帳と「記録あり・申告のみ」（GH-2350）", "落ちた → 確かめていない → 確かめた の順", "adopt", "今の総括行と開く行に、打ったコマンドとの照合の印を足す。欄は増えない。"],
  ["判定の行（GH-2334）", "済んだ・一部済んだ・あなたの番・止めた・失敗", "adopt", "欄にせず、今の task.outcome・checks・失敗の記録から導いて帯の状態の語にそろえる。紙の頭の「完了」の札は外す。"],
  ["計画を道筋として1か所に置く（ADR 0056 論点 1）", "計画が紙の末尾の道筋になる", "adopt", "形を替えて採る。フェーズごとの時間を紙の頭から「手順」の一覧へ移す。結論から本文までが 383px から 127px になる。"],
  ["見込みの時間と「いつもは」の幅（GH-2358）", "「いつもは 6〜9分」", "later", "似た作業の記録が要る。何件から出すかを、記録を数えてから決める。"],
  ["やり直しの周と、計画を直した理由（GH-2345・GH-2357）", "「2周目 ― 指摘 3 件」", "later", "work_plan に欄が要り、書き手の道具の定義が長くなる。"],
  ["前回との対応（GH-2353）", "解決・新しく・残っている", "later", "直しを頼んだあとの2回目のレポートで効く。report に欄が要る。"],
  ["置いた前提（ADR 0056 論点 2）", "本文の「置いた前提」の節", "later", "まず今の Claims の「推定」で書き、足りなければ欄にする。"],
  ["背面のときの通知と音（GH-2359）", "割り込みの段", "later", "通知の許しを求める時機が決まっていない。"],
  ["出どころの番号（GH-2350）", "文末の上付きの番号と欄外", "drop", "今の path:line で場所は指せる。行内の記法と検査が1種類増える。"],
  ["案内の付箋（GH-2352）", "欄外にキャラクターの一言", "drop", "締めのセリフが流れでレポートの直前に出るので、同じ役になる。紙にセリフを出さない決まりとも合う。"],
  ["読む深さの3段（GH-2334）", "一目・本文・記録の切り替え", "drop", "1本の流れでは紙の下に何も無く、畳んでも得が無い。頭の行が「一目」の役を持つ。"],
]

const CONTROLS = {
  moment: ["work", "back", "read"],
  size: ["1400x900", "1920x1080"],
  cols: ["3", "2", "1"],
}

const params = new URLSearchParams(location.search)
const state = Object.fromEntries(
  Object.entries(CONTROLS).map(([name, allowed]) => {
    const value = params.get(name)
    return [name, allowed.includes(value) ? value : allowed[0]]
  }),
)

function sampleUrl(id) {
  return `index.html?plan=${id}&moment=${state.moment}`
}

function listItems(lines) {
  return lines.map((line) => `<li>${line}</li>`).join("")
}

function card(plan) {
  const links = plan.links.map(
    ([label, open, moment]) =>
      `<a href="index.html?plan=${plan.id}&moment=${moment}&${open}" target="_blank" rel="noopener">${label}</a>`,
  )
  return `
    <article class="card" data-id="${plan.id}">
      <header class="card-head">
        <span class="letter">${plan.no}</span>
        <h2>${plan.name}</h2>
        ${plan.pick === "" ? "" : `<span class="pick">${plan.pick}</span>`}
      </header>
      <div class="frame">
        <iframe title="案${plan.no} の見本" loading="lazy" tabindex="-1"></iframe>
        <a class="frame-link" target="_blank" rel="noopener" aria-label="案${plan.no}（${plan.name}）を実寸で開く"></a>
      </div>
      <p class="idea">${plan.idea}</p>
      ${links.length === 0 ? "" : `<p class="card-links">${links.join("")}</p>`}
      <dl class="facts">
        <div><dt>流れの高さ（働く）</dt><dd>${plan.flowWork}px</dd></div>
        <div><dt>「いま」の位置</dt><dd>${plan.nowAt}</dd></div>
        <div><dt>今のフェーズの名前</dt><dd>${plan.currentNames}か所</dd></div>
        <div><dt>これからの名前</dt><dd>${plan.next}</dd></div>
        <div><dt>用件の位置（読む）</dt><dd>${plan.favor}</dd></div>
      </dl>
      <div class="judge">
        <section><h3>長所</h3><ul>${listItems(plan.pros)}</ul></section>
        <section><h3>短所</h3><ul>${listItems(plan.cons)}</ul></section>
      </div>
    </article>`
}

// 列ごとにいちばん良い値（高さは大きい方、置き場の数と頭の高さは小さい方）を太字にする。
function cell(plan, key, { unit, better }) {
  const values = PLANS.map((other) => other[key])
  const best = better === "max" ? Math.max(...values) : Math.min(...values)
  const text = `${plan[key]}${unit}`
  return plan[key] === best ? `<td class="num"><b>${text}</b></td>` : `<td class="num">${text}</td>`
}

function row(plan) {
  return `
    <tr>
      <th scope="row"><span class="letter">${plan.no}</span>${plan.name}</th>
      ${cell(plan, "flowWork", { unit: "px", better: "max" })}
      ${cell(plan, "flowBack", { unit: "px", better: "max" })}
      <td>${plan.nowMove}</td>
      ${cell(plan, "currentNames", { unit: "か所", better: "min" })}
      ${cell(plan, "doneNames", { unit: "か所", better: "min" })}
      ${cell(plan, "head", { unit: "px", better: "min" })}
      <td>${plan.favor}</td>
    </tr>`
}

const cards = document.querySelector("#cards")
cards.innerHTML = PLANS.map(card).join("")

document.querySelector("#summary").innerHTML = `
  <thead>
    <tr>
      <th scope="col">案</th>
      <th scope="col">流れの高さ（働く）</th>
      <th scope="col">流れの高さ（戻る）</th>
      <th scope="col">「いま」の行の上端（働く → 戻る）</th>
      <th scope="col">今のフェーズの名前</th>
      <th scope="col">済んだフェーズの名前</th>
      <th scope="col">結論から本文まで（読む）</th>
      <th scope="col">利用者への用件（読む）</th>
    </tr>
  </thead>
  <tbody>${PLANS.map(row).join("")}</tbody>`

document.querySelector("#places").innerHTML = `
  <thead>
    <tr><th scope="col">情報</th>${PLANS.map((plan) => `<th scope="col">案${plan.no} ${plan.name}</th>`).join("")}</tr>
  </thead>
  <tbody>
    ${PLACES.map(([name, ...cells]) => `<tr><th scope="row">${name}</th>${cells.map((text) => `<td>${text}</td>`).join("")}</tr>`).join("")}
  </tbody>`

document.querySelector("#carry").innerHTML = `
  <thead>
    <tr><th scope="col">以前の改修</th><th scope="col">以前の形</th><th scope="col">扱い</th><th scope="col">わけ</th></tr>
  </thead>
  <tbody>
    ${CARRY.map(
      ([name, form, verdict, reason]) =>
        `<tr><th scope="row">${name}</th><td>${form}</td><td><span class="verdict" data-verdict="${verdict}">${VERDICTS[verdict]}</span></td><td>${reason}</td></tr>`,
    ).join("")}
  </tbody>`

function sampleSize() {
  const [width, height] = state.size.split("x").map(Number)
  return { width, height }
}

// 見本は実寸の iframe を枠の幅に合わせて縮める。
function fit(frame) {
  frame.style.setProperty("--scale", String(frame.clientWidth / sampleSize().width))
}

const frames = [...cards.querySelectorAll(".frame")]
const watcher = new ResizeObserver((entries) => {
  for (const entry of entries) {
    fit(entry.target)
  }
})
for (const frame of frames) {
  watcher.observe(frame)
}

function apply() {
  const { width, height } = sampleSize()
  const root = document.documentElement
  root.style.setProperty("--cols", state.cols)
  root.style.setProperty("--sample-w", String(width))
  root.style.setProperty("--sample-h", String(height))
  for (const frame of frames) {
    const url = sampleUrl(frame.closest(".card").dataset.id)
    const sample = frame.querySelector("iframe")
    if (sample.dataset.url !== url) {
      sample.dataset.url = url
      sample.src = `${url}&bar=0`
    }
    frame.querySelector(".frame-link").href = url
    fit(frame)
  }
  for (const choices of document.querySelectorAll(".seg")) {
    for (const button of choices.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.value === state[choices.dataset.control]))
    }
  }
  history.replaceState(null, "", `?${new URLSearchParams(state)}`)
}

for (const choices of document.querySelectorAll(".seg")) {
  choices.addEventListener("click", (event) => {
    const button = event.target.closest("button")
    if (button === null) {
      return
    }
    state[choices.dataset.control] = button.dataset.value
    apply()
  })
}

apply()
