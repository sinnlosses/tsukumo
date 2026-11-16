// 会話の流れの状態の一覧。flow.js の部品を使い、作り直した形の文法で1つずつ組む。
// 中身はすべて架空で、実物の会話ではない。

/** 状態1つ。行は、時刻の出方を頭からやり直してから組む。 */
function state(title, note, rows) {
  lastMinute = ""
  return `<figure class="state">
    <figcaption><h2>${title}</h2><p>${note}</p></figcaption>
    <div class="state-flow">${rows().join("")}</div>
  </figure>`
}

function opened(html) {
  return html.replace("<details", "<details open")
}

function inquiryShell(kind, label, wait, body, foot) {
  return `<section class="inquiry thing wide">
    <header class="inquiry-head">
      <span class="inquiry-kind">${kind}</span><span class="inquiry-label">${label}</span>
      <span class="inquiry-wait">待って ${wait}</span>${EXPAND}
    </header>
    ${body}
    <footer class="inquiry-foot">${foot}</footer>
  </section>`
}

const ENTER = icon("enter", " icon-sm")
const GAP = '<span class="inquiry-foot-gap"></span>'

const KEEP_OR_DROP = [
  ["古い保存の鍵を残す", "読み替えを残し、次の版で消す。"],
  ["古い保存の鍵を消す", "古い鍵を読む端末では、並びが既定に戻る。"],
]

const TWELVE = [
  "今の形を調べる",
  "型を決める",
  "保存の層を足す",
  "読み込みを足す",
  "移行を書く",
  "一覧につなぐ",
  "設定につなぐ",
  "狭い画面を直す",
  "画で確かめる",
  "E2E を足す",
  "文書を直す",
  "検証する",
]

