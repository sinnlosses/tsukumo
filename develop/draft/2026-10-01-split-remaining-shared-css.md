# 残る7枚の CSS を「class ごとに、読み手すべてを含むいちばん近い箱」に割る（振り返り: GH-172）

- 札: 黄 正典の不備（1回目）
- 根拠: GH-172 で `docs/architecture/browser.md`「CSS」の置き場の原則を「領域・機能ごとに1枚」から「class ごとに、読み手すべてを含むいちばん近い箱」に改め、5枚（achievement・token-usage・task-board・sidebar・character）を割った。同じ形で部品ごとの class を1枚に持つ CSS が `screen-nav.module.css`・`character-view`・`chat-view`・`conversation-layout`・`dispatch`・`main-view`・`report-notation` の7枚に残り、改めた正典と食い違っている（子部品が親の1枚を読む分には規約に合うものも含むので、数え直しが要る）
- 出し先: タスク1件（7枚それぞれで class ごとの読み手を数え直し、1部品だけが読む class を部品の隣へ移す。見た目は変更前後の `getComputedStyle` と矩形の比べ合いで確かめる。GH-172 と同じ手順）
