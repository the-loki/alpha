# Linear 与 Raycast 的排版与布局事实清单

调研日期：2026-09-22。方法：抓取两家线上资产的实测 CSS（linear.app 首页/登录页挂载的应用样式表、raycast.com 及其子站的 CSS chunks）、两家官方博客/文档/更新日志正文、以及 GitHub license 元数据。全部事实逐条附来源与置信度（高/中/低）。

> 环境说明：`app.linear.app` 在公开 DNS 不存在（NXDOMAIN，已用 Cloudflare/Google DoH 双查确认）；Linear 应用真实入口是 `https://linear.app/login`，其 HTML 挂载 `app-stylesheet`（应用全局样式表）。Raycast 桌面应用 v2 的前端是本地 WKWebView/WebView2 内运行的 React+TS 工程（见其技术博文），CSS 不公网托管，故应用内像素级数值只能引官方文档/博客/日志的表述，标 Medium/Low。搜索引擎与 WebFetch 在本环境被拦截，全部来源用 curl 直取（berkeleygraphics.com 对 curl 返回 403，经 reader 代理取回正文，引用仍指原 URL）。

> **这是证据，不是规范。** 本文是 Caliper 语言的前期研究，现行规范在
> [ADR-0027](../adr/0027-caliper-design-language.md) 与 [constraints/05-design.md](../constraints/05-design.md)。
> 第 5 节里被采纳的是：OFL 等宽（Raycast 的 Geist Mono）做 apparatus voice；侧栏 256px（窗口里是 rail
> 16rem）；密列表用行、设置与表单才用卡片；CJK 不内嵌、但把回退家族显式命名（`PingFang SC` /
> `Microsoft YaHei` / `Noto Sans CJK SC`）。
> 被否决的是：Inter 做正文（正文 voice 是 Geist Sans，ADR-0027 写明 replaced Inter + JetBrains Mono）；
> 「字重不用整百」（只允许 400/500/600）；顶部窗口级条（没有条，view head 嵌在页面里，C5.4）；
> 20/24/28/36/48 的标题音阶（窗口封顶在 `text-display` 1.75rem）。

---

## 1. 字体：用什么字、怎么分发、中日韩回退

### 1.1 Linear

| 事实 | 来源 | 置信度 |
| --- | --- | --- |
| **UI 正文 = `Inter Variable`**，自托管 WOFF2：`https://static.linear.app/fonts/InterVariable.woff2?v=4.1`（另有 Italic），`@font-face` 声明 `font-weight:100 900`，`unicode-range:U+0-2B1B,U+2B1D-10FFFF`（Inter 实际不含 CJK 字形） | 应用样式表 https://static.linear.app/client/assets/style-ZE1gKoQJ.css（由 https://linear.app/login 挂载）；营销站 https://static.linear.app/web/_next/static/css/layout.B05Dfi6O.css | 高 |
| 应用正文栈：`--font-regular: "Inter Variable", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", "Linear Thai", sans-serif`（营销站版本无 `Linear Thai` 一项） | 同上 | 高 |
| 排版细节：`font-feature-settings:"cv01","ss03"`、`font-variation-settings:"opsz" auto`（光学尺寸轴自适应，即当前版本以 opsz 表达 Display 剪裁效果）；`-webkit-font-smoothing:antialiased`、`text-rendering:optimizelegibility` | layout.css 与应用 style.css 的 `body`/`html` 规则 | 高 |
| **等宽 = `Berkeley Mono`**，自托管可变字体 `https://static.linear.app/fonts/Berkeley-Mono-Variable.woff2?v=3.2`（100–900）；应用栈 `--font-monospace: "Berkeley Mono","SFMono Regular",Consolas,"Liberation Mono",Menlo,Courier,monospace` | 同上 | 高 |
| 2024 大改版时「**标题用 Inter Display，正文其余用常规 Inter**」——官方原文："We started using Inter Display to add more expression to our headings … kept using regular Inter for the rest of the text elements" | https://linear.app/blog/how-we-redesigned-the-linear-ui | 高（历史表述）；当前 CSS 只发 `InterVariable.woff2`（含 opsz 轴），不再单发 Display 剪裁文件（中） |
| 营销站声明展示衬线 `--font-serif-display:"Tiempos Headline"`（Klim 商业字体），仅营销域使用 | layout.css | 中（有声明、未证实大面积使用） |
| **许可**：Inter = SIL OFL-1.1（允许自托管/随应用分发） | https://github.com/rsms/inter/blob/master/LICENSE.txt（GitHub license API: SPDX `OFL-1.1`） | 高 |
| **许可**：Berkeley Mono = U.S. Graphics Company（Berkeley Graphics）的**商业字体**，分 Trial / Developer(Personal) / Commercial 三种许可（PDF），非开源许可；Linear 公开托管其 WOFF2 表明其持有相应授权，文件本身不可再分发 | https://berkeleygraphics.com/legal/licenses | 高 |
| **中日韩回退**：应用与营销 CSS **均无任何 CJK 字体族/CJK @font-face**；Inter 无 CJK 字形 → 逐字回退到系统兜底（macOS PingFang SC / Windows 微软雅黑 / Linux Noto Sans CJK，由浏览器 last-resort 完成）。对照：Linear 对**泰文**做了显式兜底 `@font-face "Linear Thai" { src: local(Thonburi), local(Thonburi-Regular), local(Sukhumvit Set), local(Tahoma), local(Garuda), local(Noto Sans Thai); weight:450; unicode-range:U+E00-E7F }` —— 即「需要覆盖的语种显式 local()，CJK 则完全交系统」 | 应用 style.css | CSS 事实高；CJK 渲染行为中（浏览器标准回退行为推断） |

