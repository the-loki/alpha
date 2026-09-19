"""Rebuild packages/core/src/i18n.ts from one table of (key, en, zh).

The file is generated here rather than hand-edited because the two dictionaries have to stay in
step, and a single table is the only shape in which that is checkable by eye.
"""
import pathlib

HEADER = '''/**
 * The interface's words, in the two languages it is written in.
 *
 * Chrome only. Two other kinds of string are deliberately not here: what the agent is told (a
 * permission refusal, the reason a tool was blocked) is part of the conversation and is read by
 * the model, so it stays in the language the conversation is in; and anything a vendor or the
 * operating system said is quoted rather than translated.
 *
 * The dictionary is data, not code: a translator can read it, and the compiler checks that every
 * key in `EN` has an answer in `ZH`. Plurals are separate keys rather than a plural rule, because
 * the two languages here disagree about what a plural even is and one `{count}` hole cannot say
 * both. `docs/adr/0010` is the decision; this file is the whole of the interface's copy.
 */

import type { ModelStatus } from './contract.ts'

export const LANGUAGES = ['en', 'zh'] as const

export type Language = (typeof LANGUAGES)[number]

/** What the setting may say: one of the languages, or "whichever the machine is in". */
export const LANGUAGE_SETTINGS = ['system', ...LANGUAGES] as const

export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number]

export const DEFAULT_LANGUAGE: LanguageSetting = 'system'

export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return typeof value === 'string' && (LANGUAGE_SETTINGS as readonly string[]).includes(value)
}

/** Values for the `{name}` holes in a line. */
export type TextParams = Record<string, string | number>
'''

FOOTER = '''import { EN } from './i18n/en.ts'
import { ZH } from './i18n/zh.ts'

export type TextKey = keyof typeof EN

export { EN, ZH }

const DICTIONARIES: Record<Language, Record<TextKey, string>> = { en: EN, zh: ZH }

/**
 * A line of the interface, with its holes filled. A hole with no value is left standing as
 * `{name}`: a visibly unfilled placeholder is a bug report, an empty gap is a mystery.
 */
export function text(language: Language, key: TextKey, params: TextParams = {}): string {
  const line = DICTIONARIES[language][key]
  return line.replace(/\\{(\\w+)\\}/g, (whole, name: string) => {
    const value = params[name]
    return value === undefined ? whole : String(value)
  })
}

/**
 * What to say about the model the runtime is pointed at. Nothing at all when there is one: the
 * composer's note is for what the box cannot say itself, and a configured model is not news.
 */
export function modelText(language: Language, status: ModelStatus): string {
  return status.kind === 'none' ? text(language, 'composer.noteNoModel') : ''
}

/**
 * How many conversations there are, said properly. The one rule the dictionary cannot carry is
 * which of its two keys a count wants, and it is written once here rather than at every caller.
 */
export function conversationCount(language: Language, count: number): string {
  return count === 1 ? text(language, 'sidebar.oneConversation') : text(language, 'sidebar.conversations', { count })
}

/**
 * Which of the two languages a client is showing. `system` asks the machine (the browser's or the
 * desktop's — either way it is the language the person reading is sitting in), and a machine whose
 * language this interface does not have gets English: a dictionary is all-or-nothing, and half of
 * one reads worse than a language you did not pick, which settings can fix in a click.
 */
export function resolveLanguage(setting: LanguageSetting, systemLanguage: string): Language {
  if (setting !== 'system') return setting
  return systemLanguage.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}
'''

