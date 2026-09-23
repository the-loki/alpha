# Linear 与 Raycast 的色彩、圆角、投影、动效事实（Issue #143）

研究方法：抓取两家官网的线上 CSS 原文（与官方设计系统同源的 token 文件）、Raycast 官方开发者文档与 npm 类型、两家官方博客；逐条给出来源与置信度。
置信度标记：**高** = 官方线上 CSS/文档原文直出；**中** = 官方站点上「描绘 App」的组件或对官方文档配图的像素采样（无法在 Linux 上直接打开桌面 App 本体核对）；**低/缺口** = 无公开来源。

> **这是证据，不是规范。** 本文是 issue #143 的研究产物，Caliper 语言由它决定，而现行规范在
> [ADR-0027](../adr/0027-caliper-design-language.md) 与 [constraints/05-design.md](../constraints/05-design.md)。
> 被采纳：单色强调 indigo（暗 `#7170FF` / 亮 `#5E6AD2`）、暗色四级背景
> `#08090A / #0F1011 / #141516 / #191A1B`、Linear 的三条语义色（`#27A644` / `#F0BF00` / `#5EB0FF`）
> 与 Raycast 的红 `#FF6161`、五档投影名（none/tiny/low/medium/high）、三档时长 100/160/250ms 与同一条
> ease-out-quad、四档圆角 4/6/8/12px。
> 被否决：大圆角与胶囊（Caliper 里没有 `rounded-full`）、玻璃与亚克力、Raycast 的品牌红与 26px
> 窗口圆角、Linear 的四档按钮高度（窗口里只有 2rem 与 1.5rem 两个高度）。

---

## 一、Linear

主源（线上 CSS，linear.app 页面加载，`layout.B05Dfi6O.css` 即其设计系统 token 文件）：
- https://static.linear.app/web/_next/static/css/layout.B05Dfi6O.css
- https://static.linear.app/web/_next/static/css/Button.dcAi4KbO.css
- https://static.linear.app/web/_next/static/css/Tooltip.mgHd0F-S.css
- https://static.linear.app/web/_next/static/css/CommandMenu.BLNdDiNz.css
- https://static.linear.app/web/_next/static/css/SidePanel.B6ktxgTN.css
- https://static.linear.app/web/_next/static/css/Select.Bb-JNkHr.css
- 页面入口：https://linear.app/

### 1. 背景层级（暗/亮两套，均按 `[data-theme]` 归属）（高）

| 层级 | 暗色 | 亮色 |
| --- | --- | --- |
| level-0 / 页面底（= bg-primary） | `#08090a` | `#ffffff` |
| level-1（= bg-panel，侧栏/面板底） | `#0f1011` | `#f8f8f8`（bg-panel 仅在暗色块定义，亮色由 level-1 承担） |
| level-2 | `#141516` | `#f4f4f4` |
| level-3（悬浮 hover 底） | `#191a1b` | `#f0f0f0` |
| bg-secondary | `#1c1c1f` | `#f9f8f9` |
| bg-tertiary | `#232326` | `#f4f2f4` |
| bg-quaternary | `#28282c` | `#eeedef` |
| bg-quinary | `#282828` | `#e9e8ea` |
| bg-translucent | `#ffffff0d`（白5%） | `#00000005`（黑2%） |

- 值关系：同色相近中性灰，每级亮度差约 1.5–3%（暗色 `08090a→0f1011→141516→191a1b`；亮色 `fff→f8f8f8→f4f4f4→f0f0f0`），无色相漂移。另存在第三套 `glass` 主题（`bg-primary:#000212` + 白色 alpha 层）。（高）
- 浮层底：命令菜单 = `bg-level-1` + radius 12；下拉/Select = `bg-level-2`；Tooltip = `bg-primary` + 1px `border-primary`；SidePanel 抽屉 = `bg-panel`，遮罩 = `bg-primary` 55% 透明。（高，CommandMenu/Select/Tooltip/SidePanel CSS）

### 2. 边框层级（高）

- 暗：primary `#23252a` / secondary `#34343a` / tertiary `#3e3e44`；半透明 `#ffffff0d`(5%) 与 `#ffffff14`(8%)。
- 亮：primary `#e9e8ea` / secondary `#e4e2e4` / tertiary `#dcdbdd`；半透明 `#0000000d` / `#00000014`。
- 分隔线 `line-*`：暗 `#37393a / #202122 / #18191a / #141515`；亮 `#d4d4d6 / #eaeaeb / #f0f0f0 / #f4f4f4`。

### 3. 文本层级（高，`text-*` 与 `fg-*` 双名同值）

