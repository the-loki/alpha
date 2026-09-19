/**
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
 * both.
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

export const EN = {
  'window.minimize': 'Minimize window',
  'window.maximize': 'Maximize window',
  'window.restore': 'Restore window',
  'window.close': 'Close window',
  'settings.open': 'Settings',

  'sidebar.newConversation': 'New conversation',
  'sidebar.newConversationIn': 'in {folder}',
  'sidebar.newConversationNowhere': 'in no folder yet',
  'sidebar.addFolder': 'Add a folder',
  'sidebar.search': 'Search',
  'sidebar.folders': 'Folders',
  'sidebar.noFolders': 'No folders yet.',
  'sidebar.noConversations': 'No conversations yet',
  'sidebar.conversations': '{count} conversations',
  'sidebar.oneConversation': '1 conversation',
  'sidebar.startIn': 'Start a conversation in {folder}',
  'sidebar.expand': 'Expand {folder}',
  'sidebar.collapse': 'Collapse {folder}',
  'sidebar.rename': 'Rename {title}',
  'sidebar.delete': 'Delete {title}',
  'sidebar.renameAction': 'Rename',
  'sidebar.conversationTitle': 'Conversation title',
  'sidebar.deleteAction': 'Delete',
  'sidebar.idle': 'idle',
  'sidebar.working': 'working',
  'sidebar.waiting': 'waiting for you',
  'sidebar.browserNoPicker': 'A folder can only be added in the desktop app.',

  'empty.noFolder.title': 'Add a folder to begin',
  'empty.noFolder.body':
    'A folder is what the agent reads and edits. Everything you ask for happens inside one, and nothing happens outside it without your say-so.',
  'empty.chooseFolder': 'Choose a folder',
  'empty.folder.body':
    'Say what you want changed here and this becomes a conversation of its own. The other folders stay in the sidebar, with what was asked in them.',

  'composer.messageLabel': 'Message the agent',
  'composer.placeholder': 'Ask the agent to change something…',
  'composer.placeholderNoFolder': 'Add a folder first',
  'composer.send': 'Send',
  'composer.stop': 'Stop',
  'composer.queue': 'Queue',
  'composer.steer': 'Steer',
  'composer.cancelQueued': 'Cancel the queued message: {text}',
  'composer.queued': 'Queued',
  'composer.queuedList': 'Queued messages',
  'composer.cancel': 'Cancel',
  'composer.noteIdle': 'Enter sends, Shift+Enter starts a new line.',
  'composer.noteWorking': 'The agent is working. Escape stops it.',
  'composer.noteSteer': 'Steer changes what it does next. Queue waits until this turn is done.',
  'composer.noteNoModel': 'No model configured yet.',

  'settings.theme': 'Theme',
  'settings.themeNote':
    'Light is what a new workbench opens on. The dark palette is its own set of colours rather than an inversion, and following the system switches between the two as the machine does.',
  'settings.themeSystem': 'Follow the system',
  'settings.themeDark': 'Dark',
  'settings.themeLight': 'Light',
  'settings.accent': 'Accent',
  'settings.accentNote':
    'The colour of the streaming answer, the focus ring and the primary action. Every one is measured against both palettes, so none of them is legible in only one.',
  'settings.language': 'Language',
  'settings.languageNote':
    'Which language this interface is written in. What the agent is told stays in the language of the conversation itself, so translating the interface does not change how a conversation reads.',
} as const

export type TextKey = keyof typeof EN

export const ZH = {
  'window.minimize': '最小化窗口',
  'window.maximize': '最大化窗口',
  'window.restore': '还原窗口',
  'window.close': '关闭窗口',
  'settings.open': '设置',

  'sidebar.newConversation': '新建会话',
  'sidebar.newConversationIn': '在 {folder}',
  'sidebar.newConversationNowhere': '还没有目录',
  'sidebar.addFolder': '添加目录',
  'sidebar.search': '搜索',
  'sidebar.folders': '目录',
  'sidebar.noFolders': '还没有目录。',
  'sidebar.noConversations': '还没有会话',
  'sidebar.conversations': '{count} 个会话',
  'sidebar.oneConversation': '1 个会话',
  'sidebar.startIn': '在 {folder} 开一个新会话',
  'sidebar.expand': '展开 {folder}',
  'sidebar.collapse': '收起 {folder}',
  'sidebar.rename': '重命名 {title}',
  'sidebar.delete': '删除 {title}',
  'sidebar.renameAction': '重命名',
  'sidebar.conversationTitle': '会话标题',
  'sidebar.deleteAction': '删除',
  'sidebar.idle': '空闲',
  'sidebar.working': '运行中',
  'sidebar.waiting': '等你决定',
  'sidebar.browserNoPicker': '只有桌面应用可以添加目录。',

  'empty.noFolder.title': '先添加一个目录',
  'empty.noFolder.body':
    '目录是 agent 读取和修改的地方。你要它做的事都发生在某个目录里，未经你同意什么都不会发生在目录之外。',
  'empty.chooseFolder': '选择目录',
  'empty.folder.body': '在这里说你想改什么，它就会成为一个会话。其它目录仍留在侧栏里，连同在里面问过的事。',

  'composer.messageLabel': '给 agent 的消息',
  'composer.placeholder': '让 agent 改点什么…',
  'composer.placeholderNoFolder': '先添加一个目录',
  'composer.send': '发送',
  'composer.stop': '停止',
  'composer.queue': '排队',
  'composer.steer': '插话',
  'composer.cancelQueued': '取消排队中的消息：{text}',
  'composer.queued': '排队中',
  'composer.queuedList': '排队中的消息',
  'composer.cancel': '取消',
  'composer.noteIdle': 'Enter 发送，Shift+Enter 换行。',
  'composer.noteWorking': 'agent 正在工作，按 Escape 停止。',
  'composer.noteSteer': '插话会改变它接下来做什么；排队要等这一轮结束。',
  'composer.noteNoModel': '还没有配置模型。',

  'settings.theme': '主题',
  'settings.themeNote': '新装的工作台默认浅色。深色是一套自己的颜色而不是反相；跟随系统则随系统在两者之间切换。',
  'settings.themeSystem': '跟随系统',
  'settings.themeDark': '深色',
  'settings.themeLight': '浅色',
  'settings.accent': '配色',
  'settings.accentNote': '流式回答、焦点圈和主按钮的颜色。每一种都在两套调色板上量过对比度，没有哪一种只在一边可读。',
  'settings.language': '语言',
  'settings.languageNote':
    '界面用哪种语言。给 agent 看的话仍用会话自己的语言，所以界面翻译不会改变一个会话读起来的样子。',
} as const satisfies Record<TextKey, string>

const DICTIONARIES: Record<Language, Record<TextKey, string>> = { en: EN, zh: ZH }

/**
 * A line of the interface, with its holes filled. A hole with no value is left standing as
 * `{name}`: a visibly unfilled placeholder is a bug report, an empty gap is a mystery.
 */
export function text(language: Language, key: TextKey, params: TextParams = {}): string {
  const line = DICTIONARIES[language][key]
  return line.replace(/\{(\w+)\}/g, (whole, name: string) => {
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