# (key, en, zh) — grouped by the surface that says it.
ENTRIES: list[tuple[str, str, str]] = [
    ('window.minimize', 'Minimize window', '最小化窗口'),
    ('window.maximize', 'Maximize window', '最大化窗口'),
    ('window.restore', 'Restore window', '还原窗口'),
    ('window.close', 'Close window', '关闭窗口'),
    ('tasks.title', 'Tasks', '定时任务'),
    ('tasks.intro', 'A task runs its prompt in a folder on a schedule, while the workbench is open.', '任务会在工作台开着的时候，按计划在某个目录里跑一次它的提示词。'),
    ('tasks.empty', 'No tasks yet.', '还没有任务。'),
    ('tasks.emptyBody', 'A task is a prompt that runs on its own: a nightly check, a morning summary.', '任务就是一条会自己跑的提示词：每晚检查一次、每天早上做一份小结。'),
    ('tasks.new', 'New task', '新建任务'),
    ('tasks.name', 'Name', '名字'),
    ('tasks.nameHint', 'Also the title of every conversation a run creates.', '也是每次运行造出的会话的标题。'),
    ('tasks.prompt', 'What to ask', '要它做什么'),
    ('tasks.promptHint', 'The message each run starts with.', '每次运行开始时发出的那条消息。'),
    ('tasks.folder', 'Folder', '目录'),
    ('tasks.level', 'Permission level', '权限级别'),
    ('tasks.schedule', 'Schedule', '计划'),
    ('tasks.everyMinutes', 'Every {count} minutes', '每 {count} 分钟'),
    ('tasks.dailyAt', 'Every day at {time}', '每天 {time}'),
    ('tasks.nextRun', 'Next run {when}', '下次运行：{when}'),
    ('tasks.save', 'Save task', '保存任务'),
    ('tasks.cancel', 'Cancel', '取消'),
    ('tasks.runNow', 'Run now', '立刻运行'),
    ('tasks.stop', 'Stop this task', '停用这个任务'),
    ('tasks.start', 'Start this task', '启用这个任务'),
    ('tasks.stopped', 'Stopped', '已停用'),
    ('tasks.delete', 'Delete task', '删除任务'),
    ('tasks.history', 'Runs', '运行记录'),
    ('tasks.noRuns', 'It has not run yet.', '还没有跑过。'),
    ('tasks.runOk', 'Finished', '完成'),
    ('tasks.runFailed', 'Failed', '失败'),
    ('tasks.runSkipped', 'Skipped', '跳过'),
    ('tasks.runRunning', 'Running', '正在跑'),
    ('tasks.runCatchUp', 'caught up', '补跑'),
    ('tasks.runRefusals', '{count} refused', '被拒 {count} 次'),
    ('tasks.skipMissingFolder', 'the folder is not there', '目录不在了'),
    ('tasks.levelAsk', 'Steps that need approval are refused while nobody is watching.', '需要审批的步骤在没人看着的时候会被拒绝。'),
    ('tasks.levelFull', 'It will do anything while nobody is watching.', '它会在你不在的时候做任何事。'),
    ('tasks.openRun', 'Open the conversation from {when}', '打开 {when} 那次运行的会话'),
    ('tasks.open', 'Open', '打开'),
    ('tasks.minutes', 'Every so many minutes', '每隔几分钟'),
    ('tasks.time', 'Every day at a time', '每天某个时刻'),
    ('tasks.kindEvery', 'Interval', '间隔'),
    ('tasks.kindDaily', 'Daily', '每天'),
    ('settings.open', 'Settings', '设置'),

    ('sidebar.newConversation', 'New conversation', '新建会话'),
    ('sidebar.newConversationIn', 'in {folder}', '在 {folder}'),
    ('sidebar.newConversationNowhere', 'in no folder yet', '还没有目录'),
    ('sidebar.addFolder', 'Add a folder', '添加目录'),
    ('sidebar.search', 'Search', '搜索'),
    ('sidebar.folders', 'Folders', '目录'),
    ('sidebar.noFolders', 'No folders yet.', '还没有目录。'),
    ('sidebar.noConversations', 'No conversations yet', '还没有会话'),
    ('sidebar.conversations', '{count} conversations', '{count} 个会话'),
    ('sidebar.oneConversation', '1 conversation', '1 个会话'),
    ('sidebar.startIn', 'Start a conversation in {folder}', '在 {folder} 开一个新会话'),
    ('sidebar.expand', 'Expand {folder}', '展开 {folder}'),
    ('sidebar.collapse', 'Collapse {folder}', '收起 {folder}'),
    ('sidebar.actions', 'Actions for {title}', '“{title}”的动作'),
    ('sidebar.tasks', 'Tasks', '定时任务'),
    ('sidebar.expandTasks', 'Expand the tasks in {folder}', '展开 {folder} 里的任务'),
    ('sidebar.collapseTasks', 'Collapse the tasks in {folder}', '收起 {folder} 里的任务'),
    ('sidebar.runNow', 'Run {name} now', '立刻运行 {name}'),
    ('sidebar.openTask', 'Open {name}', '打开 {name}'),
    ('sidebar.renameAction', 'Rename', '重命名'),
    ('sidebar.conversationTitle', 'Conversation title', '会话标题'),
    ('sidebar.deleteAction', 'Delete', '删除'),
    ('sidebar.archiveAction', 'Archive', '归档'),
    ('sidebar.unarchiveAction', 'Unarchive', '取消归档'),
    ('sidebar.archiveBlocked', 'Stop it first', '停下之后才能归档'),
    ('sidebar.archived', 'Archived', '已归档'),
    ('sidebar.archivedHint', 'Put away. Sending a message brings it back.', '收起来了。给它发消息就会回来。'),
    ('sidebar.expandArchived', 'Expand the archived conversations', '展开已归档的会话'),
    ('sidebar.collapseArchived', 'Collapse the archived conversations', '收起已归档的会话'),
    ('sidebar.more', 'and {count} more', '还有 {count} 个'),
    ('sidebar.showAll', 'Show all {count}', '显示全部 {count} 个'),
    ('sidebar.showFewer', 'Show fewer', '收起'),
    ('sidebar.idle', 'idle', '空闲'),
    ('sidebar.working', 'working', '运行中'),
    ('sidebar.waiting', 'waiting for you', '等你决定'),
    ('sidebar.browserNoPicker', 'A folder can only be added in the desktop app.', '只有桌面应用可以添加目录。'),

    ('empty.noFolder.title', 'Add a folder to begin', '先添加一个目录'),
    (
        'empty.noFolder.body',
        'A folder is what the agent reads and edits. Everything you ask for happens inside one, and nothing happens outside it without your say-so.',
        '目录是 agent 读取和修改的地方。你要它做的事都发生在某个目录里，未经你同意什么都不会发生在目录之外。',
    ),
    ('empty.chooseFolder', 'Choose a folder', '选择目录'),
    ('empty.startsAt', 'Starts at {level}', '将以 {level} 开始'),
    (
        'empty.folder.body',
        'Say what you want changed here and this becomes a conversation of its own. The other folders stay in the sidebar, with what was asked in them.',
        '在这里说你想改什么，它就会成为一个会话。其它目录仍留在侧栏里，连同在里面问过的事。',
    ),

    ('composer.messageLabel', 'Message the agent', '给 agent 的消息'),
    ('composer.placeholder', 'Ask the agent to change something…', '让 agent 改点什么…'),
    ('composer.placeholderNoFolder', 'Add a folder first', '先添加一个目录'),
    ('composer.send', 'Send', '发送'),
    ('composer.stop', 'Stop', '停止'),
    ('composer.queue', 'Queue', '排队'),
    ('composer.steer', 'Steer', '插话'),
    ('composer.cancelQueued', 'Cancel the queued message: {text}', '取消排队中的消息：{text}'),
    ('composer.queued', 'Queued', '排队中'),
    ('composer.queuedList', 'Queued messages', '排队中的消息'),
    ('composer.cancel', 'Cancel', '取消'),
    ('composer.steered', 'Steered', '插话中'),
    ('composer.editQueued', 'Edit the queued message: {text}', '编辑排队中的消息：{text}'),
    ('composer.deleteQueued', 'Delete the queued message: {text}', '删除排队中的消息：{text}'),
    ('composer.edit', 'Edit', '编辑'),
    ('composer.delete', 'Delete', '删除'),
    ('composer.queueStopped', 'The queue is stopped.', '队列已暂停。'),
    ('composer.queueStoppedWhy', 'A failed turn and Stop both stop it; Resume sends what is waiting.', '上一轮失败或你按了停止都会让队列停下；按"继续"就接着发。'),
    ('composer.resume', 'Resume', '继续'),
    ('composer.noteIdle', 'Enter sends, Shift+Enter starts a new line.', 'Enter 发送，Shift+Enter 换行。'),
    ('composer.noteWorking', 'The agent is working. Escape stops it.', 'agent 正在工作，按 Escape 停止。'),
    (
        'composer.noteSteer',
        'Steer changes what it does next. Queue waits until this turn is done.',
        '插话会改变它接下来做什么；排队要等这一轮结束。',
    ),
    ('composer.noteNoModel', 'No model configured yet.', '还没有配置模型。'),

    ('level.plan', 'Plan', '计划'),
    (
        'level.plan.about',
        'Reads only. The agent proposes changes instead of making them.',
        '只读。agent 提出改动建议，而不直接改。',
    ),
    ('level.ask', 'Ask', '询问'),
    ('level.ask.about', 'Asks before every file change and every command.', '每次改文件、每条命令都先问。'),
    ('level.acceptEdits', 'Accept edits', '接受编辑'),
    (
        'level.acceptEdits.about',
        'File changes run without asking. Commands still ask.',
        '改文件不再询问，命令仍然先问。',
    ),
    ('level.fullAccess', 'Full access', '完全放行'),
    ('level.fullAccess.about', 'Nothing asks. Every tool call runs immediately.', '什么都不问，每次工具调用立即执行。'),
    ('level.chipTitle', 'Permission level', '权限级别'),
    ('level.chipTitleHere', 'This conversation: {description}', '本会话：{description}'),

    ('risk.reads', 'Reads', '读取'),
    ('risk.writes', 'Writes', '写入'),
    ('risk.runs', 'Runs commands', '执行命令'),

    ('thinking.off', 'Off', '关'),
    ('thinking.minimal', 'Minimal', '最低'),
    ('thinking.low', 'Low', '低'),
    ('thinking.medium', 'Medium', '中'),
    ('thinking.high', 'High', '高'),
    ('thinking.xhigh', 'Extra high', '更高'),
    ('thinking.max', 'Max', '最高'),

    ('rule.conversation', 'This conversation', '本会话'),
    ('rule.workspace', 'This workspace', '本目录'),

    ('approval.inFolder', 'in {path}', '在 {path}'),
    ('approval.region', 'Waiting for your decision', '等你决定'),
    ('approval.change', 'Wants to change a file', '想改一个文件'),
    ('approval.command', 'Wants to run a command', '想运行一条命令'),
    ('approval.allowOnce', 'Allow once', '允许一次'),
    ('approval.alwaysAllow', 'Always allow', '总是允许'),
    ('approval.deny', 'Deny', '拒绝'),
    ('approval.rememberFor', 'Remember this for', '记住范围'),
    ('approval.scopeConversation', 'this conversation', '本会话'),
    ('approval.scopeWorkspace', 'this workspace', '本目录'),
    ('approval.reasonLabel', 'Reason for denying', '拒绝的理由'),
    ('approval.reasonPlaceholder', 'Reason (optional)', '理由（可选）'),

    ('palette.dialog', 'Switch conversation', '切换会话'),
    ('palette.search', 'Search conversations', '搜索会话'),
    ('palette.placeholder', 'Go to a conversation…', '跳到某个会话…'),
    ('palette.list', 'Conversations', '会话'),
    ('palette.empty', 'No conversations yet.', '还没有会话。'),
    ('palette.noMatch', 'Nothing matches that.', '没有匹配的。'),

    ('unlock.title', 'This workbench is not yours yet', '这个工作台还不是你的'),
    (
        'unlock.body',
        'Alpha is running on another machine, and it can run shell commands in a folder there. Paste the access token from that machine, from Settings under Browser access.',
        'Alpha 跑在另一台机器上，它能在那边的一个目录里执行 shell 命令。把那台机器「设置 → 浏览器访问」里的访问令牌粘过来。',
    ),
    ('unlock.token', 'Access token', '访问令牌'),
    ('unlock.tokenPlaceholder', 'paste the token', '粘贴令牌'),
    ('unlock.submit', 'Open the workbench', '进入工作台'),
    ('unlock.opening', 'Opening…', '正在进入…'),

    ('header.tokens', 'Tokens and cost for this conversation', '本会话的 token 与花费'),
    ('header.model', 'Model', '模型'),
    ('header.thinking', 'Thinking effort', '思考强度'),
    ('header.noProvider', 'No provider configured', '没有配置供应商'),
    ('header.export', 'Export', '导出'),
    ('header.delete', 'Delete', '删除'),
    ('header.exportedTo', 'Exported to {path}', '已导出到 {path}'),
    ('header.updated', 'updated {age}', '更新于 {age}'),

    ('message.copy', 'Copy', '复制'),
    ('message.copied', 'Copied', '已复制'),
    ('message.copyFailed', 'Copy failed', '复制失败'),
    ('message.copyMessage', 'Copy message', '复制消息'),
    ('message.copyAnswer', 'Copy answer', '复制回答'),
    ('message.copyOutput', 'Copy the output of {tool}', '复制 {tool} 的输出'),
    ('message.copyOutputLabel', 'Copy output', '复制输出'),
    ('message.edit', 'Edit', '编辑'),
    ('message.editLabel', 'Edit the message', '编辑这条消息'),
    ('message.regenerate', 'Regenerate', '重新生成'),
    ('message.resend', 'Resend, replacing what followed', '重发，并替换其后的内容'),
    ('message.fork', 'Fork into a new conversation', '分叉成新会话'),
    (
        'message.editNote',
        'Replacing drops the messages after this one. Forking copies them to a new conversation and leaves this one alone.',
        '重发会丢掉这条之后的消息；分叉会把它们复制到一个新会话，本会话不动。',
    ),
    ('message.stopped', 'Stopped — what arrived before the stop is kept', '已停止 — 停止前收到的内容保留'),
    ('message.failed', 'The turn failed.', '这一轮失败了。'),
    ('message.thinking', 'Thinking', '思考'),
    ('message.compacted', 'History summarised here', '历史在这里被摘要'),
    ('message.compactedCount', 'History summarised here · {count} messages', '历史在这里被摘要 · {count} 条消息'),
    ('message.turn', 'Turn · {tokens} tokens', '本轮 · {tokens} tokens'),
    ('message.turnEarlier', 'Earlier turns · {tokens} tokens', '之前的轮次 · {tokens} tokens'),
    ('message.turnCost', 'Turn · {tokens} tokens · {cost}', '本轮 · {tokens} tokens · {cost}'),
    ('message.turnEarlierCost', 'Earlier turns · {tokens} tokens · {cost}', '之前的轮次 · {tokens} tokens · {cost}'),

    ('tool.markRule', 'rule', '规则'),
    ('tool.markOnce', 'allowed once', '允许一次'),
    ('tool.markAlways', 'always allowed', '总是允许'),
    ('tool.markDenied', 'denied', '已拒绝'),
    ('tool.markBlocked', 'blocked', '被拦下'),
    ('tool.running', 'running', '运行中'),
    ('tool.done', 'done', '完成'),
    ('tool.failed', 'failed', '失败'),
    ('tool.arguments', 'Arguments', '参数'),
    ('tool.output', 'Output', '输出'),
    ('tool.truncated', 'Truncated. Full output: {path}', '已截断。完整输出：{path}'),

    (
        'gate.auto',
        'Allowed automatically by the {level} level.',
        '{level} 级别下自动放行。',
    ),
    (
        'gate.once',
        'Allowed once by you, at the {level} level.',
        '你允许了一次，权限级别 {level}。',
    ),
    (
        'gate.always',
        'Allowed by a new rule, at the {level} level.',
        '由新规则放行，权限级别 {level}。',
    ),
    (
        'gate.denied',
        'Denied by you, at the {level} level.',
        '你拒绝了它，权限级别 {level}。',
    ),
    (
        'gate.blocked',
        'Blocked by the {level} level.',
        '被 {level} 级别拦下。',
    ),
    (
        'gate.allowedByRule',
        'Allowed by a remembered rule, at the {level} level.',
        '由记住的规则放行，权限级别 {level}。',
    ),

    ('settings.title', 'Settings', '设置'),
    ('settings.sections', 'Settings sections', '设置分区'),
    ('settings.back', 'Back to the workbench', '回到工作台'),
    ('settings.groupAgent', 'The agent', 'agent'),
    ('settings.groupApp', 'This app', '这个应用'),
    ('settings.tabProviders', 'Providers', '供应商'),
    ('settings.tabPermissions', 'Permissions', '权限'),
    ('settings.tabAppearance', 'Appearance', '外观'),
    ('settings.tabBrowserAccess', 'Browser access', '浏览器访问'),
    (
        'settings.providersNote',
        'Where the models come from. Keys are held in the OS keychain and never leave this process.',
        '模型从哪来。密钥存在系统钥匙串里，不离开这个进程。',
    ),
    ('settings.permissionsNote', 'What the agent may do on its own, and what it has to ask about.', 'agent 可以自己做什么，什么必须先问。'),
    ('settings.appearanceNote', 'Which palette the workbench is drawn in, and in which colour.', '工作台用哪套调色板、哪种颜色。'),
    (
        'settings.browserAccessNote',
        'Serve this workbench to a browser on another device. Whoever holds the token can read every conversation and answer every approval — it is a remote control for this machine, not a viewer.',
        '把这个工作台提供给别的设备上的浏览器。拿到令牌的人可以读所有会话、回答所有审批——这是这台机器的遥控器，不是一个只读窗口。',
    ),
    ('settings.browserHost', 'You are reading this in a browser, where the switch is the machine to hold: a browser cannot add a folder either.', '你正在浏览器里读这个页面，开关由那台机器掌握；浏览器也不能添加目录。'),
    ('settings.serve', 'Serve to a browser', '提供给浏览器'),
    ('settings.serveLabel', 'Serve this workbench to a browser', '把这个工作台提供给浏览器'),
    ('settings.whoCanReach', 'Who can reach it', '谁能访问'),
    ('settings.openAt', 'Open it at', '在这里打开'),
    ('settings.portHint', '0 picks one', '0 表示自动选'),
    ('settings.replaceToken', 'Replace', '更换'),
    ('settings.tokenMinted', 'minted when you switch it on', '打开时生成'),

    ('settings.providers', 'Model providers', '模型供应商'),
    (
        'settings.providersBody',
        'Alpha ships no keys. A provider you add here is the only thing it can talk to, and its key is stored on this machine alone.',
        'Alpha 不内置任何密钥。你在这里加的供应商是它唯一能对话的对象，密钥只存在这台机器上。',
    ),
    (
        'settings.noKeychain',
        'This system offers no keychain, so keys are stored in plain text in the app data folder.',
        '这个系统没有钥匙串，密钥以明文存在应用数据目录里。',
    ),
    ('settings.noProviders', 'No providers yet.', '还没有供应商。'),
    ('settings.keyStored', 'key stored', '已存密钥'),
    ('settings.noKey', 'no key', '没有密钥'),
    ('settings.oneModel', '1 model', '1 个模型'),
    ('settings.models', '{count} models', '{count} 个模型'),
    ('settings.apiKeyFor', 'API key for {provider}', '{provider} 的 API 密钥'),
    ('settings.pasteKey', 'Paste the key', '粘贴密钥'),
    ('settings.saveKey', 'Save key', '保存密钥'),
    ('settings.test', 'Test', '测试'),
    ('settings.removeProvider', 'Delete', '删除'),
    ('settings.catalog', 'Add a provider from the catalog', '从目录里添加供应商'),
    ('settings.addKnown', 'Add a known provider…', '添加已知供应商…'),
    ('settings.add', 'Add', '添加'),
    ('settings.customEndpoint', 'Custom endpoint', '自定义端点'),
    ('settings.fieldId', 'Id', 'Id'),
    ('settings.fieldName', 'Name', '名称'),
    ('settings.fieldBaseUrl', 'Base URL', 'Base URL'),
    ('settings.fieldIdPlaceholder', 'my-endpoint', 'my-endpoint'),
    ('settings.fieldNamePlaceholder', 'My endpoint', '我的端点'),
    ('settings.fieldBaseUrlPlaceholder', 'the provider base url', '供应商的 base url'),
    ('settings.addCustom', 'Add custom provider', '添加自定义供应商'),
    ('settings.reasoning', 'Thinks before answering', '回答前先思考'),
    ('settings.addModel', 'Add model', '添加模型'),
    ('settings.removeModel', 'Remove', '移除'),
    ('settings.displayNamePlaceholder', 'What it is called', '显示名称'),
    ('settings.wireProtocol', 'Wire protocol', '协议'),
    ('settings.defaultLevel', 'Default permission level', '默认权限级别'),
    (
        'settings.defaultLevelNote',
        'New conversations in this workspace start here. An open conversation keeps its own level — change that from the chip in the header.',
        '这个目录里的新会话从这里开始。已打开的会话保留它自己的级别——在顶部的级别标签里改。',
    ),
    ('settings.remembered', 'Remembered approvals', '记住的批准'),
    (
        'settings.remembered.none',
        'Nothing is remembered yet. "Always allow" on a card adds a rule here.',
        '还没有记住任何东西。卡片上的「总是允许」会在这里加一条规则。',
    ),
    (
        'settings.remembered.some',
        'These calls run without asking. Revoking one makes the next matching call ask again.',
        '这些调用不再询问。撤销一条后，下一次匹配的调用会重新问。',
    ),
    ('settings.revoke', 'Revoke the {tool} rule for {pattern}', '撤销 {tool} 针对 {pattern} 的规则'),
    ('settings.revokeAction', 'Revoke', '撤销'),
    ('settings.anyPattern', '(anything)', '（任意）'),

    ('settings.theme', 'Theme', '主题'),
    (
        'settings.themeNote',
        'Light is what a new workbench opens on. The dark palette is its own set of colours rather than an inversion, and following the system switches between the two as the machine does.',
        '新装的工作台默认浅色。深色是一套自己的颜色而不是反相；跟随系统则随系统在两者之间切换。',
    ),
    ('settings.themeSystem', 'Follow the system', '跟随系统'),
    ('settings.themeDark', 'Dark', '深色'),
    ('settings.themeLight', 'Light', '浅色'),
    ('settings.accent', 'Accent', '配色'),
    (
        'settings.accentNote',
        'The colour of the streaming answer, the focus ring and the primary action. Every one is measured against both palettes, so none of them is legible in only one.',
        '流式回答、焦点圈和主按钮的颜色。每一种都在两套调色板上量过对比度，没有哪一种只在一边可读。',
    ),
    ('settings.language', 'Language', '语言'),
    (
        'settings.languageNote',
        'Which language this interface is written in. What the agent is told stays in the language of the conversation itself, so translating the interface does not change how a conversation reads.',
        '界面用哪种语言。给 agent 看的话仍用会话自己的语言，所以界面翻译不会改变一个会话读起来的样子。',
    ),
]