- 暗：primary `#f7f8f8` / secondary `#d0d6e0` / tertiary `#8a8f98` / quaternary `#62666d`。
- 亮：primary `#282a30` / secondary `#3c4149` / tertiary `#6f6e77` / quaternary `#86848d`。
- glass：`#f7f8f8 / #b4bcd0 / #b4bcd099 / #b4bcd066`。

### 4. 强调色与语义色（高）

- `--color-accent: #7170ff`（暗亮同值，H240 S100% L72%）；`accent-hover` 暗 `#828fff` / 亮 `#8989f0`；`accent-tint` 暗 `#18182f` / 亮 `#f1f1ff`。用于焦点环（marketing 链接 `outline:2px solid var(--color-accent)`）与 tint 底。
- 主按钮/品牌面 `--color-brand-bg`：暗 `#5e6ad2`（H234 S56% L60%，经典 Linear 靛蓝）/ 亮 `#7070ff`（H240 S100% L72%）；`brand-text:#fff`。
- 链接 `link-primary`：暗 `#828fff` / 亮 `#7070ff`；常量 `--color-indigo:#5e6ad2`（同时是暗色默认焦点环色）。
- 选区：`selection-bg = color-mix(in lch, brand-bg, …)`（暗混黑10%、亮透明64%），`selection-dim` 透明80%。
- **强调色饱和度区间：S56%–100%，色相 H234–240，明度 L60–75%**（靛蓝-紫罗兰窄带）。
- 语义色（`:root`，主题无关）：绿 `#27a644`(H134 S62 L40)、黄 `#f0bf00`(H48 S100 L47)、红 `#eb5757`(H0 S79 L63)、橙 `#fc7840`、蓝 `≈#5eb0ff`（display-p3 定义 + sRGB fallback；旧值 `#4ea7fc`）、青 `#00b8cc`。

### 5. 圆角音阶（高）

- Token：`--radius-4:4px / -6:6px / -8:8px / -12:12px / -16:16px / -24:24px / -32:32px / --radius-rounded:9999px / --radius-circle:50%`；另有 `--app-radius:12px`、`--card-radius:12px`。
- 实际用量（54 个线上 CSS 统计）：8px(29) 与 6px(24) 最高频，4px(18)、9999 胶囊(21)、12px 卡片/面板/命令菜单、9px、10px、16–22px 大容器。
- 对应关系：小控件/方按钮 4px；输入/下拉行 6px（`WinFxq_item radius6 line-height32`）；Tooltip `--radius-8`；卡片/命令菜单/侧栏顶 `12px`（`--card-radius/--app-radius`）；营销按钮默认胶囊 `--radius-rounded`。

### 6. 投影/海拔音阶（高，按主题分叉）

- 级别：`none → tiny → low → medium → high`（外加 `stack-low` 叠层）。
- 暗：tiny=none；low `0 2px 4px #0000001a`(10%)；medium `0 4px 24px #0003`(20%)；high `0 7px 32px #00000059`(35%)。
- 亮：tiny `0 1px 1px #00000017`；low `0 1px 4px -1px #00000017`；medium `0 3px 12px #00000017`；high `0 7px 24px #0000000f`(6%)。
- 命令菜单浮层：5 层叠影 `0 4px 40px #0000001a, 0 3px 20px/12px/8px #00000020, 0 1px 1px #00000020`（暗）。
- Tooltip 用 `shadow-high` + 半透明边框；海拔不靠单层大 alpha，靠「小 blur 低 alpha + 大 blur 中 alpha」组合。

### 7. 动效（高）

- 速度 token：`--speed-quickTransition:.1s`、`--speed-regularTransition:.25s`。
- 组件默认过渡：**`.16s var(--ease-out-quad)`**（Button 过渡 border/bg/color/shadow/opacity/filter/transform 全套）；Tooltip 进出场 `.12s ease-out-quad`（scale .9↔1）；高度/宽度 `.22s`；按压反馈可至 `80ms`。
- 缓动：完整命名音阶 in/out/in-out × quad/cubic/quart/quint/expo/circ；主力 `--ease-out-quad = cubic-bezier(.25,.46,.45,.94)`；招牌滑入 `cubic-bezier(.32,.72,0,1)`（SidePanel/转场 .5–.7s）；回弹 `cubic-bezier(.45,1.45,.8,1)`。
- Hover：主按钮 `filter:brightness(115%)`；secondary hover 底升到 `bg-level-3`；ghost hover 底 → quaternary；均 `.16s`。
- Press：`transform:scale(.97)` + 主按钮 `brightness(98%)`（active 统一写法 `:active, .active`）。
- 焦点环：全局 `:focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring-color); outline-offset:var(--focus-ring-offset) }`；默认(root/暗) `color=var(--color-indigo) #5e6ad2, width 2px, offset 2px`；亮色主题覆写 `--focus-ring-color:#0006`（黑约40%）。另有品牌双环 `box-shadow:0 0 0 2px var(--color-bg-primary), 0 0 0 4px var(--color-brand-bg)`，列表行用内缩 `2px solid text-secondary, offset -2px`；`outline:2px solid var(--color-accent), offset 2px` 用于链接类；`:focus:not(:focus-visible){outline:none}` 屏蔽鼠标焦点；大量组件带 `prefers-reduced-motion` 分支。

