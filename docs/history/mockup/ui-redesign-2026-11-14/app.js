/*
  使い捨ての試作「会話画面の再デザイン 3案」のスクリプト。本番のコードではない。テストもエラー処理も持たない。
  3案は入口の置き場・タスクの詳細の見せ方・使用量の出し方が違い、舞台・紙・入力欄は共通。
  中身はすべて架空（依頼・タスクの ID・レポート・ファイル名・数）。実物の会話や課題ではない。
*/
(() => {
  const CHAR = "../../../../characters/shirasuzu/"
  const VARIANTS = [
    ["a", "上の帯"],
    ["b", "サイドバーの頭"],
    ["c", "縦のレール"],
  ]
  const MOMENTS = [
    ["greet", "待機"],
    ["work", "作業"],
    ["deliver", "完了"],
    ["quick", "計画なしの作業"],
  ]
  const isWorking = () => state.moment === "work" || state.moment === "quick"
  const PAGES = { character: "キャラクター", achievement: "成果", usage: "使用量", settings: "設定" }
  const q = new URLSearchParams(location.search)
  const state = {
    variant: q.get("variant") || "a",
    moment: q.get("moment") || "work",
    tab: q.get("tab") || "work",
    side: q.get("side") || "tasks",
    filter: q.get("filter") || "all",
    select: q.get("select") || "",
    map: q.get("map") === "1",
    usageAt: "17:25",
  }
  if (q.get("bar") === "0") document.body.classList.add("no-bar")

  const ICONS = {
    work: '<rect x="3" y="7.5" width="18" height="12" rx="2.5"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 13h18"/>',
    chat: '<path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4.5 19.5l1.3-4A7.5 7.5 0 1 1 20 11.5Z"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1-3.5 4-5 7-5s6 1.5 7 5"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6"/>',
    gauge: '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="m12 13 3.5-4"/><circle cx="12" cy="13.5" r="1.2"/>',
    sliders:
      '<path d="M4 7h9M18 7h2M4 17h3M12 17h8"/><circle cx="15.5" cy="7" r="2.3"/><circle cx="9.5" cy="17" r="2.3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4.5V11h-6.5"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
    image:
      '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m5 17 4.5-4.5 3.5 3.5 2.5-2.5L20 17"/>',
    slash: '<path d="M17 4 7 20"/>',
    at: '<circle cx="12" cy="12" r="3.6"/><path d="M15.6 8.5v4.6a2.4 2.4 0 0 0 4.9 0V12a8.5 8.5 0 1 0-3.4 6.8"/>',
    heading: '<path d="M7 5v14M17 5v14M7 12h10"/>',
    flame:
      '<path d="M12 3c1 3.6 5 5.6 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4 .2 1.6 1 2.4 1.8 2.6C10.4 9.2 10.8 6 12 3Z"/>',
    loop: '<path d="m16.5 3.5 3 3-3 3"/><path d="M4.5 11V9.5a3 3 0 0 1 3-3h12"/><path d="m7.5 20.5-3-3 3-3"/><path d="M19.5 13v1.5a3 3 0 0 1-3 3h-12"/>',
    shield: '<path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.4 7 9 4.1-1.6 7-4.8 7-9V6z"/>',
  }
  const icon = (name, size = 16, cls = "") =>
    `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`

  /* ── 架空のデータ ─────────────────────────────── */
  const ST = {
    doing: { label: "進行中", mark: '<span class="st doing" title="進行中"></span>' },
    ready: { label: "着手できる", mark: '<span class="st ready" title="着手できる"></span>' },
    ask: { label: "回答待ち", mark: '<span class="st ask" title="回答待ち">?</span>' },
    blocked: { label: "依存待ち", mark: '<span class="st blocked" title="依存待ち"></span>' },
    hold: { label: "保留", mark: '<span class="st hold" title="保留">‖</span>' },
    draft: { label: "下書き", mark: '<span class="st draft" title="下書き"></span>' },
    done: { label: "完了", mark: `<span class="st done" title="完了">${icon("check", 15)}</span>` },
  }
  const WAIT = ["ask", "blocked", "hold", "draft"]
  const GROUPS = [
    ["doing", "進行中", (t) => t.state === "doing"],
    ["ready", "着手できる", (t) => t.state === "ready"],
    ["wait", "待ち", (t) => WAIT.includes(t.state)],
    ["done", "今日済んだ", (t) => t.state === "done"],
  ]
  function tasks() {
    const own = { greet: "ready", work: "doing", deliver: "done", quick: "ready" }[state.moment]
    return [
      {
        id: "T-240",
        title: "入力欄を下端に固定し、迎えると働くの切り替えで跳ばないようにする",
        model: "sonnet",
        loop: true,
        state: own,
        where: "この部屋",
        since: "3:12",
        rec: state.moment === "greet",
        why: "前回の続き。計画は確認済み",
        goal: "迎えると働くで入力欄の位置が変わり、切り替えのたびに跳んで見える。",
        todo: ["入力欄を紙の外へ出して下端に固定する", "迎えるの始め方を入力欄の上に積む", "幅 1400 と 720 の画を撮り直す"],
        done: ["姿勢を切り替えても入力欄の上端が動かない", "E2E が通る"],
      },
      {
        id: "T-239",
        title: "使用量の3行と取り直しのボタンをサイドバーの下に置く",
        model: "sonnet",
        loop: true,
        state: "doing",
        where: "tsukumo-2",
        since: "15分",
        goal: "5時間と7日間の使用量が画面のどこにも出ておらず、紙を開かないと残りが分からない。",
        todo: ["サイドバーの下に3行の欄を足す", "取り直しのボタンをつなぐ"],
        done: ["開かずに5時間・7日間・文脈が読める"],
      },
      {
        id: "T-241",
        title: "入力欄の文字を 16px にして iOS のズームを抑止する",
        model: "sonnet",
        loop: true,
        state: "ready",
        rec: true,
        why: "前回の採点で最大の減点項目",
        goal: "iOS では 16px 未満の入力欄にフォーカスすると画面が拡大され、戻すのに操作が要る。",
        todo: ["入力欄と検索欄の字を 16px にする", "狭い幅の行の高さを合わせ直す", "幅 390 で拡大が起きないことを撮る"],
        done: ["幅 390 でフォーカスしても拡大しない", "広い幅の見た目が変わらない"],
      },
      {
        id: "T-238",
        title: "セッション一覧に検索欄と要約を復元する",
        model: "sonnet",
        loop: true,
        state: "ready",
        goal: "移行でセッションの検索と要約が無くなり、目当ての回を探すのに開いて確かめる手間が増えた。",
        todo: ["サイドバーにセッションのタブを足す", "日付の群と要約の1行を出す", "検索欄で題と要約を絞る"],
        done: ["題の一部で目当てのセッションが1件に絞れる", "要約が1行で読める"],
      },
      {
        id: "T-236",
        title: "進行バーを紙の上端に固定する",
        model: "opus",
        loop: false,
        state: "ready",
        goal: "長い計画を転がすと、段の位置が画面の外へ出て今どこか分からなくなる。",
        todo: ["紙の頭を上端に留める", "留めたときの影と余白を決める"],
        done: ["転がしても段の位置が見えている"],
      },
      { id: "T-233", title: "キャラクターの切替を1操作に短縮する", model: "sonnet", loop: true, state: "ready" },
      { id: "T-229", title: "プラン使用量の取得に失敗したときの表示を決める", model: "sonnet", loop: false, state: "ready" },
      { id: "T-231", title: "タスク一覧の入口を狭い幅に追加する", model: "sonnet", loop: true, state: "ask", note: "入口の位置を回答待ち" },
      { id: "T-225", title: "ショートカットの一覧を1か所に集約する", model: "sonnet", loop: true, state: "blocked", note: "T-238 の完了待ち" },
      { id: "T-221", title: "レポートの表の配色を再検討する", model: "opus", loop: false, state: "hold", note: "配色の方針待ち" },
      { id: "T-244", title: "揺れるテストを隔離の段に移す", model: "sonnet", loop: true, state: "draft", note: "承認待ち" },
      { id: "T-234", title: "余白の尺度を8段に整理する", model: "sonnet", loop: true, state: "done", note: "11:20" },
      { id: "T-212", title: "起動時の推薦カードを3枚にする", model: "sonnet", loop: true, state: "done", note: "09:40" },
    ].map((t) => ({
      created: "11/14",
      deps: t.state === "blocked" ? "T-238" : "なし",
      goal: "架空の背景。いまの画面で困っていることを1〜2文で書く。",
      todo: ["架空の手順1", "架空の手順2"],
      done: ["架空の完了条件"],
      ...t,
    }))
  }
  const SESSIONS = [
    ["今日", "doing", "入力欄を下端に固定する", "いま", "……ん、画面の側を直してます。"],
    ["今日", "done", "余白の尺度を8段に整理", "11:20", "尺度、きれいに揃いましたの。"],
    ["今日", "ask", "タスク一覧の入口を狭い幅に追加", "09:02", "入口の位置、どちらにしますか。"],
    ["昨日", "done", "通知音の設定を確認", "18:40", "鈴の音、ちゃんと鳴りました。"],
    ["昨日", "hold", "レポートの表の配色を再検討", "14:05", "途中で止めてあります。"],
    ["それ以前", "done", "起動時の推薦カードを3枚に", "11/12", "3枚とも収まりましたの。"],
  ]
  const USAGE = [
    ["5時間", "5h", 34, "20:00 に戻る"],
    ["7日間", "7d", 52, "11/18 に戻る"],
    ["文脈", "文脈", 61, "圧縮まで 33.5k"],
  ]
  const SAY = {
    greet: ["16:58", "ぬしさま、おかえりなさい。昨日の続きが、ひとつ残ってますの。"],
    work: ["16:04", "……ん、画面の側を直してます。もう少し待ってくださいな。"],
    deliver: ["16:11", "ふふ、入力欄がもう跳ばなくなりましたの。"],
    quick: ["17:02", "……ん、見てきますね。"],
  }
  const PORTRAIT = { greet: "default", work: "thinking", deliver: "proud", quick: "thinking" }

  /* ── 入口（案ごとに別の形） ─────────────────────── */
  const NAV = [
    ["work", "仕事", "work"],
    ["chat", "雑談", "chat"],
    ["character", "キャラ", "user"],
    ["achievement", "成果", "trophy"],
    ["usage", "使用量", "gauge"],
    ["settings", "設定", "sliders"],
  ]
  const lamp = `<span class="count" title="今日 19 つ灯した">${icon("flame", 12)}19</span>`
  const placeHtml = () =>
    `<button class="place" data-act="side" data-v="sessions" title="セッションの一覧を開く"><b>tsukumo-3</b><span class="quiet">/</span><span class="session">入力欄の下端のずれ</span>${icon("chev", 14)}</button>`
  // ほかの画面を開いているあいだだけ、作業が続いていることを「仕事」の入口の点で知らせる（紙の頭が隠れるため）
  const running = (id) =>
    id === "work" && isWorking() && state.tab !== "work" ? '<i class="dot" title="作業が続いている"></i>' : ""
  const tabBtn = ([id, label, ic], cls = "tab") =>
    `<button class="${cls}" role="tab" aria-selected="${state.tab === id}" data-act="tab" data-v="${id}">${icon(ic, 16)}<span>${label}</span>${id === "achievement" ? lamp : ""}${running(id)}</button>`

  function topbarHtml() {
    return `<header id="topbar" data-zone="入口 — 行き先は全部この1行" style="--zone:#8fd3ff">
      <div class="tb-left">
        ${placeHtml()}
        <nav class="tabs" role="tablist" aria-label="画面">
          <i class="sep"></i>${tabBtn(NAV[0])}${tabBtn(NAV[1])}<i class="sep"></i>${tabBtn(NAV[2])}${tabBtn(NAV[3])}${tabBtn(NAV[4])}
        </nav>
      </div>
      <div class="tb-right">
        <button class="search" data-act="toast" data-v="検索（⌘K）は今の実物のまま">${icon("search", 15)}<span class="grow" style="text-align:left">検索</span><kbd>⌘K</kbd></button>
        ${tabBtn(NAV[5])}
      </div>
    </header>`
  }
  function sideHeadB() {
    return `<div class="b-head" data-zone="入口 — サイドバーの頭の1行" style="--zone:#8fd3ff">
      <div style="display:flex;align-items:center">${placeHtml()}<span class="grow"></span>
        <button class="icon-btn" title="検索 ⌘K" data-act="toast" data-v="検索（⌘K）は今の実物のまま" style="margin-right:8px">${icon("search", 16)}</button></div>
      <nav class="b-menu" role="tablist" aria-label="画面">
        <span class="seg">
          <button aria-pressed="${state.tab !== "chat"}" data-act="tab" data-v="work">仕事</button>
          <button aria-pressed="${state.tab === "chat"}" data-act="tab" data-v="chat">雑談</button>
        </span>
        ${[NAV[2], NAV[3], NAV[5]].map((n) => tabBtn(n, "item")).join("")}
      </nav>
    </div>`
  }
  function railHtml() {
    const item = (n) => tabBtn(n, "r-item")
    return `<nav id="rail" role="tablist" aria-label="画面" data-zone="入口と使用量 — 右端の縦の帯" style="--zone:#8fd3ff">
      ${item(NAV[0])}${item(NAV[1])}<hr />${item(NAV[2])}${item(NAV[3])}
      <span class="grow"></span>
      <button class="r-usage" data-act="tab" data-v="usage" title="使用量を開く（${state.usageAt} 時点）">
        ${USAGE.map(([, short, v]) => `<span class="ring"><i style="--v:${v}">${v}</i>${short}</span>`).join("")}
      </button>
      <button class="icon-btn" data-act="reload" title="使用量を取り直す">${icon("refresh", 15)}</button>
      <hr />
      <button class="r-item" data-act="toast" data-v="検索（⌘K）は今の実物のまま">${icon("search", 16)}<span>検索</span></button>
      ${item(NAV[5])}
    </nav>`
  }

  /* ── 舞台: 名前・セリフ・やり取りだけ ─────────── */
  function stageHtml() {
    const you = (text, current = false) =>
      `<button class="you" aria-current="${current}" data-act="toast" data-v="この回のレポートを紙に出す（今の実物のまま）"><b>あなた</b>${text}</button>`
    const line = (time, text) => `<p class="line"><time>${time}</time>${text}</p>`
    const flow = {
      greet: "",
      quick: you("parseId の呼び出し元を調べて", true),
      work:
        you("入力欄のずれの原因を調査して") +
        line("15:44", "下端のずれ、46px ありました。") +
        you("/next-task T-240", true) +
        line("16:01", "計画は今の main のままで使えましたの。"),
      deliver:
        you("入力欄のずれの原因を調査して") +
        line("15:44", "下端のずれ、46px ありました。") +
        you("/next-task T-240", true) +
        line("16:01", "計画は今の main のままで使えましたの。") +
        line("16:04", "……ん、画面の側を直してます。"),
    }[state.moment]
    const [time, text] = SAY[state.moment]
    return `<section id="stage" aria-label="キャラクター" data-zone="キャラクター — 名前・セリフ・やり取りだけ">
      <div class="flow">${flow}</div>
      <div class="bubble"><header><b>白鈴</b><time>${time}</time></header><p>${text}</p></div>
      <img class="figure" alt="白鈴" src="${CHAR}${PORTRAIT[state.moment]}.png" />
    </section>`
  }

  /* ── 紙: 状態・進行・本文だけ ──────────────────── */
  const flames = (lit, total) =>
    `<span class="flames">${Array.from({ length: total }, (_, i) =>
      icon("flame", i === lit - 1 ? 17 : 13, i < lit ? "" : "off"),
    ).join("")}</span>`
  function paperHtml() {
    if (state.tab === "chat")
      return `<h1>雑談</h1><p class="quiet">雑談の配置は今の実物のまま（この試作では描いていない）。入口の「雑談」が選ばれた状態だけを見せている。</p>`
    if (state.moment === "greet")
      return `<h1>何から始める？</h1>
        <p class="quiet">入力欄から頼める。タスクは右の一覧で行を選ぶと詳細が出て、そのまま依頼できる。</p>
        <article class="resume">
          <span class="quiet">前回の続き</span>
          <b>入力欄を下端に固定する</b>
          <span class="quiet">5段のうち2段まで済んでいる。計画は確認済み。</span>
          <button class="btn primary" data-act="request" data-id="T-240">続きを頼む</button>
        </article>
        <div class="hints"><span><kbd>/</kbd> コマンド</span><span><kbd>@</kbd> ファイル</span><span><kbd>⌘K</kbd> 検索</span></div>`
    // 計画を持たない作業では、吹き出しに出していた「手元」を、計画の一覧の中と同じ形の「いま」の1行で紙の頭の下に出す
    if (state.moment === "quick")
      return `<div class="p-head"><span class="badge now">働いている</span><span class="quiet">経過 0:42</span></div>
        <div class="hands" style="margin-top:14px"><div><b>いま</b><span>parseId の呼び出し元を探している</span><time>3秒前</time></div></div>`
    if (state.moment === "work")
      return `<div class="p-head"><span class="badge now">働いている</span>${flames(3, 5)}<span>5段のうち3段目</span><span class="quiet">経過 3:12</span></div>
        <ol class="plan">
          <li><span class="mark">${icon("flame", 15)}</span><span class="quiet" style="font-size:14px">▸ 済んだ 2 段</span></li>
          <li><span class="mark">${icon("flame", 17)}</span><div>
            <h3>修正<small>並列 2</small></h3>
            <div class="hands">
              <div><b>任せた</b><span>実装役 A — サーバを修正・型検査が通過（架空 3,152 件）</span><time>2分前</time></div>
              <div><b>任せた</b><span>実装役 B — 画面を修正・幅 1400 の2枚目を撮影中</span><time>いま</time></div>
            </div></div></li>
          <li class="todo"><span class="mark">${icon("flame", 15)}</span><span>検証</span></li>
          <li class="todo"><span class="mark">${icon("flame", 15)}</span><span>受け入れ</span></li>
        </ol>`
    return `<div class="p-task"><span class="tag">T-240</span><b>入力欄を下端に固定する</b><span class="badge ok">${icon("check", 13)}完了</span><span class="grow"></span><button class="btn ghost">${icon("expand", 14)}広げる</button></div>
      <div class="p-verdict"><span class="badge ok">${icon("check", 13)}済んだ</span>${flames(5, 5)}<span>5段・計 6:48</span><span class="quiet">変更 4 ファイル</span><span style="color:var(--ok)">✓ 3</span><span class="grow"></span>
        <span class="seg"><button>一目</button><button aria-pressed="true">本文</button><button>記録</button></span></div>
      <h1>入力欄が画面の下端に固定され、迎えると働くの切り替えでも跳ばなくなった。</h1>
      <div class="yours"><b>あなたの番</b>幅 720 の実機で、キーボードを出したときの位置を一度見てほしい（架空のお願い）。</div>
      <p class="quiet" style="font-size:12.5px">確かめた — 3件</p>
      <ul class="checks">
        <li><span class="y">✓</span><span>pnpm run check（架空 3,152 件）</span></li>
        <li><span class="y">✓</span><span>幅 1400 と 720 で入力欄の上端が同じ位置</span></li>
        <li><span class="y">✓</span><span>E2E 118 件</span></li>
      </ul>
      <h2>入力欄を紙の外に出して下端へ固定した（架空）</h2>
      <table>
        <tr><th>場面</th><th>前</th><th>後</th></tr>
        <tr><td>迎える</td><td>紙の中ほど</td><td>下端から 16px</td></tr>
        <tr><td>働く</td><td>下端から 62px</td><td>下端から 16px</td></tr>
      </table>`
  }
  function composerHtml() {
    const working = isWorking()
    return `<div class="composer">
      <textarea placeholder="白鈴 への依頼を書く" rows="1"></textarea>
      <div class="c-foot">
        <button class="icon-btn" title="画像を添える">${icon("image", 17)}</button>
        <button class="icon-btn" title="コマンド">${icon("slash", 17)}</button>
        <button class="icon-btn" title="ファイル">${icon("at", 17)}</button>
        <button class="icon-btn" title="見出し">${icon("heading", 17)}</button>
        <button class="run-chip">Fable 5.2${icon("chev", 12)}</button>
        <button class="run-chip">xhigh${icon("chev", 12)}</button>
        <button class="run-chip">${icon("shield", 13)}編集を確認${icon("chev", 12)}</button>
        <span class="grow"></span>
        <button class="btn tonal" ${working ? "disabled" : ""} style="${working ? "opacity:.5" : ""}">${icon("plus", 14)}新規</button>
        <kbd style="margin:0 6px">${working ? "⌘." : "⌘⏎"}</kbd>
        <button class="send ${working ? "stop" : ""}" title="${working ? "中断" : "送信"}">${icon(working ? "stop" : "up", 17)}</button>
      </div>
    </div>`
  }
  function deskHtml() {
    return `<div id="desk"><main class="paper" aria-label="紙" data-zone="レポート — 状態・進行・本文だけ" style="--zone:#7ee081">${paperHtml()}</main>${composerHtml()}</div>`
  }
  function pageHtml() {
    const span = state.variant === "b" ? "2" : "2 / 4"
    return `<div id="page" style="grid-column:${span}"><div class="sheet">
      <h1>${PAGES[state.tab]}</h1>
      <p class="quiet">中身は今の実物のまま（この試作では描いていない）。入口の「${PAGES[state.tab]}」が選ばれ、「仕事」で元の紙へ戻れることだけを見せている。</p>
      <div class="ph"><i></i><i></i><i></i></div>
    </div></div>`
  }

  /* ── サイドバー: タスク・セッション・使用量 ─────── */
  const selected = () => tasks().find((t) => t.id === state.select)
  const shown = () => {
    const f = { all: () => true, doing: GROUPS[0][2], ready: GROUPS[1][2], wait: GROUPS[2][2] }[state.filter]
    return tasks().filter(f)
  }
  function detailHtml(t, { close = false, brief = false } = {}) {
    const s = ST[t.state]
    const list = (items) => `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>`
    const act =
      t.state === "ready"
        ? `<button class="btn primary" data-act="request" data-id="${t.id}">依頼する ⏎</button>`
        : `<span class="quiet" style="font-size:12px">${t.state === "doing" ? `${t.where}で進行中（${t.since}）` : t.state === "done" ? `${t.note} に完了` : t.note}</span>`
    return `<div class="detail">
      <div class="d-top">${s.mark}<span class="d-state">${s.label}</span><span class="mono">${t.id}</span><span class="tag">${t.model}</span>${t.loop ? `<span class="t-meta" style="min-height:0"><span class="loop">${icon("loop", 13)}</span>ループ可</span>` : ""}${close ? `<button class="icon-btn close" data-act="close" title="閉じる Esc">${icon("x", 15)}</button>` : ""}</div>
      <h3>${t.title}</h3>
      <p class="quiet" style="font-size:12px">作成 ${t.created}・依存 ${t.deps}${t.rec ? `・おすすめ: ${t.why}` : ""}</p>
      <h4>目的</h4><p>${t.goal}</p>
      ${brief ? "" : `<h4>やること</h4>${list(t.todo)}`}
      <h4>完了条件</h4>${list(t.done)}
      <div class="d-foot"><button class="btn ghost" data-act="toast" data-v="タスクの全文を紙に開く" style="padding:0 8px">${icon("expand", 13)}全文を開く</button><span class="grow"></span>${act}</div>
    </div>`
  }
  function rowHtml(t) {
    const sel = state.select === t.id
    const note =
      t.state === "doing"
        ? `<span class="note doing">${t.where}・${t.since}</span>`
        : WAIT.includes(t.state)
          ? `<span class="note ${t.state === "ask" ? "ask" : "wait"}">${t.note}</span>`
          : t.state === "done"
            ? `<span class="note">${t.note}</span>`
            : ""
    const right =
      sel && t.state === "ready"
        ? `<button class="btn primary go" data-act="request" data-id="${t.id}">依頼 ⏎</button>`
        : note
    return `<li class="t-row ${t.state}" role="option" aria-selected="${sel}" data-act="select" data-id="${t.id}">
      ${ST[t.state].mark}
      <div>
        <div class="t-meta"><span class="mono">${t.id}</span><span class="tag">${t.model}</span>${t.loop ? `<span class="loop" title="ループで進められる">${icon("loop", 13)}</span>` : ""}${t.rec ? '<span class="star" title="おすすめ">★</span>' : ""}${right}</div>
        <div class="t-title">${t.title}</div>
      </div>
      ${sel && state.variant === "b" ? `<div class="inline-detail" data-act="noop">${detailHtml(t, { brief: true })}</div>` : ""}
    </li>`
  }
  function taskListHtml() {
    const all = tasks()
    const open = all.filter((t) => t.state !== "done")
    const n = (i) => all.filter(GROUPS[i][2]).length
    const chip = (id, label, count) =>
      `<button class="chip" aria-pressed="${state.filter === id}" data-act="filter" data-v="${id}">${label}<i>${count}</i></button>`
    const rows = shown()
    const groups = GROUPS.filter(([id]) => state.filter === "all" || state.filter === id)
      .map(([, label, pick]) => {
        const items = rows.filter(pick)
        return items.length === 0 ? "" : `<li class="group"><b>${label}</b>${items.length}</li>${items.map(rowHtml).join("")}`
      })
      .join("")
    return `<div class="filters">${chip("all", "すべて", open.length)}${chip("doing", "進行中", n(0))}${chip("ready", "着手できる", n(1))}${chip("wait", "待ち", n(2))}</div>
      <ul class="t-list" role="listbox" aria-label="タスク" tabindex="0" data-zone="タスク — 状態の印・要約（題）・行ごとの依頼" style="--zone:#e3c766;position:relative">${groups}</ul>`
  }
  function sessionListHtml() {
    let last = ""
    return `<ul class="t-list" aria-label="セッション">${SESSIONS.map(([group, st, title, when, line]) => {
      const head = group === last ? "" : `<li class="group"><b>${group}</b></li>`
      last = group
      return `${head}<li class="se-row">${ST[st].mark}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${title}</span><span class="mono quiet">${when}</span><span class="last">${line}</span></li>`
    }).join("")}</ul>`
  }
  function usageHtml() {
    const entry = state.variant === "b"
    const title = entry
      ? `<button data-act="tab" data-v="usage" style="display:inline-flex;align-items:center;gap:2px"><b>使用量</b>${icon("right", 13)}</button>`
      : "<b>使用量</b>"
    return `<section class="usage" aria-label="使用量" data-zone="使用量 — 5時間・7日間・文脈と取り直し" style="--zone:#c7aef0;position:relative">
      <header>${title}<span class="grow"></span><span class="mono quiet">${state.usageAt} 時点</span><button class="icon-btn" data-act="reload" title="取り直す">${icon("refresh", 15)}</button></header>
      ${USAGE.map(([label, , v, back]) => `<div class="u-row"><span>${label}</span><span class="bar"><b style="width:${v}%"></b></span><span class="pct">${v}%</span><span class="back">${back}</span></div>`).join("")}
    </section>`
  }
  function sideHtml() {
    const open = tasks().filter((t) => t.state !== "done").length
    const tabs = `<div class="s-tabs" role="tablist" aria-label="一覧">
      <button class="tab" role="tab" aria-selected="${state.side === "tasks"}" data-act="side" data-v="tasks">タスク<i>${open}</i></button>
      <button class="tab" role="tab" aria-selected="${state.side === "sessions"}" data-act="side" data-v="sessions">セッション</button>
      <span class="grow"></span>
      <button class="btn ghost" data-act="toast" data-v="タスクの表を紙に開く（今のタスク一覧の画面）">${icon("expand", 13)}表で見る</button>
    </div>`
    const list = state.side === "tasks" ? taskListHtml() : sessionListHtml()
    const head = { a: "", b: sideHeadB(), c: `<div class="c-head">${placeHtml()}</div>` }[state.variant]
    const pane = () => {
      const t = selected() || tasks().find((x) => x.state === "doing") || tasks()[0]
      return `<div class="pane" data-zone="タスクの詳細 — 選んだ行の中身を常設" style="--zone:#e3c766;position:relative">${detailHtml(t)}</div>`
    }
    const foot = state.variant === "c" ? (state.side === "tasks" ? pane() : "") : usageHtml()
    return `<aside id="side" aria-label="サイドバー">${head}${tabs}${list}${foot}</aside>`
  }
  function peekHtml() {
    const t = selected()
    if (state.variant !== "a" || !t || state.side !== "tasks" || state.tab in PAGES) return ""
    return `<div class="peek" id="peek" data-zone="タスクの詳細 — 選んだ行の左に開く" style="--zone:#e3c766">${detailHtml(t, { close: true })}</div>`
  }
  function placePeek() {
    const peek = document.getElementById("peek")
    const row = document.querySelector('.t-row[aria-selected="true"]')
    if (!peek || !row) return
    const app = document.getElementById("app").getBoundingClientRect()
    const r = row.getBoundingClientRect()
    const top = Math.max(48, Math.min(r.top - app.top - 16, app.height - peek.offsetHeight - 14))
    peek.style.top = `${top}px`
    peek.style.setProperty("--arrow", `${Math.max(14, r.top - app.top + r.height / 2 - top - 6)}px`)
  }

  /* ── 描画 ─────────────────────────────────────── */
  function protoHtml() {
    const pick = (list, key) =>
      list
        .map(([id, label]) => `<button aria-current="${state[key] === id}" data-act="${key}" data-v="${id}">${key === "variant" ? `${id} ` : ""}${label}</button>`)
        .join("")
    return `<b>使い捨ての試作</b><span>再デザイン</span>
      <button data-act="step" data-v="-1" title="前の案">←</button>${pick(VARIANTS, "variant")}<button data-act="step" data-v="1" title="次の案">→</button>
      <span class="gap"></span><span>場面</span>${pick(MOMENTS, "moment")}
      <span class="gap"></span><button aria-current="${state.map}" data-act="map">置き場の枠</button>
      <span class="grow"></span><span>← → で案を切替・行を押すと詳細</span>`
  }
  function render() {
    document.body.dataset.variant = state.variant
    document.body.classList.toggle("map", state.map)
    const paged = state.tab in PAGES
    const body = paged
      ? pageHtml() + (state.variant === "b" ? sideHtml() : "")
      : deskHtml() + sideHtml()
    document.getElementById("app").innerHTML =
      '<div class="bg"></div>' +
      (state.variant === "a" ? topbarHtml() : "") +
      stageHtml() +
      body +
      (state.variant === "c" ? railHtml() : "") +
      peekHtml()
    document.getElementById("proto").innerHTML = protoHtml()
    document.querySelector('.t-row[aria-selected="true"]')?.scrollIntoView({ block: "nearest" })
    placePeek()
    const u = new URLSearchParams()
    for (const k of ["variant", "moment", "tab", "side", "filter", "select"]) if (state[k]) u.set(k, state[k])
    if (state.map) u.set("map", "1")
    if (document.body.classList.contains("no-bar")) u.set("bar", "0")
    history.replaceState(null, "", `?${u}`)
  }
  function toast(msg) {
    const el = document.getElementById("toast")
    el.textContent = msg
    el.classList.add("show")
    clearTimeout(toast.timer)
    toast.timer = setTimeout(() => el.classList.remove("show"), 1800)
  }
  function step(delta) {
    const i = VARIANTS.findIndex(([id]) => id === state.variant)
    state.variant = VARIANTS[(i + delta + VARIANTS.length) % VARIANTS.length][0]
    render()
  }
  function moveSelection(delta) {
    const rows = shown()
    const i = rows.findIndex((t) => t.id === state.select)
    state.select = rows[Math.max(0, Math.min(rows.length - 1, i + delta))].id
    render()
    document.querySelector('.t-row[aria-selected="true"]')?.scrollIntoView({ block: "nearest" })
    placePeek()
  }

  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-act]")
    if (!el) return
    const { act, v, id } = el.dataset
    if (act === "noop") return
    if (act === "variant" || act === "moment" || act === "tab" || act === "side" || act === "filter") {
      state[act] = v
      if (act === "side" && state.tab in PAGES) state.tab = "work"
    } else if (act === "step") return step(Number(v))
    else if (act === "map") state.map = !state.map
    else if (act === "select") state.select = state.select === id && state.variant !== "c" ? "" : id
    else if (act === "close") state.select = ""
    else if (act === "request") {
      event.stopPropagation()
      return toast(`${id} を依頼した（試作なので送らない）`)
    } else if (act === "reload") {
      state.usageAt = new Date().toTimeString().slice(0, 5)
      render()
      document.querySelectorAll('[data-act="reload"]').forEach((b) => b.classList.add("spin"))
      return toast("使用量を取り直した（試作）")
    } else if (act === "toast") return toast(v)
    render()
  })
  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea, [contenteditable]")) return
    if (event.key === "ArrowLeft") step(-1)
    else if (event.key === "ArrowRight") step(1)
    else if (event.key === "ArrowDown") moveSelection(1)
    else if (event.key === "ArrowUp") moveSelection(-1)
    else if (event.key === "Escape") {
      state.select = ""
      render()
    } else if (event.key === "Enter" && selected()?.state === "ready") toast(`${state.select} を依頼した（試作なので送らない）`)
    else return
    event.preventDefault()
  })
  window.addEventListener("resize", placePeek)
  render()
})()