### 1.2 Raycast

| 事实 | 来源 | 置信度 |
| --- | --- | --- |
| **所有第一方 Web 面（官网/商店/手册）正文与 UI = Inter，自托管子集 WOFF2**；`--font-inter:"Inter","Inter Fallback"`，`@font-face Inter font-weight:100 900` 按 unicode-range 切片（latin/latin-ext/cyrillic/greek/vietnamese，**无 CJK 切片**）；`Inter Fallback{src:local(Arial); ascent-override:90.44%; descent-override:22.52%; size-adjust:107.12%}`（等量高度兜底，非 CJK） | www.raycast.com 的 CSS chunks，如 https://www.raycast.com/_next/static/immutable/chunks/0u1ecxxhsoqyx.css 、13vksrt_rlzzg.css 、31wzjk_3rf40h.css（页面 https://www.raycast.com ） | 高 |
| 官网 body：`font-family:var(--main-font)`（=`var(--font-inter), sans-serif`），`font-feature-settings:"liga" 1,"calt" 1,"kern" 1,"ss03" 1`；另有**窗口级** token `--window-font-family:"Segoe UI Variable","Segoe UI",var(--font-inter),sans-serif`（深/浅两式）——官网「假 Raycast 窗口」组件与应用窗口同源字体 token | 同上（`window-font-family` 在 0u1ecxxhsoqyx.css） | 高（官网）；中高（应用同源推断） |
| 手册站（manual.raycast.com）：`--font-sans:"inter","inter Fallback"`，预载**静态四字重** `Inter_Regular/Medium/SemiBold/Bold.woff`（=400/500/600/700），正文栈尾接 `-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif` | https://manual.raycast.com/_next/static/immutable/chunks/26koaixtwar63.css 与 2zwzk06di3oy-.css | 高 |
| **等宽：Geist Mono 为当前第一方主等宽**（官网/手册都预载 `GeistMono_Variable.woff2` / `GeistMono_Medium.woff`）；`--font-geist-mono:"GeistMono", ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New, monospace`；官网仍保留 `--monospace-font:var(--font-jetbrains-mono),Menlo,…`（JetBrains Mono 可变 100–800）与个别 IBM Plex Mono 代码块；营销点缀字体 Instrument Serif、VT323 | https://www.raycast.com/_next/static/immutable/chunks/31wzjk_3rf40h.css （GeistMono_Variable）；https://www.raycast.com/_next/static/immutable/chunks/0u1ecxxhsoqyx.css 等 | 高（Web 面）；应用内等宽 = Geist Mono 属中（与官网 kbd/键帽 token 一致但无应用侧一手 CSS） |
| **应用形态**：Raycast v2 = 四层架构——Swift/AppKit（macOS 壳）、C#/.NET8 WPF（Windows 壳）、**React+TypeScript Web 前端**跑在 WKWebView/WebView2、Node 后端；明确否决 Electron 与 Tauri，为的就是保留原生窗口/半透明/字体渲染控制 | https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast | 高 |
| **应用字号可调**：Settings → Appearance → **Interface Size**（整体放大缩小，档位直至 largest），每窗口 content zoom 另算；v2 公测时「larger font sizes 还没做」是官方明说的欠账 | https://manual.raycast.com/settings ；https://www.raycast.com/blog/the-new-raycast ；https://www.raycast.com/changelog | 高 |
| **许可**：Inter = OFL-1.1（https://github.com/rsms/inter/blob/master/LICENSE.txt ）、JetBrains Mono = OFL-1.1（https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt ）、Geist = OFL-1.1（https://github.com/vercel/geist-font/blob/main/LICENSE.txt ）——均可自托管/随应用分发 | GitHub license API（SPDX 均 `OFL-1.1`） | 高 |
| **中日韩回退**：任何 @font-face 的 unicode-range 都不含 CJK 区段（U+4E00–9FFF 等），兜底链 `Inter → Inter Fallback(Arial) → sans-serif` 后由系统逐字回退（PingFang/雅黑/Noto CJK）；第一方无 CJK 专用字体声明 | raycast.com/manual CSS @font-face 实测 | CSS 高；行为中（标准回退推断） |