def entry(key: str, value: str, indent: str = '  ') -> str:
    """One line, wrapping long prose the way the formatter would."""
    single = f"{indent}'{key}': '{value}',"
    if len(single) <= 120:
        return single
    return f"{indent}'{key}':\n{indent}  '{value}',"


EN_HEADER = """/**
 * The interface's words, in English. The Chinese dictionary answers the same keys, and the
 * compiler checks that it answers every one of them.
 */

export const EN = {
"""

ZH_HEADER = """import type { TextKey } from './keys.ts'

/** The same lines, in Chinese. `satisfies Record<TextKey, string>` is the completeness check. */
export const ZH = {
"""


def main() -> None:
    keys = [key for key, _, _ in ENTRIES]
    assert len(set(keys)) == len(keys), 'duplicate key'
    en = '\n'.join(entry(key, english) for key, english, _ in ENTRIES)
    zh = '\n'.join(entry(key, chinese) for key, _, chinese in ENTRIES)
    root = pathlib.Path('packages/core/src/i18n')
    root.mkdir(exist_ok=True)
    (root / 'keys.ts').write_text(
        '/** The keys, named by the English dictionary: one table, two languages. */\n'
        "import type { EN } from './en.ts'\n\n"
        'export type TextKey = keyof typeof EN\n'
    )
    (root / 'en.ts').write_text(f'{EN_HEADER}{en}\n}} as const\n')
    (root / 'zh.ts').write_text(f'{ZH_HEADER}{zh}\n}} as const satisfies Record<TextKey, string>\n')
    pathlib.Path('packages/core/src/i18n.ts').write_text(HEADER + FOOTER)
    print(f'wrote {len(ENTRIES)} keys into i18n/en.ts and i18n/zh.ts')


if __name__ == '__main__':
    main()
