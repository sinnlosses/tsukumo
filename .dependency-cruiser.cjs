// 層・機能・箱の import の辺の規則。読み手は `pnpm run lint`（depcruise）と、
// `scripts/document/feature-edge-table.ts`（`server-feature-edge:` で始まる規則から文書の表を書く）。

const SERVER_FEATURE_IMPORTS = {
  session: [
    "session-driver",
    "chat",
    "diary",
    "token-usage",
    "context-usage",
    "experience-metric",
    "diagnostic",
    "character-pack",
    "report",
  ],
  "system-prompt": ["session-driver", "chat", "report", "work-plan", "question"],
  "view-server": ["session"],
  chat: ["character-pack"],
  "context-usage": ["session-driver"],
  "session-driver": ["report", "view-server", "chat", "work-plan", "question"],
  diary: ["repository"],
  "usage-review": ["session-driver"],
  achievement: ["repository"],
  "plan-usage": [],
  "experience-metric": [],
  diagnostic: [],
  "character-pack": [],
  host: [],
  repository: [],
  recommendation: [],
  checkout: [],
  "welcome-greeting": [],
  "workflow-setting": [],
  report: [],
  item: [],
  "token-usage": [],
  "work-plan": [],
  question: [],
}

const BROWSER_FRAMES = ["components/domain/screen-nav", "components/domain/sidebar"]
const BROWSER_SCREENS = [
  "components/page/conversation",
  "components/page/character",
  "components/page/token-usage",
  "components/page/achievement",
]
const BROWSER_PLACED_FEATURES = [
  "features/task-board",
  "features/current-work",
  "features/run-setting",
]

const BROWSER_BOX_PATHS = {
  main: "^src/browser/(?:main|app)\\.tsx$",
  features: "^src/browser/features/",
  "components/app": "^src/browser/components/app/",
  "components/page": "^src/browser/components/page/",
  "components/domain": "^src/browser/components/domain/",
  "components/ui": "^src/browser/components/ui/",
  hooks: "^src/browser/hooks/",
  domain: "^src/browser/domain/",
  lib: "^src/browser/lib/",
  utils: "^src/browser/utils/",
  stores: "^src/browser/stores/",
}

const ALLOWED_BROWSER_BOX_IMPORTS = {
  "components/app": [
    "components/app",
    "components/page",
    "components/domain",
    "components/ui",
    "features",
    "hooks",
    "domain",
    "lib",
    "utils",
    "stores",
  ],
  "components/page": [
    "components/page",
    "components/domain",
    "components/ui",
    "features",
    "hooks",
    "domain",
    "lib",
    "utils",
    "stores",
  ],
  "components/domain": [
    "components/domain",
    "components/ui",
    "features",
    "hooks",
    "domain",
    "lib",
    "utils",
    "stores",
  ],
  features: ["features", "components/ui", "hooks", "domain", "lib", "utils", "stores"],
  "components/ui": ["components/ui", "hooks", "lib", "utils"],
  hooks: ["hooks", "lib", "utils"],
  domain: ["domain", "lib", "utils"],
  lib: ["lib", "utils"],
  utils: ["utils"],
  stores: ["stores", "domain", "lib", "utils"],
}

const SHARED_PATH = "^src/shared/"
const CORE_PATH = "^src/server/(?:core/|[^/]+/core/)"
const ADAPTER_PATH = "^src/server/(?:adapter/|[^/]+/adapter/)"
const BROWSER_PATH = "^src/browser/"
const FEATURE_DIRECTORY_PATH = "^src/server/(?!core/|adapter/)[^/]+/"

const CHILD_PROCESS_FILES = [
  "src/server/checkout/adapter/checkout-launch.ts",
  "src/server/host/adapter/orca-host.ts",
  "src/server/host/adapter/browser-host.ts",
  "src/server/view-server/adapter/vite-build.ts",
  "src/server/repository/adapter/git.ts",
  "src/server/repository/adapter/beads.ts",
  "src/server/session-driver/adapter/rtk-rewrite.ts",
  "src/server/session-driver/adapter/sdk-workflow-tw.ts",
  "src/server/workflow-setting/adapter/tw-config.ts",
  "src/server/token-usage/adapter/tw-claim-list.ts",
]

const alternation = (paths) => `(?:${paths.join("|")})`
const underAny = (paths) => `^src/browser/${alternation(paths)}(?:/|$)`
const escapePath = (path) => `^${path.replaceAll(".", "\\.")}$`
const packagePath = (packages) => `(?:^|node_modules/)${alternation(packages)}(?:/|$)`

const rule = (name, from, to) => ({ name, severity: "error", from, to })