### 8. 控件高度（高）

- 按钮 `--button-height`：mini **24px**（font12/pad10）/ small **32px**（font13/pad12）/ medium **40px**（font13/pad14）/ default **40px**（font15/pad16）/ large **44px**（font16/pad20）。
- 命令菜单输入 `height:46px`；下拉行 `min-height:32px`（line-height32, font13）；badge 22–24px；`--min-tap-size:44px`。

---

## 二、Raycast

主源：
- 线上 CSS（暗色-only，`html{color-scheme:dark}`）：
  - https://www.raycast.com/_next/static/immutable/chunks/3v0rkvocmoxgi.css （核心 token）
  - https://www.raycast.com/_next/static/immutable/chunks/31wzjk_3rf40h.css
  - https://www.raycast.com/_next/static/immutable/chunks/13vksrt_rlzzg.css
  - https://www.raycast.com/_next/static/immutable/chunks/22kltjc50bxtv.css
  - https://www.raycast.com/_next/static/immutable/chunks/0u1ecxxhsoqyx.css （App 窗口描绘组件）
- 官方文档 Colors：https://developers.raycast.com/api-reference/user-interface/colors （Markdown：同址 + `.md`）
- npm 类型 `@raycast/api`：https://www.npmjs.com/package/@raycast/api （`Color` 枚举）
- 官方博客：https://www.raycast.com/blog/a-fresh-look-and-feel 、https://www.raycast.com/blog/the-new-raycast 、https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast

### 1. 背景层级（暗色，来自官方站点 token）（高；对应 App 的置信度中）

- 页面底：`--background/--color-bg: var(--grey-900) = #07080a`。
- 升层：`bg-100 #101111 → bg-200 #18191a → bg-300 #313133 → bg-400 #494b4d`（跳变比 Linear 大，300/400 用于选中/悬浮）。
- 灰阶基座：`grey-50 #e6e6e6 /100 #cdcece /200 #9c9c9d /300 #6a6b6c /400 #434345 /500 #2f3031 /600 #1b1c1e /700 #111214 /800 #0c0d0f /900 #07080a`。
- App 窗口描绘：`--window-background:#111217`(mac) / `#262626`(Windows)，`--window-radius:26px`(mac) / `8px`(Windows)，亚克力 `backdrop-filter:blur(30px)`，窗口影 `0 16px 48px 8px #0003, 0 0 0 .5px #000000bf, 0 4px 8px #0006, 0 12px 32px #000c`。（中：站点对 App 的等比描绘）
- **亮色主题结构色值无公开来源**（官网无亮色版）→ 缺口；语义/文本见下（官方文档配图采样，中）。

### 2. 文本与边框层级

- 暗（站点 token，高）：text `fg #f4f4f6 / fg-200 #c2c7ca / fg-300 #78787c / fg-400 #5e6366`（4 级）；border `#242728`；高频发丝线 `box-shadow: inset 0 1px #ffffff1a`（顶部 10% 白高光，22 处）。
- 结构层级（官方文档）：`Color.PrimaryText / SecondaryText`（枚举即文本两级），亮暗自动适配；扩展可写 `Color.Dynamic{dark,light,adjustContrast}`。
- 亮色文本采样（文档48×48 配图取环芯，中）：PrimaryText ≈ `#000` 级近黑，SecondaryText ≈ `#6e6071`（灰紫，S16 L42 一带）。

### 3. 强调色与语义色