const STATES = [
  state(
    "末尾の行は、していること・対象・経過を言う",
    "道具の名前ではなく動詞で言う。道具でない状態も同じ言い方にそろえ、知らない道具は名前をそのまま添える。同じ手順が長く続いたら、印の回り方を遅くして添え書きを足す。",
    () => [
      nowPill("読んでいる", "task-list.ts", "2秒"),
      nowPill("コマンドを走らせている", "pnpm run test sort-order", "12秒"),
      nowPill("考えている", "", "18秒"),
      nowPill("委譲先に任せている", "実装役 · フェーズ 2/4 の実装", "3分12秒"),
      nowPill("レポートを書いている", "", "9秒"),
      nowPill("道具を使っている", "mcp__catalog__lookup", "3秒"),
      nowPill("コマンドを走らせている", "pnpm run check --full", "4分12秒", "長く掛かっている"),
    ],
  ),
  state(
    "隣り合う物とセリフは、届いた順のまま1組にする",
    "並べ替えない。控えが先に届けば控えが上、セリフが先ならセリフが上。相手が来なければ、そのまま1つで置く。",
    () => [
      group(slip(0), sayText(SAY.found[0], "14:26", false)),
      slip(1),
      sayText("保存の仕組みは入りました。", "14:28", false),
      sayText(
        "一覧の並び替えは、列の見出しを押したときと、絞り込みを変えたときの2か所で起きていました。どちらも同じ関数を通るので、保存はその1か所に入れます。狭い画面の一覧は別の部品なので、あとで同じ口をつなぎます。",
        "14:29",
        true,
      ),
    ],
  ),
  state(
    "答えは、利用者の投稿として残る",
    "選んだ・任せた・書いた、のどれも右の投稿になる。直近の答えには「答え直す」が付き、押すと訂正の補足が入力欄に下書きで入る（送らない）。",
    () => [
      post("端末ごとに保存", "14:28", "答え", REDO),
      post("端末ごとに保存（おすすめ）", "14:31", "任せた", REDO),
      post("両方に保存して、設定ファイルを優先して", "14:34", "答え", REDO),
    ],
  ),
  state(
    "質問が2問のとき",
    "頭に「1 / 2」が出るのは、2問以上のときだけ。",
    () => [
      group(
        sayText("……ん、決めてほしいことが2つあります。", "14:27", true),
        inquiryShell(
          "質問 1 / 2",
          QUESTION.label,
          "0:12",
          `<h3 class="inquiry-title">${QUESTION.text}</h3>
          <ol class="options">${QUESTION.options.map((option, index) => optionRow(option, index)).join("")}</ol>`,
          `<button class="door-button" type="button" disabled>戻る</button>${GAP}<button class="quiet-button" type="button">おすすめに任せる（${QUESTION.options[0][0]}）</button><button class="answer-button" type="button">次へ ${ENTER}</button>`,
        ),
      ),
    ],
  ),
  state(
    "戻せない選択肢は、確定を2段にする",
    "「戻せない」の選択肢を選んだときだけ、確定の口が2段目に替わる。2段目は ⏎ では確定せず、⇧⏎ かクリックで確定するので、⏎ の連打では越えない。おすすめが戻せない案のときは「任せる」を出さない。",
    () => [
      inquiryShell(
        "質問",
        "古い保存の鍵",
        "1:05",
        `<h3 class="inquiry-title">古い保存の鍵をどうしますか？</h3>
        <ol class="options">${optionRow(KEEP_OR_DROP[0], 0)}${optionRow(KEEP_OR_DROP[1], 1, '<span class="chip chip-warn">戻せない</span>')}</ol>`,
        `<span class="inquiry-step">戻せない操作。⏎ だけでは確定しない</span>${GAP}<button class="answer-button" type="button">これで確定する<kbd class="key">⇧⏎</kbd></button>`,
      ),
    ],
  ),
  state(
    "許可のお伺い",
    "質問と同じ形。対象のコマンドは全文を出す。",
    () => [
      inquiryShell(
        "許可",
        "Bash",
        "0:05",
        `<h3 class="inquiry-title">このコマンドを実行してよいですか？</h3>
        <code class="permit-command">rm -rf dist/browser</code>`,
        `${GAP}<button class="door-button" type="button">拒否する</button><button class="answer-button" type="button">許可する ${ENTER}</button>`,
      ),
    ],
  ),
  state(
    "状態の語の説明は、初回だけ出す",
    "「確かめた」「確度」は、お伺いに初めて出たときだけ1行の説明を添え、「分かった」を押すと次から出ない。",
    () => [
      `<section class="thing wide hinted">
        ${briefOf(QUESTION)}
        <p class="first-hint"><span>「確かめた」は今回の作業で実行して確認した事実、「確度」はおすすめへの自信の程度</span><button class="quiet-button" type="button">分かった</button></p>
      </section>`,
    ],
  ),
  state(
    "レポートの中の語と、余白の書き添えの案内も初回だけ",
    "「記録あり」「申告のみ」の説明と、字・行・案を選ぶと「聞く・頼む」が出ることの案内は、レポートに初めて出たときだけ添える。",
    () => [
      `<section class="thing wide hinted">
        <div class="report">${checksOf()}</div>
        <p class="first-hint"><span>「記録あり」は実行の記録と照合できた確認、「申告のみ」は記録と照合できない申告</span><button class="quiet-button" type="button">分かった</button></p>
        <p class="first-hint"><span>本文の字・行・案を選ぶと、その横に「聞く・頼む」が出る</span><button class="quiet-button" type="button">分かった</button></p>
      </section>`,
    ],
  ),
  state(
    "失敗で終わったとき",
    "失敗を言うセリフのすぐ下に置く。理由・詳細・残ったもの・次の行動を、開かずに読める。",
    () => [group(sayText(SAY.failed[0], "14:27", true), failure())],
  ),
  state(
    "利用者が止めたとき",
    "どこで止めたかと、残ったものを言う。続きを頼む文は入力欄に下書きで入る（送らない）。",
    () => [
      `<section class="thing wide halt">
        <header class="failure-head"><span class="failure-mark"></span>止めた</header>
        <p class="failure-reason">フェーズ 2/4「保存の仕組みを足す」の途中で止めた</p>
        <p class="failure-kept">残ったもの　済んだフェーズ 1/4・書き換えた 1 ファイル（<code>sort-order.ts</code>）</p>
        <p class="failure-doors"><button class="door-button" type="button">続きを頼む文を入力欄に入れる</button><button class="door-button" type="button">手順を見る</button></p>
      </section>`,
    ],
  ),
  state(
    "もう一度試しているとき",
    "末尾の行が、何回目かと待っている相手を言う。",
    () => [
      sayText("……ん、応えが無いので、もう一度試します。", "14:27", true),
      nowPill("もう一度試している", "API の応答待ち · 2回目", "8秒"),
    ],
  ),
  state(
    "作業中の補足と、その答え",
    "補足は依頼と同じ投稿の形で、札に「補足」と出る。答えはふつうのセリフ。",
    () => [
      sayText(SAY.found[0], "14:26", false),
      post("並び順は、昇順を既定にしておいて", "14:27", "補足"),
      sayText("昇順ですね。既定に入れておきます。", "14:27", true),
    ],
  ),
  state(
    "書きかけのレポート",
    "締めのセリフと紙は、同じ呼び出しで届く1組で、セリフを紙の上に置く。書いているあいだは、セリフの場所に末尾の行を置き、書き終えたらその場所で締めのセリフに替える。紙は動かない。",
    () => [
      group(
        nowPill("レポートを書いている", "", "9秒"),
        `<section class="thing paper wide is-draft">
        <div class="report">
          <p class="conclusion">タスク一覧の並び替えが、開き直しても<span class="draft-caret"></span></p>
          <div class="draft-line draft-line-long"></div>
          <div class="draft-line draft-line-short"></div>
        </div>
      </section>`,
      ),
    ],
  ),
  state(
    "離れていたあいだの境目",
    "境目の線は今の形のまま。線の前後で、1組の中の間は変えない。",
    () => [
      sayText(SAY.got[0], "14:25", false),
      '<div class="seam" role="separator"><span><b>ここから新しい</b>離れていた 4分</span></div>',
      group(slip(0), sayText(SAY.found[0], "14:29", true)),
    ],
  ),
  state(
    "フェーズが12あるときの進行の帯",
    "フェーズが9つ以上あるときは、済んだ丸を数1つにまとめて、今のフェーズの名前の幅を残す。右端は「手順 31件」と、何の数かを言う。",
    () => [
      `<header class="strip">${stripInner({ state: "作業中", current: 7, time: ["経過", "18分40秒"], steps: 31 }, TWELVE)}</header>`,
    ],
  ),
  state(
    "開閉の表現は1種",
    "作業の経過・聞いたときの詳細は、同じ山形の印で開閉する。進行の帯の「手順」も同じ向きの印。",
    () => [
      fold("作業の経過　4フェーズ・6分40秒・セリフ 6件・質問 1件", ""),
      opened(questionSlip()),
    ],
  ),
]

one("#states").innerHTML = STATES.join("")