---

## 2. 类型音阶（字号、字重、行高、标题层级）

### 2.1 Linear

**营销/博客 token 集**（https://static.linear.app/web/_next/static/css/layout.B05Dfi6O.css ，置信度高）：

- 正文 `--text-*`（size / line-height / letter-spacing）：
  - micro `.75rem`(12) / 1.4 / 0
  - tiny `.625rem`(10) / 1.5 / 0
  - mini `.8125rem`(13) / 1.5 / −.01em
  - small `.875rem`(14) / 21/14≈1.5 / −.013em
  - regular `.9375rem`(15) / 1.6 / −.011em（正文主力）
  - large `1.0625rem`(17) / 1.6 / 0
- 标题 `--title-1..9`，**全部 semibold**：17/1.4、20/1.33、24/1.33、32/1.125、40/1.1、48/1.0、56/1.1、64/1.06、72/1.0；字距 t1–3 = −.012em，t4+ = −.022em（大字收紧）。
- 字重集合（营销）：light 300 / normal 400 / medium 510 / semibold 590 / bold 680（Inter 可变轴上的微调值）。

**应用 token 集**（https://static.linear.app/client/assets/style-ZE1gKoQJ.css ，置信度高）：

- 尺寸：`--font-size-micro:.6875rem`(11，渐进增强写法 `round(up,.6875rem,2px)`)、`mini:.75rem`(12)、`small:.8125rem`(13)、`regular:.9375rem`(15)、`large:1.125rem`(18)。
- 应用标题：`--font-size-title3:1.25rem`(20)、`title2:1.5rem`(24)、`title1:2.25rem`(36)（命名与营销相反，t1 最大）。
- 字重（应用）：light 300 / **normal 450** / medium 500 / semibold 600 / bold 700。
- 基础行高：`body{line-height:1.5}`（另有 reset `line-height:1`），antialiased + optimizelegibility。
- **富文本/评论编辑器音阶**（`--editor-*`，驱动描述、评论、项目更新与快速创建框）：`--editor-font-size` 档位 `.75/.8125/.9375/1.125/1.25/1.5rem`（12→24，正文默认 `var(--font-size-regular)`=15）；`--editor-line-height` 取值 1.2/1.4/1.5/1.6/1.625/20px/22px/calc(1+1/3) 等随语境；`--editor-font-weight` 450/500/600；`--editor-letter-spacing:-.00666667em`。快速创建编辑器三档：Small→13px、Regular/Large→15px。
- **⌘K 命令菜单**（产品组件，营销侧同款 CSS 可测，置信度中高）：输入框 `height:46px; font-size:15px`；列表项 `min-height:46px; font-size:13px; line-height:1.2`；分组标题 `height:30px; font-size:12px; medium`；对话框 `max-width:min(720px,100vw−32px)`、圆角 12、`top:13vh` 居中。
  来源：https://static.linear.app/web/_next/static/css/CommandMenu.BLDiNz.css 即 `CommandMenu.BLNdDiNz.css`（https://static.linear.app/web/_next/static/css/CommandMenu.BLNdDiNz.css）。

### 2.2 Raycast

**手册站 token（第一方完整音阶，置信度高）**——https://manual.raycast.com/_next/static/immutable/chunks/26koaixtwar63.css：