- 官方站点语义 token（暗，高）：绿 `#59d499`(H151 S59 L59)、黄 `#ffc533`(H43 S100 L60)、红 `#ff6161`(H0 S100 L69)、蓝 `#57c1ff`(H202 S100 L67)，各配15%透明同色 `* -transparent: …26`。
- **品牌强调 = Raycast 红 `#ff6363`**（站点 markdown 链接/内联 code/eyebrow 标签/危险操作 `--color:#ff6363`、hover `#ff6363d9`）。（高）
- 主按钮不走蓝：`--color-button-bg:#ffffffd0`(约82%白) → hover `#fff`，`button-fg:#18191a`（深字浅底，对应 App 操作面板按钮）。（高）
- 官方 Color 枚举9员：Blue/Green/Magenta/Orange/Purple/Red/Yellow/PrimaryText/SecondaryText；npm 值是语义键 `raycast-blue…` 非 hex（https://www.npmjs.com/package/@raycast/api ）。「colors automatically adapt to the Raycast theme (light or dark)」（文档原文）。
- 文档配图环芯采样（中低，48px 抗锯齿；色相可信、hex 有偏）：暗 Blue≈`#8cbff9`(h212)、Green≈`#97cbbc`(h163)、Red≈`#dd7986`(h352)、Yellow≈`#f2c789`(h36)、Purple≈`#a88dee`(h257)、Magenta≈`#b24da1`(h310)、Orange≈`#e49b6d`(h23)；亮 Blue≈`#477fcb`(h214)、Green≈`#497a4a`(h122)、Red≈`#8f2f36`(h355)、Yellow≈`#d8a652`(h38)、Purple≈`#623ebc`(h257)。与站点暗色 token 色相家族一致。
- **语义色饱和度区间：S59–100%（均为高饱和亮色）**；App 内默认 accent 是否可配/默认值无公开文档 → 缺口（App 设置里 accent 属用户主题设置）。

### 4. 圆角音阶（高，官方站点 token）

- `--rounding-xs:4px / sm:6px / normal:8px / md:12px / lg:16px / xl:20px / xxl:24px / full:100%`；另 `--radius:8px`、`--radius-md:6px`；App 窗口圆角描绘 26px(mac)/8px(win)。
- 用量：md12(35) 与字面 4px(30)、6px(25)、12px(19)、10px(19)、16px(14)、8px(14) 居前。对应：小控件4 / 输入行6 / 常规按钮卡8 / 卡片菜单12 / 大容器16–20 / 窗口26。

### 5. 投影/海拔（中，无命名音阶——配方散落在组件里）

- 发丝高光：`inset 0 1px #ffffff1a`（顶边10%白，最高频）。
- 焦点环：`0 0 0 2px #ffffff80`（2px 白50%）多处。
- 卡片/面板：`0 4px 40px 8px #0006, 0 0 0 .5px #000c, inset .5px #ffffff4d`（大 blur40px + .5px 描边 + 内高光）。
- 窗口：`0 16px 48px 8px #0003, 0 0 0 .5px #000000bf, 0 4px 8px #0006, 0 12px 32px #000c`。
- 彩色辉光：`0 1px 40px #9aaaff0d …`（紫蓝 glow）。透明度带：黑6–25% + 半透明白高光；海拔主要靠40–48px 大模糊 + 发丝描边。

### 6. 动效（中——来源是官方站点，App 本体不可检）

- 时长分布（站点全量统计）：`.3s`(108处) 为主，`.2s`(58)、`.15s`(18)、`.1s`(10)，入场 `.4–.5s`。
- 缓动：关键字 `ease-in-out/ease` 与 `cubic-bezier(.4,0,.22,.96)`(自定义 ease,10)、`(.16,1,.3,1)`(expo-out,8)、`(.23,1,.32,1)`(ease-out-expo,10)、`(.215,.61,.355,1)`(ease-out-cubic)、`(.34,1.56,.64,1)`(回弹/按压 pop)。
- Hover：底色/亮度阶跃 + color `.15–.3s`；焦点 `2px 白50%` 环；Press：scale 过冲（back-out 曲线）。
- 官方设计口径（博客，高）：三原则「fast, simple, delightful」；2024/25 重构强调「动画不对、hover 态不对就算失败」的原生级手感（https://www.raycast.com/blog/a-fresh-look-and-feel 、 https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast ）。**App 内具体时长/缓动无公开数值 → 缺口（低）**。

### 7. 控件高度（中，站点对 App 的等比描绘）

- 通用控件/输入：**36px（mac）/ 40px（Windows）**；站点设计系统 Input `42px`；Alert 按钮 `35px`。
- App 窗口描绘：搜索栏 **56px**、操作面板搜索行 **40px**、色取器输入 `32px`、Tag `26px`、返回键 `24–28px`。
- 主导行高：16/20/24px；间距音阶 `--spacing-*: 8/12/16/20/24/32/40/48/56/64…px`（8px 基准）。（高）

---

## 三、缺口清单

1. Raycast App（闭源、Linux 不可运行）：亮色主题的页面/面板/浮层与边框结构色值、App 内焦点环画法、App 内动效时长与缓动、默认 accent——均无公开来源，上文以官方文档配图采样 + 官方站点 CSS 近似替代（已标中/低）。
2. Linear：token 取自 linear.app 线上 CSS（该文件同时承载 App 向 token：bg-panel、命令菜单、SidePanel 等）；app.linear.app 在本环境不可直接抓取，token 值置信度高、桌面 App 完全同值置信度中高。
3. Raycast 博客有设计原则与重构故事，但不发布具体色值/时长数值。
