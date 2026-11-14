/*
  使い捨ての試作「会話画面の全面改良 3案」の共有スクリプト。本番のコードではない。テストもエラー処理も持たない。
  ここに置くのは、架空のデータ・アイコン・キーの受け口・3案で同じ形のダイアログ（検索とキーの一覧）だけ。
  配置と、キャラクター・セッション・タスク・進行の出し方は各案の HTML が持つ。
  中身はすべて架空（依頼・タスクの ID・レポート・ファイル名・数）。実物の会話や課題ではない。
*/
(() => {
  const ROOT = "../../../../characters/"
  const ALL = ["default", "thinking", "proud"]
  const PACKS = [
    {
      id: "shirasuzu",
      name: "白鈴",
      dir: ROOT + "shirasuzu",
      ext: "png",
      accent: "#f9c3cd",
      bg: true,
      portraits: ALL,
      tagline: "三味線と鈴を連れた猫の子",
      say: {
        greet: "ぬしさま、おかえりなさい。昨日の続きが、ひとつ残ってますの。",
        work: "……ん、画面の側を直してます。もう少し待ってくださいな。",
        deliver: "ふふ、入力欄がもう跳ばなくなりましたの。",
      },
      log: ["計画は今の main のままで使えましたの。", "下端のずれ、46px ありました。"],
      past: ["鈴の音、ちゃんと鳴りました。", "尺度、きれいに揃いましたの。"],
    },
    {
      id: "tsukumo",
      name: "つくも",
      dir: ROOT + "tsukumo",
      ext: "png",
      accent: "#6fe3cd",
      bg: true,
      portraits: ALL,
      tagline: "ターミナルに棲む狐の付喪神",
      say: {
        greet: "おかえり、きみ。昨日の続きがひとつ残ってるよ。",
        work: "いま画面の側を直してる。もう少しだけ待ってて。",
        deliver: "できたよ。入力欄、もう動かない。",
      },
      log: ["計画は今の main のままで使えたよ。", "下端のずれ、46px あったよ。"],
      past: ["通知の音、ちゃんと鳴ったよ。", "尺度、きれいに揃ったよ。"],
    },
    {
      id: "chou",
      name: "帳",
      dir: ROOT + "chou",
      ext: "png",
      // 実物の accent は #6a7180。暗い地の上の字に使うので、試作では明るく導出した値を置く
      accent: "#aab4c8",
      bg: true,
      portraits: ALL,
      tagline: "古い帳面の付喪神・記録係",
      say: {
        greet: "せんぱい、帳面は開いてあります。昨日の続きが1件です。",
        work: "記録中です。画面の修正が進行しています。",
        deliver: "記録しました。入力欄は固定されました。",
      },
      log: ["計画は現状のまま有効でした。", "下端のずれは 46px でした。"],
      past: ["通知音の確認を記録しました。", "尺度は8段に揃いました。"],
    },
    {
      id: "spirit",
      name: "つくもの精霊",
      dir: ROOT + "tsukumo-spirit",
      ext: "svg",
      accent: "#f2b0a0",
      bg: false,
      portraits: ALL,
      tagline: "道具に宿った小さな精霊",
      say: {
        greet: "あるじ、準備はできているよ。昨日の続きがあるね。",
        work: "いま画面を直しているところだよ。",
        deliver: "終わったよ、あるじ。入力欄は動かなくなった。",
      },
      log: ["計画はそのまま使えたよ。", "下端が 46px ずれていたよ。"],
      past: ["音はちゃんと鳴ったよ。", "尺度が揃ったよ、あるじ。"],
    },
  ]
  const MOMENTS = [
    ["greet", "待機"],
    ["work", "作業"],
    ["deliver", "完了"],
  ]
  const EXPR = { greet: "default", work: "thinking", deliver: "proud" }
  const params = new URLSearchParams(location.search)
  const state = {
    moment: params.get("moment") || "greet",
    pack: params.get("pack") || "shirasuzu",
    run: { model: "Fable 5.2", effort: "xhigh", perm: "編集を確認" },
  }
  const listeners = []
  const hooks = {}
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform)

  const pack = () => PACKS.find((p) => p.id === state.pack) || PACKS[0]
  const portrait = (p = pack(), expr = EXPR[state.moment]) =>
    `${p.dir}/${p.portraits.includes(expr) ? expr : "default"}.${p.ext}`
  const face = (p = pack()) => `${p.dir}/face.${p.ext}`

  function onAccent(hex) {
    const n = parseInt(hex.slice(1), 16)
    const l = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
    return l > 0.5 ? "#221a22" : "#ffffff"
  }
  function applyPack() {
    const p = pack()
    const s = document.body.style
    s.setProperty("--accent", p.accent)
    s.setProperty("--on-accent", onAccent(p.accent))
    s.setProperty("--bg-image", p.bg ? `url("${p.dir}/background.png")` : "none")
  }
  function set(patch) {
    Object.assign(state, patch)
    const q = new URLSearchParams(location.search)
    q.set("moment", state.moment)
    q.set("pack", state.pack)
    q.delete("open")
    history.replaceState(null, "", "?" + q)
    applyPack()
    listeners.forEach((f) => f())
    syncProto()
  }

  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    sliders:
      '<path d="M4 7h9M18 7h2M4 17h3M12 17h8"/><circle cx="15.5" cy="7" r="2.3"/><circle cx="9.5" cy="17" r="2.3"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
    image:
      '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m5 17 4.5-4.5 3.5 3.5 2.5-2.5L20 17"/>',
    keyboard:
      '<rect x="3" y="6.5" width="18" height="11" rx="2.5"/><path d="M7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17.5 10.5h.01M8 14h8"/>',
    flame:
      '<path d="M12 3c1 3.6 5 5.6 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4 .2 1.6 1 2.4 1.8 2.6C10.4 9.2 10.8 6 12 3Z"/>',
    panel: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M14.5 5v14"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1-3.5 4-5 7-5s6 1.5 7 5"/>',
    home: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
    spark:
      '<path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z"/><path d="m18.5 15.5.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    board:
      '<rect x="4" y="4.5" width="4.5" height="15" rx="1.2"/><rect x="9.75" y="4.5" width="4.5" height="10" rx="1.2"/><rect x="15.5" y="4.5" width="4.5" height="12.5" rx="1.2"/>',
    shield: '<path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.4 7 9 4.1-1.6 7-4.8 7-9V6z"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4.5V11h-6.5"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6"/>',
    clip: '<path d="M19 11.5 12.5 18a4.2 4.2 0 0 1-6-6L13 5.5a2.8 2.8 0 0 1 4 4L10.5 16a1.4 1.4 0 0 1-2-2l6-6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    cpu: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M10 3.5v3M14 3.5v3M10 17.5v3M14 17.5v3M3.5 10h3M3.5 14h3M17.5 10h3M17.5 14h3"/>',
  }
  const icon = (name, size = 16) =>
    `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`
  const kbd = (s) =>
    `<span class="keys">${s
      .split(" ")
      .map((k) => `<kbd>${!isMac && k === "⌘" ? "Ctrl" : k}</kbd>`)
      .join("")}</span>`
  const st = (s) =>
    ({
      now: '<span class="st now" title="作業中"></span>',
      done: `<span class="st ok" title="完了">${icon("check", 14)}</span>`,
      ok: `<span class="st ok" title="完了">${icon("check", 14)}</span>`,
      ask: '<span class="st ask" title="回答待ち">?</span>',
      stop: '<span class="st stop" title="中断">■</span>',
      todo: '<span class="st todo" title="未着手"></span>',
    })[s] || ""

  /* ── 架空のデータ ─────────────────────────────────── */
  function sessions() {
    const all = [
      { id: "s1", title: "入力欄を下端に固定する", task: "T-240", when: "いま", group: "今日", state: state.moment === "work" ? "now" : "ok", last: pack().say[state.moment], turns: 1, open: true },
      { id: "s2", title: "余白の尺度を8段に整理", task: "T-234", when: "11:20", group: "今日", state: "ok", last: pack().past[1], turns: 5 },
      { id: "s3", title: "タスク一覧の入口を狭い幅に追加", task: "T-231", when: "09:02", group: "今日", state: "ask", last: "入口の位置、どちらにしますか。", turns: 2 },
      { id: "s4", title: "通知音の設定を確認", task: "", when: "昨日 18:40", group: "昨日", state: "ok", last: pack().past[0], turns: 1 },
      { id: "s5", title: "レポートの表の配色を再検討", task: "T-219", when: "昨日 14:05", group: "昨日", state: "stop", last: "途中で止めてあります。", turns: 4 },
      { id: "s6", title: "起動時の推薦カードを3枚に", task: "T-212", when: "11/12", group: "それ以前", state: "ok", last: "3枚とも収まりましたの。", turns: 6 },
    ]
    return state.moment === "greet" ? all.slice(1) : all
  }
  function tasks() {
    const own = { greet: "ready", work: "doing", deliver: "done" }[state.moment]
    return [
      { id: "T-240", title: "入力欄を下端に固定する", size: "M", state: own, rec: 1, why: "昨日の続き。計画は確認済み" },
      { id: "T-241", title: "入力欄の文字を 16px にして iOS のズームを抑止", size: "S", state: "ready", rec: 2, why: "前回の採点で最大の減点項目" },
      { id: "T-238", title: "セッション一覧に検索欄と要約を復元", size: "M", state: "ready", rec: 3, why: "依存なしで着手できる" },
      { id: "T-236", title: "進行バーを紙の上端に固定", size: "M", state: "ready" },
      { id: "T-233", title: "キャラクターの切替を1操作に短縮", size: "S", state: "ready" },
      { id: "T-229", title: "プラン使用量を常時表示に復帰", size: "S", state: "ready" },
      { id: "T-231", title: "タスク一覧の入口を狭い幅に追加", size: "S", state: "ask", note: "入口の位置を回答待ち" },
      { id: "T-225", title: "ショートカット一覧を1か所に集約", size: "M", state: "blocked", note: "T-238 の完了待ち" },
      { id: "T-234", title: "余白の尺度を8段に整理", size: "M", state: "done" },
      { id: "T-212", title: "起動時の推薦カードを3枚に", size: "S", state: "done" },
    ]
  }
  function plan() {
    const done = state.moment === "deliver"
    return {
      title: "入力欄を下端に固定する",
      task: "T-240",
      elapsed: done ? "4:33" : "3:12",
      now: done ? 5 : 3,
      total: 5,
      phases: [
        { n: 1, name: "計画を確認", state: "done", dur: "0:21", sum: "計画は main の現状のまま有効だった。" },
        { n: 2, name: "現状を調査", state: "done", dur: "0:48", sum: "待機と作業で、入力欄の下端が 46px ずれていた。" },
        {
          n: 3,
          name: "修正",
          state: done ? "done" : "now",
          dur: done ? "2:24" : "2:03",
          sum: "入力欄を下端に固定し、開始方法を上に積んだ。",
          lanes: [
            { who: "実装役 A", name: "サーバを修正", state: "done", dur: "0:42", line: "型検査が通過（架空 3,152 件）" },
            { who: "実装役 B", name: "画面を修正", state: done ? "done" : "now", dur: done ? "2:24" : "2:03", line: done ? "幅 1400 の2枚を撮影した" : "幅 1400 の2枚目を撮影中" },
          ],
        },
        { n: 4, name: "検証", state: done ? "done" : "todo", dur: done ? "0:39" : "", sum: "単体 2,855 件と E2E 57 件が通過した。" },
        { n: 5, name: "受け入れ", state: done ? "done" : "todo", dur: done ? "0:21" : "", sum: "指摘なしで通過した。" },
      ],
    }
  }
  const segbar = (pl = plan()) =>
    `<span class="segbar" role="img" aria-label="${pl.total} 段のうち ${pl.now} 段目">${pl.phases.map((p) => `<i class="${p.state}"></i>`).join("")}</span>`

  /* ── 3案で同じ中身（紙・吹き出し・入力欄） ─────────────── */
  /* bare: 依頼文の行を出さない（採用案。依頼は舞台のログにだけ出す）。verdict: 判定の行の中身を差し替える */
  function reportHtml({ bare = false, verdict } = {}) {
    return `<div class="rp">
      ${bare ? "" : '<div class="req"><span class="mono">/next-task T-240</span><span>入力欄を下端に固定する</span></div>'}
      <div class="verdict">${verdict || `<span class="badge ok">${icon("check", 13)}完了</span><span>変更 6 ファイル</span><span>所要 4:33</span>`}<span class="grow"></span>
        <span class="seg"><button>一目</button><button aria-pressed="true">本文</button><button>記録</button></span></div>
      <h1>待機から作業へ移っても、入力欄が同じ高さに留まるようになった。</h1>
      <div class="figs">
        <div class="fig"><span>下端のずれ</span><b>0px</b><small>46px から</small></div>
        <div class="fig"><span>単体テスト</span><b>2,855</b><small>件が通過</small></div>
        <div class="fig"><span>E2E</span><b>57</b><small>件が通過</small></div>
      </div>
      <div class="turn"><h3>あなたの番</h3><p>幅 720 の画面は未確認。確認するか、このまま main へ送るかを決める。</p>
        <div class="replies"><button class="chip">${kbd("1")}幅 720 も確認して</button><button class="chip">${kbd("2")}このまま main へ送って</button><button class="chip">${kbd("3")}差分を見せて</button></div></div>
      <h2>確認したこと</h2>
      <ul class="checks">
        <li><span class="y">✓</span><span>pnpm run check</span><span class="mono quiet">単体 2,855・E2E 57</span></li>
        <li><span class="y">✓</span><span>幅 1400 で待機と作業の下端を比較</span><span class="mono quiet">差 0px</span></li>
        <li><span class="q">?</span><span>幅 720 の画面</span><span class="mono quiet">未確認</span></li>
      </ul>
      <h2>修正した場所</h2>
      <table><tr><th>場所</th><th>変更</th></tr>
        <tr><td class="mono">welcome-pane.module.css</td><td>開始方法を入力欄の上に積む配置へ変更</td></tr>
        <tr><td class="mono">paper-desk.tsx</td><td>待機でも入力欄を下端に配置</td></tr>
        <tr><td class="mono">layout.md</td><td>姿勢の表を更新</td></tr></table>
    </div>`
  }
  function workHtml() {
    const pl = plan()
    const cur = pl.phases[2]
    return `<div class="rp">
      <div class="req"><span class="mono">/next-task T-240</span><span>入力欄を下端に固定する</span></div>
      <h2 style="margin-top:14px">いま: ${cur.name}（並列 2）</h2>
      <div class="agents">${cur.lanes.map((l) => `<div class="agent">${st(l.state)}<span class="who">${l.who}</span><span class="what">${l.name} — ${l.line}</span><span class="mono quiet">${l.dur}</span></div>`).join("")}</div>
      <h2>ここまで</h2>
      <ul class="sofar">${pl.phases
        .filter((p) => p.state === "done")
        .map((p) => `<li>${st("done")}<div><b>${p.n} ${p.name}</b><span>${p.sum}</span></div><span class="mono quiet">${p.dur}</span></li>`)
        .join("")}</ul>
    </div>`
  }
  function logHtml() {
    // 待機では、前回までのセッションでキャラクターが言ったことを並べる（舞台の上側を空けない）
    if (state.moment === "greet")
      return `<div class="log"><p class="line"><time>昨日</time>${pack().past[0]}</p><p class="line"><time>11:20</time>${pack().past[1]}</p></div>`
    return `<div class="log"><p class="you"><b>あなた</b>/next-task T-240</p>${pack()
      .log.map((l, i) => `<p class="line"><time>16:0${i + 1}</time>${l}</p>`)
      .join("")}</div>`
  }
  function bubbleHtml() {
    const p = pack()
    const hand =
      state.moment === "work"
        ? `<div class="hand">${st("now")}<span>手元: 画面を撮影中</span><span class="grow"></span><span class="mono">0:19</span></div>`
        : ""
    return `<div class="bubble"><header><b>${p.name}</b><time class="mono">16:04</time></header><p>${p.say[state.moment]}</p>${hand}</div>`
  }
  function lampHtml() {
    return `<div class="lamp"><span>今日 <b>11</b> 灯</span><span class="week" role="img" aria-label="今週は6日点灯">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<span class="${i < 6 ? "lit" : ""}">${icon("flame", 14)}</span>`).join("")}</span></div>`
  }
  const runChips = () =>
    `<button class="run-chip" popovertarget="runPop" data-run="model" data-side="top">${icon("cpu", 14)}${state.run.model}${icon("chev", 12)}</button><button class="run-chip" popovertarget="runPop" data-run="effort" data-side="top">${state.run.effort}${icon("chev", 12)}</button><button class="run-chip" popovertarget="runPop" data-run="perm" data-side="top">${icon("shield", 14)}${state.run.perm}${icon("chev", 12)}</button>`
  function composerHtml({ rows = 3 } = {}) {
    const working = state.moment === "work"
    return `<div class="composer">
      <textarea rows="${rows}" placeholder="${pack().name}への依頼を書く（/ コマンド・@ ファイル）" data-main-input></textarea>
      <div class="c-foot">
        <button class="icon-btn" title="画像を添付">${icon("image", 17)}</button>
        <span class="sep"></span>${runChips()}<span class="grow"></span>
        <button class="btn ghost sm" data-act="newSession" ${working ? 'disabled title="ターン中は開始できない"' : ""}>${icon("plus", 14)}新規 ${kbd("⌘ ⇧ O")}</button>
        ${working ? `<button class="btn stop sm" data-act="stop">${icon("stop", 14)}中断 ${kbd("⌘ .")}</button>` : `<button class="btn primary sm" data-act="send">送信 ${kbd("⌘ ⏎")}</button>`}
      </div></div>`
  }

  /* ── 知らせ・ポップオーバー・ダイアログ ───────────────── */
  let toastEl
  let toastTimer
  function toast(msg) {
    toastEl?.remove()
    toastEl = document.createElement("div")
    toastEl.className = "toast"
    toastEl.setAttribute("role", "status")
    toastEl.textContent = msg
    const host = document.querySelector("dialog[open]") || document.body
    host.append(toastEl)
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl?.remove(), 2400)
  }
  function closeAll() {
    document.querySelectorAll("dialog[open]").forEach((d) => d.close())
    document.querySelectorAll("[popover]:popover-open").forEach((p) => p.hidePopover())
  }

  /* ポップオーバーは popovertarget で開き、開く直前に押したボタンの位置へ寄せる */
  let lastAnchor
  document.addEventListener(
    "click",
    (e) => {
      const b = e.target.closest?.("[popovertarget]")
      if (b) lastAnchor = b
    },
    true,
  )
  function pop(id, render) {
    const el = document.createElement("div")
    el.id = id
    el.className = "pop"
    el.popover = "auto"
    document.body.append(el)
    el.addEventListener("beforetoggle", (e) => {
      if (e.newState !== "open" || !lastAnchor) return
      el.innerHTML = render(lastAnchor)
      const a = lastAnchor.getBoundingClientRect()
      const s = el.style
      s.left = s.right = s.top = s.bottom = "auto"
      s.translate = "none"
      if (lastAnchor.dataset.align === "end") s.right = Math.max(8, innerWidth - a.right) + "px"
      else if (lastAnchor.dataset.align === "center") {
        s.left = a.left + a.width / 2 + "px"
        s.translate = "-50% 0"
      } else s.left = Math.max(8, a.left) + "px"
      if (lastAnchor.dataset.side === "top") s.bottom = innerHeight - a.top + 8 + "px"
      else s.top = a.bottom + 8 + "px"
    })
    return el
  }
  const RUN = {
    model: ["モデル", ["Fable 5.2", "Opus 5.5", "Sonnet 5.5", "Haiku 5.5"]],
    effort: ["考える深さ", ["low", "medium", "high", "xhigh", "max"]],
    perm: ["許可モード", ["毎回確認", "編集を確認", "計画のみ", "自動"]],
  }
  function initRunPop() {
    const el = pop("runPop", (a) => {
      const kind = a.dataset.run
      const [label, values] = RUN[kind]
      return `<div class="group-label">${label}（このセッション）</div>${values.map((v) => `<button class="row" data-run-set="${kind}" data-value="${v}" aria-selected="${state.run[kind] === v}"><span></span><span class="t mono">${v}</span>${state.run[kind] === v ? icon("check", 14) : "<span></span>"}</button>`).join("")}`
    })
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-run-set]")
      if (!b) return
      state.run[b.dataset.runSet] = b.dataset.value
      el.hidePopover()
      set({})
      toast(`${RUN[b.dataset.runSet][0]}を ${b.dataset.value} に変更した`)
    })
  }

  const SHORTCUTS = [
    [
      "全体",
      [
        ["⌘ K", "検索（操作・タスク・セッション・キャラクター）"],
        ["⌘ J", "タスクを選択して依頼"],
        ["⌘ O", "セッションを切替"],
        ["⌘ ⇧ O", "新規セッションを開始"],
        ["⌃ 1 … 9", "キャラクターを切替"],
        ["⌘ I", "進行の詳細を開閉"],
        ["⌘ ,", "設定"],
        ["⌘ /", "キーの一覧"],
      ],
    ],
    [
      "入力欄",
      [
        ["⌘ ⏎", "送信"],
        ["⌘ .", "中断"],
        ["/", "コマンドを補完"],
        ["@", "ファイルを補完"],
        ["esc", "重なりを閉じる"],
      ],
    ],
    [
      "紙",
      [
        ["⌥ ⌘ ↑ ↓", "前後のやり取りへ移動"],
        ["{ }", "前後の見出しへ移動"],
        ["1 … 9", "推薦を開始・問いに回答"],
        ["d", "読む深さを切替"],
        ["o", "節を開閉"],
      ],
    ],
  ]
  const keysheet = (() => {
    let dlg
    function open() {
      closeAll()
      if (!dlg) {
        dlg = document.createElement("dialog")
        dlg.className = "dlg keysheet"
        dlg.setAttribute("closedby", "any")
        dlg.setAttribute("aria-labelledby", "keysheetTitle")
        document.body.append(dlg)
      }
      // hooks.hideKeys: その案に無い操作のキー（例: 進行を常時出す採用案の ⌘ I）を一覧から外す
      const groups = SHORTCUTS.map(([g, rows]) => [g, rows.filter(([k]) => !(hooks.hideKeys || []).includes(k))])
      if (hooks.extraKeys) groups[2] = [groups[2][0], [...groups[2][1], ...hooks.extraKeys]]
      dlg.innerHTML = `<h2 id="keysheetTitle">キーの一覧</h2><div class="cols">${groups.map(([g, rows]) => `<div><h3>${g}</h3><ul>${rows.map(([k, a]) => `<li><span>${a}</span>${kbd(k)}</li>`).join("")}</ul></div>`).join("")}</div><div class="dlg-hints"><span>${kbd("esc")} 閉じる</span><span class="grow"></span><span>入力中でも ⌘ と ⌃ の組合せは有効</span></div>`
      dlg.showModal()
    }
    return { open }
  })()

  const palette = (() => {
    let dlg, input, list
    let scope = "all"
    let sel = 0
    let shown = []
    const SCOPES = [
      ["all", "すべて"],
      ["task", "# タスク"],
      ["session", "セッション"],
      ["char", "@ キャラクター"],
      ["cmd", "> 操作"],
    ]
    function entries() {
      const cmd = (t, k, run) => ({ scope: "cmd", g: "操作", lead: icon("spark", 15), t, m: "", k, run })
      return [
        cmd("新規セッションを開始", "⌘ ⇧ O", () => act.newSession()),
        cmd("セッションを切替", "⌘ O", () => hooks.sessions()),
        cmd("タスクを選択して依頼", "⌘ J", () => hooks.tasks()),
        ...((hooks.hideKeys || []).includes("⌘ I") ? [] : [cmd("進行の詳細を表示", "⌘ I", () => hooks.progress())]),
        cmd("キーの一覧を表示", "⌘ /", () => keysheet.open()),
        cmd("雑談に切替", "", () => toast("雑談に切替（試作では表示のみ）")),
        cmd("設定を開く", "⌘ ,", () => hooks.settings()),
        // hooks.extraCmds: その案だけが持つ移動先（[名前, キー, 動作] の並び）
        ...(hooks.extraCmds || []).map(([t, k, run]) => cmd(t, k, run)),
        ...PACKS.map((p, i) => ({ scope: "char", g: "キャラクター", lead: `<img class="face" width="24" height="24" alt="" src="${face(p)}">`, t: p.name, m: p.tagline, k: `⌃ ${i + 1}`, run: () => act.switchPack(p.id) })),
        ...tasks()
          .filter((t) => t.state === "ready")
          .map((t) => ({ scope: "task", g: "タスクを依頼", lead: `<span class="mono">${t.id}</span>`, t: t.title, m: "", k: "", hint: "⏎ 依頼", run: () => act.startTask(t.id) })),
        ...sessions().map((s) => ({ scope: "session", g: "セッション", lead: st(s.state), t: s.title, m: s.when, k: "", hint: "⏎ 開く", run: () => act.openSession(s.id) })),
        ...[
          ["/next-task", "着手できるタスクを1件進める"],
          ["/compact", "会話を要約して続ける"],
          ["/clear", "会話を消して開始し直す"],
        ].map(([t, m]) => ({ scope: "cmd", g: "コマンド", lead: '<span class="mono">/</span>', t, m, k: "", run: () => act.send() })),
      ]
    }
    function draw() {
      let q = input.value.trim().toLowerCase()
      let sc = scope
      const prefix = { "#": "task", "@": "char", ">": "cmd" }[q[0]]
      if (prefix) {
        sc = prefix
        q = q.slice(1).trim()
      }
      shown = entries().filter((e) => (sc === "all" || e.scope === sc) && (!q || (e.t + e.m + e.lead).toLowerCase().includes(q)))
      sel = Math.min(sel, Math.max(0, shown.length - 1))
      dlg.querySelector(".scopes").innerHTML = SCOPES.map(([id, label]) => `<button class="chip" data-scope="${id}" aria-pressed="${id === sc}">${label}</button>`).join("")
      let g = ""
      list.innerHTML = shown.length
        ? shown
            .map((e, i) => {
              const head = e.g !== g ? `<div class="group-label">${(g = e.g)}</div>` : ""
              const right = i === sel && e.hint ? `<span class="m">${e.hint}</span>` : e.k ? kbd(e.k) : "<span></span>"
              return `${head}<button class="row" role="option" data-i="${i}" aria-selected="${i === sel}">${e.lead}<span><span class="t">${e.t}</span>${e.m ? `<span class="m">${e.m}</span>` : ""}</span>${right}</button>`
            })
            .join("")
        : '<div class="empty">該当する項目が無い</div>'
      list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" })
    }
    function run(i) {
      const e = shown[i]
      if (!e) return
      dlg.close()
      e.run()
    }
    function open(sc = "all") {
      const wasOpen = dlg?.open
      closeAll()
      if (wasOpen && sc === scope) return
      if (!dlg) {
        dlg = document.createElement("dialog")
        dlg.className = "dlg palette"
        dlg.setAttribute("closedby", "any")
        dlg.setAttribute("aria-label", "検索")
        dlg.innerHTML = `<div class="q">${icon("search", 18)}<input type="text" placeholder="操作・タスク・セッション・キャラクターを検索" aria-label="検索語"><div class="scopes"></div></div><div class="list" role="listbox"></div><div class="dlg-hints"><span>${kbd("↑ ↓")} 移動</span><span>${kbd("⏎")} 実行</span><span>${kbd("esc")} 閉じる</span><span class="grow"></span><span># タスク　@ キャラクター　&gt; 操作</span></div>`
        document.body.append(dlg)
        input = dlg.querySelector("input")
        list = dlg.querySelector(".list")
        input.addEventListener("input", () => {
          sel = 0
          draw()
        })
        dlg.addEventListener("keydown", (e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % Math.max(1, shown.length)
            draw()
          } else if (e.key === "Enter" && !e.metaKey && !e.isComposing) {
            e.preventDefault()
            run(sel)
          }
        })
        dlg.addEventListener("click", (e) => {
          const s = e.target.closest("[data-scope]")
          if (s) {
            scope = s.dataset.scope
            input.value = ""
            sel = 0
            draw()
            input.focus()
            return
          }
          const r = e.target.closest("[data-i]")
          if (r) run(Number(r.dataset.i))
        })
      }
      scope = sc
      sel = 0
      input.value = ""
      draw()
      dlg.showModal()
      input.focus()
    }
    return { open }
  })()

  /* ── 操作（裏側の制約は知らせで再現する: ターン中は切替・新規・依頼を受け付けない） ── */
  const busy = (what) => {
    if (state.moment !== "work") return false
    toast(`ターン中は${what}できない（中断は ⌘.）`)
    return true
  }
  const act = {
    switchPack(id) {
      const p = PACKS.find((x) => x.id === id)
      if (!p || id === state.pack || busy("キャラクターを切替")) return
      set({ pack: id })
      toast(`${p.name}に交代した`)
    },
    newSession() {
      if (busy("新規セッションを開始")) return
      set({ moment: "greet" })
      toast("新規セッションを開始した")
    },
    startTask(id) {
      if (busy("タスクを依頼")) return
      set({ moment: "work" })
      toast(`${id} を依頼した`)
    },
    openSession(id) {
      if (busy("セッションを切替")) return
      const s = sessions().find((x) => x.id === id)
      set({ moment: "deliver" })
      toast(`「${s ? s.title : id}」を開いた`)
    },
    stop() {
      if (state.moment !== "work") return
      set({ moment: "deliver" })
      toast("試作では、中断の代わりに完了の場面へ移る")
    },
    send() {
      if (state.moment === "work") return
      set({ moment: "work" })
      toast("依頼を送信した")
    },
  }
  hooks.sessions = () => palette.open("session")
  hooks.tasks = () => palette.open("task")
  hooks.chars = () => palette.open("char")
  hooks.progress = () => toast("進行の詳細（この案では常時表示）")
  hooks.settings = () => toast("設定を開く（試作では表示のみ）")

  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-act],[data-pack],[data-task],[data-session],[data-open]")
    if (!b || b.disabled) return
    const d = b.dataset
    if (d.pack) {
      closeAll()
      act.switchPack(d.pack)
    } else if (d.task) {
      closeAll()
      act.startTask(d.task)
    } else if (d.session) {
      closeAll()
      act.openSession(d.session)
    } else if (d.act) {
      closeAll()
      act[d.act]?.()
    } else if (d.open === "palette") palette.open()
    else if (d.open === "keys") keysheet.open()
    else hooks[d.open]?.()
  })

  /* キー: ⌘（Mac 以外は Ctrl）と ⌃ の組合せは入力中も受け、1字のキーは入力中は受けない */
  function keys(extra = {}) {
    const map = {
      "mod+k": () => palette.open(),
      "mod+/": () => keysheet.open(),
      "mod+shift+o": () => (closeAll(), act.newSession()),
      "mod+j": () => hooks.tasks(),
      "mod+o": () => hooks.sessions(),
      "mod+i": () => hooks.progress(),
      "mod+,": () => (closeAll(), hooks.settings()),
      "mod+.": () => act.stop(),
      "mod+enter": () => (closeAll(), act.send()),
      ...Object.fromEntries(PACKS.map((p, i) => [`ctrl+${i + 1}`, () => (closeAll(), act.switchPack(p.id))])),
      ...extra,
    }
    const NAMES = { Slash: "/", Comma: ",", Period: ".", Enter: "enter", Escape: "esc", ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" }
    document.addEventListener("keydown", (e) => {
      if (e.isComposing) return
      const mod = isMac ? e.metaKey : e.ctrlKey && !e.altKey
      const parts = []
      if (mod) parts.push("mod")
      if (isMac ? e.ctrlKey : e.altKey && e.ctrlKey) parts.push("ctrl")
      if (e.altKey && isMac) parts.push("alt")
      if (e.shiftKey) parts.push("shift")
      const key = e.code.startsWith("Key") ? e.code.slice(3).toLowerCase() : e.code.startsWith("Digit") ? e.code.slice(5) : NAMES[e.code] || e.key.toLowerCase()
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "") || document.activeElement?.isContentEditable
      const f = parts.length ? map[[...parts, key].join("+")] : !typing && !document.querySelector("dialog[open]") && map["plain:" + key]
      if (f) {
        e.preventDefault()
        f(e)
      }
    })
  }

  /* ── 試作の切替バー ───────────────────────────────── */
  let protoEl
  function syncProto() {
    protoEl?.querySelectorAll("[data-moment-set]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.momentSet === state.moment)))
    protoEl?.querySelectorAll("[data-pack-set]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.packSet === state.pack)))
  }
  function protoBar(variant) {
    applyPack()
    if (params.get("bar") === "0") return
    document.body.classList.add("has-proto")
    protoEl = document.createElement("nav")
    protoEl.className = "proto"
    protoEl.setAttribute("aria-label", "試作の切替")
    const V = [
      ["a", "A 常設パネル"],
      ["b", "B コマンド中心"],
      ["c", "C タブとボード"],
      ["final", "採用案（A 改）"],
    ]
    protoEl.innerHTML = `<b>試作</b>${V.map(([v, l]) => `<button data-variant="${v}" aria-current="${v === variant}">${l}</button>`).join("")}<span>場面</span>${MOMENTS.map(([m, l]) => `<button data-moment-set="${m}">${l}</button>`).join("")}<span>キャラクター</span>${PACKS.map((p) => `<button data-pack-set="${p.id}">${p.name}</button>`).join("")}<span class="grow"></span><a href="index.html">比較へ戻る</a>`
    protoEl.addEventListener("click", (e) => {
      const d = e.target.closest("button")?.dataset
      if (!d) return
      if (d.variant) location.href = `${d.variant}.html?moment=${state.moment}&pack=${state.pack}`
      else if (d.momentSet) set({ moment: d.momentSet })
      else if (d.packSet) set({ pack: d.packSet })
    })
    document.body.prepend(protoEl)
    syncProto()
  }
  /* ?open=palette|keys|sessions|tasks|chars|progress で、読み込み直後に重なりを開く（撮影用） */
  function autoOpen() {
    const o = params.get("open")
    if (!o) return
    setTimeout(() => {
      if (o === "palette") palette.open()
      else if (o === "keys") keysheet.open()
      else hooks[o]?.()
    }, 120)
  }

  initRunPop()
  window.K = { state, set, onChange: (f) => listeners.push(f), hooks, isMac, PACKS, pack, portrait, face, icon, kbd, st, sessions, tasks, plan, segbar, reportHtml, workHtml, logHtml, bubbleHtml, lampHtml, runChips, composerHtml, toast, closeAll, pop, palette, keysheet, act, keys, protoBar, autoOpen }
})()