const layerRules = [
  rule("layer-shared", { path: SHARED_PATH }, { path: "^src/", pathNot: SHARED_PATH }),
  rule(
    "layer-core",
    { path: CORE_PATH },
    { path: "^src/", pathNot: [SHARED_PATH, CORE_PATH].join("|") },
  ),
  rule(
    "layer-adapter",
    { path: ADAPTER_PATH },
    { path: "^src/", pathNot: [SHARED_PATH, CORE_PATH, ADAPTER_PATH].join("|") },
  ),
  rule("layer-ambient", { path: "^src/types/.*\\.d\\.ts$" }, { path: "^src/" }),
  rule(
    "layer-browser",
    { path: BROWSER_PATH },
    { path: "^src/", pathNot: [SHARED_PATH, BROWSER_PATH].join("|") },
  ),
  rule(
    "outside-world-shared-core",
    { path: [SHARED_PATH, CORE_PATH].join("|") },
    { dependencyTypes: ["core"] },
  ),
  rule(
    "outside-world-shared-core-packages",
    { path: [SHARED_PATH, CORE_PATH].join("|") },
    { path: packagePath(["ws", "@anthropic-ai/[^/]+"]) },
  ),
  rule(
    "orpc-server-reader",
    { path: "^src/", pathNot: "^src/server/[^/]+/adapter/|^src/[^/]+\\.ts$" },
    { path: packagePath(["@orpc/server"]) },
  ),
]

const sharedRules = [
  rule(
    "shared-feature-no-contract",
    { path: "^src/shared/(?!contract/|lib/|utils/)[^/]+/" },
    { path: "^src/shared/(?:contract/|rpc\\.ts$)" },
  ),
  rule(
    "shared-packages",
    { path: SHARED_PATH },
    { path: "^(?!src/)", pathNot: packagePath(["zod", "@orpc/contract", "remeda"]) },
  ),
  rule(
    "shared-utils-closed",
    { path: "^src/shared/utils/" },
    { pathNot: `^src/shared/utils/|${packagePath(["remeda"])}` },
  ),
]

const serverFeatureRules = [
  ...Object.entries(SERVER_FEATURE_IMPORTS).map(([feature, allowed]) =>
    rule(
      `server-feature-edge:${feature}`,
      { path: `^src/server/${feature}/` },
      {
        path: FEATURE_DIRECTORY_PATH,
        pathNot: `^src/server/${alternation([feature, ...allowed])}/`,
      },
    ),
  ),
  rule(
    "server-shared-box-no-feature",
    { path: "^src/server/(?:core|adapter)/" },
    { path: FEATURE_DIRECTORY_PATH },
  ),
]

const allBrowserFeatures = [...BROWSER_FRAMES, ...BROWSER_SCREENS, ...BROWSER_PLACED_FEATURES]
const otherThan = (own, group) => group.filter((path) => path !== own)

const browserFeatureRules = [
  ...BROWSER_FRAMES.map((frame) =>
    rule(
      `browser-feature-frame:${frame}`,
      { path: underAny([frame]) },
      { path: underAny([...otherThan(frame, BROWSER_FRAMES), ...BROWSER_SCREENS]) },
    ),
  ),
  ...BROWSER_SCREENS.map((screen) =>
    rule(
      `browser-feature-screen:${screen}`,
      { path: underAny([screen]) },
      { path: underAny(otherThan(screen, BROWSER_SCREENS)) },
    ),
  ),
  ...BROWSER_PLACED_FEATURES.map((placed) =>
    rule(
      `browser-feature-placed:${placed}`,
      { path: underAny([placed]) },
      { path: underAny(otherThan(placed, allBrowserFeatures)) },
    ),
  ),
  rule(
    "browser-feature-unknown",
    { path: "^src/" },
    {
      path: "^src/browser/(?:features/[^/]+|components/domain/[^/]+/|components/page/[^/]+)",
      pathNot: underAny(allBrowserFeatures),
    },
  ),
]

const browserBoxRules = [
  ...Object.entries(ALLOWED_BROWSER_BOX_IMPORTS).map(([box, allowed]) =>
    rule(
      `browser-box-edge:${box}`,
      { path: BROWSER_BOX_PATHS[box] },
      {
        path: Object.entries(BROWSER_BOX_PATHS)
          .filter(([name]) => !allowed.includes(name))
          .map(([, path]) => path)
          .join("|"),
      },
    ),
  ),
  rule(
    "browser-box-unknown",
    { path: "^src/" },
    {
      path: BROWSER_PATH,
      pathNot: [
        ...Object.values(BROWSER_BOX_PATHS),
        "^src/browser/styles/",
        "^src/browser/types/.*\\.d\\.ts$",
      ].join("|"),
    },
  ),
  rule(
    "browser-utils-closed",
    { path: BROWSER_BOX_PATHS.utils },
    { pathNot: `${BROWSER_BOX_PATHS.utils}|${packagePath(["react", "remeda", "zod"])}` },
  ),
]

const outsideWorldRules = [
  rule(
    "child-process-readers",
    { path: "^src/", pathNot: CHILD_PROCESS_FILES.map(escapePath).join("|") },
    { dependencyTypes: ["core"], path: "^(?:node:)?child_process$" },
  ),
]

module.exports = {
  forbidden: [
    ...layerRules,
    ...sharedRules,
    ...serverFeatureRules,
    ...browserFeatureRules,
    ...browserBoxRules,
    ...outsideWorldRules,
  ],
  options: {
    parser: "swc",
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
  },
}
