# 全体図

ステータス: **図解**（正典は各図の直後の表に名指す文書）。入口は `docs/guide.md`。

責務: プロセス・層・画面の領域の全体図を持つ。
読む時: リポジトリの全体の構成を図で掴みたいとき。
直す時: プロセスの構成・層の構成・画面の領域が変わったとき。

## 1. プロセスの構成

tsukumo は Node の1プロセスで、Claude Code を SDK の子プロセスとして起こす。ブラウザとは WebSocket 1本でつなぐ。

```mermaid
flowchart TB
  subgraph host["ホストのタブ（ブラウザ）"]
    main["紙"]
    char["舞台"]
    side["部屋の頭"]
    input["入力欄"]
  end
  subgraph node["tsukumo（Node の1プロセス）"]
    view["ビューサーバ"]
    driver["セッションドライバ"]
    tools["speak と report のツール"]
  end
  subgraph cc["Claude Code（SDK が起こす子プロセス）"]
    claude["claude"]
  end
  view -->|WebSocket で押す| host
  input -->|コマンド oRPC| view
  view --> driver
  driver -->|起動・追加入力・中断| claude
  claude -->|SDK のイベント| driver
  claude -->|ツール呼び出し| tools
  tools --> driver
```

箱と実物

| 箱                       | 実物                                                              | 正典の文書                                                |
| ------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------- |
| 紙                       | `src/browser/components/page/conversation/components/paper-desk/` | `docs/architecture/screen-design/layout.md`               |
| 舞台                     | `src/browser/components/page/conversation/components/stage/`      | `docs/architecture/screen-design/layout.md`               |
| 部屋の頭                 | `src/browser/components/frame/screen-nav/`                        | `docs/architecture/screen-design/room-head-and-search.md` |
| 入力欄                   | `src/browser/components/page/conversation/components/dispatch/`   | `docs/architecture/screen-design/layout.md`               |
| ビューサーバ             | `src/server/view-server/`                                         | `docs/architecture/runtime-flow.md`                       |
| セッションドライバ       | `src/server/session-driver/`                                      | `docs/architecture/runtime-flow.md`                       |
| speak と report のツール | `src/server/session-driver/adapter/sdk/`                          | `docs/architecture/overview-and-layer.md`                 |

## 2. 層の構成

矢印は import してよい向き。許可の一覧は正典が持つので、ここには書き写さない。

```mermaid
flowchart BT
  subgraph shared["shared"]
    contract["語彙・イベント・状態・契約"]
  end
  subgraph server["server/機能"]
    core["core 純粋な判断"]
    adapter["adapter 外の世界に触る"]
  end
  browserLayer["browser"]
  wiring["wiring と src 直下の配線"]
  core --> contract
  adapter --> core
  browserLayer --> contract
  wiring --> adapter
  wiring --> core
```

箱と実物

| 箱            | 実物                                                  | 正典の文書                                                           |
| ------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| shared        | `src/shared/`                                         | `docs/architecture/overview-and-layer.md`                            |
| core          | `src/server/view-server/core/`（機能ごとに同じ形）    | `docs/architecture/overview-and-layer.md`、`.dependency-cruiser.cjs` |
| adapter       | `src/server/view-server/adapter/`（機能ごとに同じ形） | `docs/architecture/overview-and-layer.md`、`.dependency-cruiser.cjs` |
| browser       | `src/browser/`                                        | `docs/architecture/overview-and-layer.md`                            |
| wiring と配線 | `src/wiring/`                                         | `docs/architecture/overview-and-layer.md`                            |

## 3. ブラウザの画面の領域

舞台（`Stage`）が左に立ち絵と部屋の頭を、右の場所（`PaperDesk`）が紙・入力欄・欄外を並べる。ほかの画面は右から重ねる紙で開く。

```mermaid
flowchart LR
  subgraph stage["舞台"]
    h["部屋の頭"]
    c["立ち絵と吹き出し"]
  end
  subgraph desk["紙の場所"]
    m["紙"]
    d["入力欄（紙の下端に浮く）"]
  end
  g["欄外"]
  sheet["重ねる紙（タスク・成果・使用量・キャラ・設定）"]
```

箱と実物

| 箱               | 実物                                                                  | 正典の文書                                                |
| ---------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| 舞台             | `src/browser/components/page/conversation/components/stage/`          | `docs/architecture/screen-design/layout.md`               |
| 立ち絵と吹き出し | `src/browser/components/page/conversation/components/character-view/` | `docs/architecture/screen-design/scene-behavior.md`       |
| 部屋の頭         | `src/browser/components/frame/screen-nav/`                            | `docs/architecture/screen-design/room-head-and-search.md` |
| 紙・欄外         | `src/browser/components/page/conversation/components/paper-desk/`     | `docs/architecture/screen-design/layout.md`               |
| 紙の中身         | `src/browser/components/page/conversation/components/main-view/`      | `docs/architecture/screen-design/report-head.md`          |
| 入力欄           | `src/browser/components/page/conversation/components/dispatch/`       | `docs/architecture/screen-design/layout.md`               |
| 重ねる紙         | `src/browser/components/ui/sheet/`                                    | `docs/architecture/screen-design/layout.md`               |

## 4. サーバの機能の依存

許された向きの図で、実際の import を数えたものではない。元は `.dependency-cruiser.cjs` の `server-feature-edge:` の規則で、`pnpm run format` が書き直す。

<!-- feature-edge-graph:start -->

```mermaid
flowchart LR
  session["session"]
  system_prompt["system-prompt"]
  view_server["view-server"]
  chat["chat"]
  usage["usage"]
  session_driver["session-driver"]
  diary["diary"]
  achievement["achievement"]
  subgraph leaves["末端（import しない機能）"]
    diagnostic["diagnostic"]
    character_pack["character-pack"]
    host["host"]
    repository["repository"]
    recommendation["recommendation"]
    checkout["checkout"]
    welcome_greeting["welcome-greeting"]
    workflow_setting["workflow-setting"]
    report["report"]
    item["item"]
    work_plan["work-plan"]
    question["question"]
  end
  session --> session_driver
  session --> chat
  session --> diary
  session --> usage
  session --> diagnostic
  session --> character_pack
  session --> report
  session --> repository
  system_prompt --> session_driver
  system_prompt --> chat
  system_prompt --> report
  system_prompt --> work_plan
  system_prompt --> question
  view_server --> session
  chat --> character_pack
  usage --> session_driver
  session_driver --> report
  session_driver --> work_plan
  session_driver --> question
  diary --> repository
  achievement --> repository
```

<!-- feature-edge-graph:end -->