- 字号：`xs .75rem`(12)、`sm .875rem`(14)、`base .9375rem`(15，正文)、`sidebar .875rem`(14)、`lg 1.125rem`(18)、`h4 1.25rem`(20)、`h3 1.5rem`(24)、`h2 1.75rem`(28)、`h1 2.25rem`(36)；移动端 h1 30 / h2 24 / h3 20。
- 行高：`--line-height-tight:1.25`（标题）、`--line-height-normal:1.6`（正文）；字距 h1 −.02em、h2 −.015em、h3 −.01em、h4 −.005em、body 0。
- 字重：静态 Inter 四档 400/500/600/700；`h1..h3{font-weight:600}`（页面级 h1 另有 700 用法）；kbd/键帽用 Geist Mono `11px/500`。

**官网（置信度高）**——www.raycast.com CSS 实测：

- 出现频次最高字号：14px(126 处) > 16 > 12 > 13 > 20 > 18 > 15 > 11 > 24 > 10，再往上 32/40/48/64 为 hero/章节标题。
- 字重频次：**500(201) > 400(60) > 600(55)**，少量 700；标题 `h1 40–48px/600`（hero 最大 64）、markdown `h1 40 / h2 32 / h3 24` 全 600；章节标题 `32px/500, letter-spacing −.025em`；hero 大字开 `font-feature-settings:"ss08","ss02"`。

**商店（store，置信度高）**——https://www.raycast.com/_next/static/immutable/chunks/0d9m26k9b70t8.css：正文 14/21、meta 13、小字 12、条目名 20/30 w600、所有者名 20/30 w500、句柄用等宽 16/150% w300、描述 15。

**应用内**：无公开 CSS；只能引用官方表述——v2 公测缺「larger font sizes」（后续补齐）、Interface Size 档位缩放全局。应用内具体 px：**未获一手来源（低/未知）**。

---

## 3. 布局骨架（侧栏、页头带、输入区、列表密度）

### 3.1 Linear

| 事实 | 来源 | 置信度 |
| --- | --- | --- |
| 桌面应用结构 = 左侧**导航侧栏** + 顶部**窗口 Tab 条** + 每视图头（app headers / view headers 分两级）；2024 改版官方明确把 chrome 归纳为 "sidebar, tabs, app headers, view headers" 四件套 | https://linear.app/blog/how-we-redesigned-the-linear-ui | 高 |
| 2026 刷新：侧栏**调暗**（"a few notches dimmer"）让内容区主导；顶部 Tab 改为**更紧凑、圆角、图标+小字、不再通栏**（"smaller icon-only tabs"） | https://linear.app/blog/behind-the-latest-design-refresh | 高 |
| 侧栏像素宽：应用 CSS 内存在 `width:256px`（×2）、`min-width:256px`、`width:220px` 等固定值，但类名经 StyleX/CSS-module 哈希（`sx-1t9vceh` 等），**无法在静态 CSS 里归因到侧栏本体**；子级链接有可测的缩进 `margin-left:calc(var(--indent-offset)+var(--indent-current)+20px)`。侧栏宽度应运行时 DevTools 复核，256px 为首要候选 | https://static.linear.app/client/assets/style-ZE1gKoQJ.css | **低–中**（候选 256px，未证实） |
| 视图头：`--content-view-header-tabs-min-width:300px`（flex `1 1 300px`）；营销侧产品同款的 IssueListView 头 `height:44px` + `border-bottom` hairline | 应用 style.css；https://static.linear.app/web/_next/static/css/IssueListView.BH55qTC9.css | 中高 |
| **没有通栏营销式页头带**：应用顶部是窗口级 Tab 条（紧凑、不满宽）而非 header band；营销站才有 `--header-height:72px`（小屏 64px）、`--header-blur:20px` 的 sticky 带，`--page-max-width:1024px`、`--prose-max-width:624px` | 应用 CSS + blog 叙述 + layout.css | 高 |
| **密列表行高**：应用 CSS 有 `grid-auto-rows:38px`（列表网格候选值）、36/40/44px 固定高度若干处（哈希类，归因受限）；菜单项实测 `min-height:32px; font-size:13px; line-height:32px`；设置页分组行 `min-height:60px`（padding-y 12/16、gap 12/8），分组头 `min-height:48/60px` | 应用 style.css；菜单同款见 https://static.linear.app/web/_next/static/css/Header.BxKAvHxV.css | 行高数值中；菜单/设置项高 |
| **Composer 位置**：Linear 只有一个共享富文本组件（`sharedEditorRoot` 全样式表出现 78 处）驱动描述/评论/更新/快速创建；快速创建框贴列表底部（`fastCreateEditorSmall/Regular/Large`），评论 composer 在 issue 详情**底部**（官方文档为客户端渲染未抓到正文，按产品常识记 Medium，建议运行时复核）；⌘K 菜单输入框 46px 在对话框顶部、行 46px 密排 | 应用 style.css + CommandMenu.css | 中 |
| 应用为自绘窗口（CSS 含 `draggableRegion`/`electron-disable-drag` 拖拽区与 Electron 开关），无系统原生标题栏依赖 | 应用 style.css | 高 |

### 3.2 Raycast

| 事实 | 来源 | 置信度 |
| --- | --- | --- |
| **根窗口骨架：顶部 Search Bar（唯一输入）→ 下方 Root Search 结果列表 → 窗口底部 Action Bar**（左侧=当前命令导航标题+toast，右侧=上下文动作+快捷键提示）；命令参数输入框就地出现在 search bar 区域 | 布局奠基文 https://www.raycast.com/blog/a-fresh-look-and-feel （2022 引入"更大的搜索条 + 底部 action bar"）；现行描述 https://manual.raycast.com/search-bar | 高 |
| **Compact Mode**：空查询时窗口收起为只剩搜索条，开始输入/打开 Action Panel 才展开列表；入口 Settings → Appearance → Window Mode | https://manual.raycast.com/search-bar | 高 |
| **侧栏**：AI Chat 有历史**侧栏**（可分组/拖拽/文件夹），Settings 有**设置侧栏**；v2.4 "Golden Gate"（2026-09-14）官方交付 "new sidebars / toolbars + Liquid Glass updates" | https://manual.raycast.com/ai/ai-chat 、https://manual.raycast.com/settings 、https://www.raycast.com/changelog | 高 |
| **页头带**：应用没有通栏导航带（顶部是搜索条，底部是 action bar）；第一方 Web 面的导航带：官网 `--navbar-height:58px`（+16px padding；另有 76px 变体），容器宽 1204/1280/1064/746px，栅格 gap 24px | https://www.raycast.com CSS chunks `:root` | 高（官网） |
| **手册站侧栏（可测的 260px 基准）**：`--sidebar-width:260px`、fixed 左置、`padding:24px 0 0`、nav `padding:0 24px 16px`、嵌套用 `border-left:1px` + `padding-left:12px`；顶部 `--navbar-height:58px` | https://manual.raycast.com/_next/static/immutable/chunks/26koaixtwar63.css | 高（文档站）；与应用侧栏同源属中 |
| **Composer**：AI Chat 的输入框称 composer（挂载 attach/@/mic、`/` 选模型；空 composer ↑ 编辑上一条），模型选择器在窗口**标题栏**——即「title bar 在上、composer 在内容区」结构；composer 具体贴底为产品形态（文档未逐字说 bottom，中） | https://manual.raycast.com/ai/ai-chat ；https://www.raycast.com/blog/the-new-raycast （"the same composer powers both" Quick AI 与 AI Chat） | 中 |
| **行密度**：应用内行高无一手来源；第一方 Web 面参照——分页/选择器控件 36px、changelog 版本行 line-height 24、商店 meta 行 13px/描述 15px（21px 行高）、Interface Size 档位改变全局密度 | 官网/商店/手册 CSS + https://www.raycast.com/changelog | 中低（应用值未知） |
| 间距/圆角体系（应用与官网共用观感，官网 token 实测）：spacing 8px 基准（4/8/12/16/20/24/32/40/48/56/64/80/96/112/168/224），rounding 4/6/8/12/16/20/24/full | https://www.raycast.com CSS `:root` | 高 |

---

## 4. 层次手法：线 vs 留白 vs 卡片

### 4.1 Linear

- **官方纲领（2026 刷新）**："Structure should be felt not seen"——分隔线此前"悄悄增殖"，刷新**减少分隔线数量、把边线改圆角、降低对比**；同时"导航侧栏/顶部 Tab/图标整体调暗、缩小、去装饰"，让内容区独占注意力（"Don't compete for attention you haven't earned"）；默认色板由冷蓝转向**更暖、更低饱和的灰**。来源：https://linear.app/blog/behind-the-latest-design-refresh （置信度高）。
- **线的 token**：`--border-hairline:1px`（含 .5px 高密度变体）；`--color-border-primary/secondary/tertiary` + `--color-border-translucent:#0000000d`（深浅两套）；分隔 keyline = `height:1px background var(--color-border-translucent-strong)`。来源：layout.css、HomepageSeparator.css（高）。
- **行 ≠ 卡**：密列表行是**平铺行 +8px 圆角选中态**（选中用 `box-shadow:0 0 0 1px … inset` 内描边而非边框），列表头一条 hairline 底线（IssueListView 头 44px + border-bottom）。来源：应用 style.css、IssueListView.css（高）。
- **卡片的节制使用**：设置页把相关字段分组为**成组卡片**——`--settings-list-view-item-radius:10px`、`thin-pixel:1px`、行 `min-height:60px`、组头 48/60px；首页产品模拟里的 IssueCard `height:96px; radius:9px; hairline border`。即：**设置/表单用卡，数据列表用行**。来源：应用 style.css、IssueCard.css（高/中）。
- 官方对「信息密度 vs 压迫感」的原话：保留 "rich density of information without letting the interface feel overwhelming"——密度靠**对齐与字色分级**（tertiary/quaternary 文字）而非物理分隔。来源：refresh 博文（高）。

### 4.2 Raycast

- **嵌套层次靠线**：手册侧栏子级 `border-left:1px solid var(--color-border-tertiary); padding-left:12px`；changelog 时间线 `border-left:1px solid rgba(lines,.1)`；正文字块/表格分隔同样 1px。来源：手册/官网 CSS（高）。
- **卡片用于「跳转单元格」**：手册内容卡 `--radius-lg:12px; border:1px solid var(--color-border-separator); padding:16px`，hover 变主题色边 + `--shadow-sm`（外加 `transform:scale(.99)` 按压）；商店扩展卡 `--rounding-md(12px)` 网格卡。来源：手册/商店 CSS（高）。
- **圆角与间距即层次**：官网 `:root` rounding 4/6/8/12/16/20/24/full、spacing 8px 基准序列——层级差异用留白(24/32/48/64…)+圆角表达，少用横线切块。来源：https://www.raycast.com CSS（高）。
- 应用侧语言（官方叙述）：图标统一线宽与圆角规则（与 James McDonald 合作的 outline 图标集）、toast 收进底部 action bar、v2 的 Liquid Glass "used in tasteful ways"。来源：https://www.raycast.com/blog/a-fresh-look-and-feel 、https://www.raycast.com/blog/the-new-raycast （高）。

---

## 5. 对 Alpha 换代的可直接引用结论（摘要）

1. **字体**：两家殊途同归——**Inter 做正文（可变/静态、自托管 WOFF2、OFL 许可）**；等宽一个用商业字（Linear：Berkeley Mono，自托管需授权），一个用 OFL 字（Raycast：Geist Mono，辅以 JetBrains Mono）。**CJK 都不做内嵌**：栈里不放 CJK 家族，靠系统逐字回退；Linear 额外给泰文做了 local() 显式兜底，这是可抄的「按语种补 local()」模式。
2. **音阶**：正文 14–15px、UI 小字 12–13px、标签 11–12px；标题 20/24/28/36/48 各家按需取；行高正文 1.5–1.6、标题 1.25–1.4；**字重不用整百**（Linear 应用 normal=450/medium=500/semibold=600，营销 510/590；Raycast 400/500/600/700）；大标题负字距（−.012em→−.025em 随字号加深）。
3. **骨架**：**左侧栏 + 顶部窗口级条（Tab 或搜索条）+ 内容区视图头 + 底部输入/动作区**是共同答案——Linear 是 sidebar+tab 条+视图头、composer 贴详情底部、⌘K 行 46px；Raycast 是顶部 search bar、中部结果列表、**底部 action bar**、composer 在聊天内容区。侧栏宽度公开可测值：手册 260px；Linear 应用候选 256px（待运行时复核）。
4. **层次**：**密列表用行（平铺+圆角选中态+hairline 头线），设置/表单才用卡片（10–12px 圆角+1px 浅边）**；两家 2022–2026 都在做**减线**（Linear 官方明说"更少分隔线、更软对比"），导航整体调暗把注意力让给内容；层次更多由**字色分级 + 留白节奏 + 圆角**完成。

## 6. 未决/需运行时复核

- Linear 应用侧栏真实默认宽（256px 候选）、issue 列表行高（38px grid-auto-rows 候选）、评论 composer 贴底——StyleX 哈希类名 + 文档客户端渲染导致静态抓取无法坐实。
- Raycast 应用内的确切字体文件与行高（本地 WebView，无公开 CSS）；仅有 Interface Size 与「v2 补更大字号」的官方表述。
