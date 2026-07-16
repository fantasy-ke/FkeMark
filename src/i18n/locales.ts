// 多语言字典（扁平 key 结构，支持 {name} 占位符插值）
// 中文为默认语言（zh-CN），英文为 en。

export type Lang = 'zh-CN' | 'en'
export type Dict = Record<string, string>

export const LANG_LABELS: Record<Lang, string> = {
  'zh-CN': '简体中文',
  en: 'English',
}

export const zhCN: Dict = {
  // ── 设置面板 ──
  'settings.title': '设置',
  'settings.group.appearance': '外观',
  'settings.group.editor': '编辑器',
  'settings.group.view': '视图',
  'settings.group.behavior': '行为',
  'settings.group.shortcuts': '快捷键',
  'settings.group.language': '语言',

  'settings.theme': '主题',
  'settings.theme.hint': '明亮 / 黑暗 / 跟随系统',
  'settings.theme.light': '明亮',
  'settings.theme.dark': '黑暗',
  'settings.theme.system': '系统',

  'settings.toolbarFloating': '工具栏悬浮',
  'settings.toolbarFloating.hint': '居中悬浮显示，不占用文档空间',

  'settings.cornerRadius': '布局圆角',
  'settings.cornerRadius.hint': '面板/卡片/代码块等整体圆角',
  'settings.buttonRadius': '按钮圆角',
  'settings.buttonRadius.hint': '按钮/输入框/菜单项等圆角',
  'unit.px': 'px',

  'settings.fontSize': '字体大小',
  'settings.fontSize.hint': '编辑区正文字号（8-48pt）',
  'unit.pt': 'pt',

  'settings.fontFamily': '字体',
  'settings.fontFamily.hint': '编辑器正文字体（读取本机可用字体）',

  'settings.lineHeight': '行高',
  'settings.lineHeight.hint': '正文行间距',
  'settings.lineHeight.compact': '紧凑',
  'settings.lineHeight.normal': '标准',
  'settings.lineHeight.relaxed': '宽松',

  'settings.editorWidth': '编辑区宽度',
  'settings.editorWidth.hint': '内容区域最大宽度',
  'settings.width.narrow': '窄',
  'settings.width.medium': '标准',
  'settings.width.wide': '宽',

  'settings.showMarkers': '显示 Markdown 标记',
  'settings.showMarkers.hint': '聚焦时显示行内语法标记',
  'settings.autoBracket': '自动补全括号',
  'settings.autoBracket.hint': '输入 ( [ { 时自动配对',

  'settings.defaultMode': '默认视图模式',
  'settings.defaultMode.hint': '启动时使用的编辑器模式',
  'settings.mode.live': '实时',
  'settings.mode.source': '源码',
  'settings.mode.read': '阅读',

  'settings.showLineNumbers': '显示行号',
  'settings.showLineNumbers.hint': '编辑器左侧显示行号',
  'settings.minimap': '小地图',
  'settings.minimap.hint': '显示文档缩略图',
  'settings.minimapSide': '小地图位置',
  'settings.minimapSide.hint': '选择小地图显示在编辑器的左侧或右侧',
  'settings.side.left': '左',
  'settings.side.right': '右',

  'settings.autoSave': '自动保存',
  'settings.autoSave.hint': '编辑时自动保存到本地',
  'settings.autoSaveInterval': '自动保存间隔',
  'settings.autoSaveInterval.hint': '秒（{n}s 后触发）',
  'unit.s': 's',

  'settings.language.hint': '界面显示语言',
  'settings.unavailable': '不可用',

  // ── 快捷键列表 ──
  'shortcut.newFile': '新建文档',
  'shortcut.save': '保存文档',
  'shortcut.openFolder': '打开文件夹',
  'shortcut.toggleView': '切换视图模式',
  'shortcut.exitRead': '退出阅读模式',
  'shortcut.heading': '标题 H1-H6',
  'shortcut.body': '恢复正文',
  'shortcut.boldItalic': '粗体 / 斜体',
  'shortcut.strike': '删除线',
  'shortcut.quote': '引用块',
  'shortcut.link': '插入链接',
  'shortcut.tableCell': '表格内跳转单元格',
  'shortcut.slash': '斜杠命令菜单',

  // ── 标题栏 ──
  'topbar.menu': '菜单',
  'topbar.toggleView': '切换视图',
  'topbar.toggleTheme': '切换主题',
  'topbar.newFile': '新建文件',
  'topbar.openFolder': '打开文件夹',
  'topbar.about': '关于 FkeMark',
  'topbar.settings': '设置',
  'topbar.toggleSidebar': '切换侧栏',
  'topbar.minimize': '最小化',
  'topbar.maximize': '最大化',
  'topbar.close': '关闭',

  // ── 状态栏 ──
  'status.saved': '已保存',
  'status.saving': '保存中…',
  'status.unsaved': '未保存',
  'status.line': '行 {rows}, 列 {col}',
  'status.chars': '{n} 字',
  'status.mode.live': '实时编辑',
  'status.mode.source': '源码模式',
  'status.mode.read': '阅读模式',
  'status.settings': '设置',

  // ── 欢迎页 ──
  'welcome.tagline': '极简即时渲染 Markdown 编辑器',
  'welcome.taglineEn': 'Write Simply. Think Clearly.',
  'welcome.newFile': '新建文件',
  'welcome.openFolder': '打开文件夹',
  'welcome.hintNew': '新建文档',
  'welcome.hintOpen': '打开文件',

  // ── 侧边栏 ──
  'sidebar.tab.files': '文件',
  'sidebar.tab.tree': '文件树',
  'sidebar.tab.outline': '大纲',
  'sidebar.recent': '最近打开',
  'sidebar.recentFolders': '最近打开的文件夹',
  'sidebar.openOther': '打开其他文件夹',
  'sidebar.empty': '暂无打开的文件',
  'sidebar.emptyHint': '点击「打开文件夹」选择目录',
  'sidebar.tocEmpty': '在文档中编写标题以生成大纲',
  'sidebar.remove': '移除',
  'sidebar.time.now': '刚刚',
  'sidebar.time.minutes': '{n} 分钟前',
  'sidebar.time.hours': '{n} 小时前',
  'sidebar.time.days': '{n} 天前',

  // ── 关于页 ──
  'about.title': '关于',
  'about.close': '关闭',
  'about.intro.title': '简介',
  'about.intro.desc':
    'FkeMark 是一款无数据库、文件系统优先的极简 Markdown 即时渲染编辑器。' +
    '采用 Tauri + React + ProseMirror 构建，支持 Typora 风格的即时渲染、' +
    '斜杠命令、源码/实时/阅读三模式切换、拖拽图片落盘等专业写作能力。',
  'about.version.title': '版本信息',
  'about.version.version': '版本',
  'about.version.build': '构建',
  'about.version.license': '许可',
  'about.version.engine': '引擎',
  'about.links.title': '链接',
  'about.links.site': '官网',
  'about.links.github': 'GitHub',
  'about.links.feedback': '反馈',
  'about.links.license': '许可证',
  'about.credits.title': '致谢',
  'about.credits.desc':
    '感谢 Tauri、React、ProseMirror、TipTap、lowlight 等开源项目，' +
    '以及所有为 Markdown 写作体验做出贡献的开发者。',

  // ── 编辑器上下文菜单 / 弹窗 ──
  'ctx.hideMinimap': '隐藏小地图',
  'ctx.showMinimap': '显示小地图',
  'ctx.liveMode': '实时编辑模式',
  'ctx.readMode': '阅读模式',

  'table.insertRowAbove': '上方插入行',
  'table.insertRowBelow': '下方插入行',
  'table.insertColLeft': '左侧插入列',
  'table.insertColRight': '右侧插入列',
  'table.deleteRow': '删除当前行',
  'table.deleteCol': '删除当前列',
  'table.deleteTable': '删除整个表格',

  'linkDialog.title': '插入链接',
  'linkDialog.text': '显示文本（可选）',
  'linkDialog.textPlaceholder': '选中文本将自动填入',
  'linkDialog.url': '链接地址',
  'linkDialog.urlPlaceholder': 'https://',
  'linkDialog.cancel': '取消',
  'linkDialog.ok': '插入',

  'codeLang.placeholder': '语言',

  // ── 斜杠命令菜单 ──
  'slash.title': '斜杠命令',
  'slash.empty': '无匹配命令',
  'slash.navigate': '选择',
  'slash.confirm': '确认',
  'slash.close': '关闭',
  'slash.cmd.h1': '一级标题',
  'slash.cmd.h2': '二级标题',
  'slash.cmd.h3': '三级标题',
  'slash.cmd.h4': '四级标题',
  'slash.cmd.bold': '粗体',
  'slash.cmd.italic': '斜体',
  'slash.cmd.strike': '删除线',
  'slash.cmd.quote': '引用',
  'slash.cmd.ul': '无序列表',
  'slash.cmd.ol': '有序列表',
  'slash.cmd.todo': '任务列表',
  'slash.cmd.code': '行内代码',
  'slash.cmd.codeblock': '代码块',
  'slash.cmd.table': '表格',
  'slash.cmd.hr': '分割线',
  'slash.cmd.image': '图片',
  'slash.cmd.link': '链接',
  'slash.cat.heading': '标题',
  'slash.cat.format': '文本格式',
  'slash.cat.list': '列表与引用',
  'slash.cat.code': '代码与结构',
  'slash.cat.insert': '插入对象',
}

export const enUS: Dict = {
  // ── Settings Panel ──
  'settings.title': 'Settings',
  'settings.group.appearance': 'Appearance',
  'settings.group.editor': 'Editor',
  'settings.group.view': 'View',
  'settings.group.behavior': 'Behavior',
  'settings.group.shortcuts': 'Shortcuts',
  'settings.group.language': 'Language',

  'settings.theme': 'Theme',
  'settings.theme.hint': 'Light / Dark / Follow system',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.theme.system': 'System',

  'settings.toolbarFloating': 'Floating toolbar',
  'settings.toolbarFloating.hint': 'Centered floating, does not occupy document space',

  'settings.cornerRadius': 'Layout radius',
  'settings.cornerRadius.hint': 'Overall radius for panels/cards/code blocks',
  'settings.buttonRadius': 'Button radius',
  'settings.buttonRadius.hint': 'Radius for buttons/inputs/menu items',
  'unit.px': 'px',

  'settings.fontSize': 'Font size',
  'settings.fontSize.hint': 'Editor body font size (8-48pt)',
  'unit.pt': 'pt',

  'settings.fontFamily': 'Font',
  'settings.fontFamily.hint': 'Editor body font (detected from system)',

  'settings.lineHeight': 'Line height',
  'settings.lineHeight.hint': 'Body line spacing',
  'settings.lineHeight.compact': 'Compact',
  'settings.lineHeight.normal': 'Normal',
  'settings.lineHeight.relaxed': 'Relaxed',

  'settings.editorWidth': 'Editor width',
  'settings.editorWidth.hint': 'Maximum content width',
  'settings.width.narrow': 'Narrow',
  'settings.width.medium': 'Medium',
  'settings.width.wide': 'Wide',

  'settings.showMarkers': 'Show Markdown markers',
  'settings.showMarkers.hint': 'Show inline syntax markers on focus',
  'settings.autoBracket': 'Auto-close brackets',
  'settings.autoBracket.hint': 'Auto-pair when typing ( [ {',

  'settings.defaultMode': 'Default view mode',
  'settings.defaultMode.hint': 'Editor mode used on startup',
  'settings.mode.live': 'Live',
  'settings.mode.source': 'Source',
  'settings.mode.read': 'Read',

  'settings.showLineNumbers': 'Show line numbers',
  'settings.showLineNumbers.hint': 'Show line numbers on the left',
  'settings.minimap': 'Minimap',
  'settings.minimap.hint': 'Show document thumbnail',
  'settings.minimapSide': 'Minimap position',
  'settings.minimapSide.hint': 'Choose left or right side of the editor',
  'settings.side.left': 'Left',
  'settings.side.right': 'Right',

  'settings.autoSave': 'Auto save',
  'settings.autoSave.hint': 'Auto-save to local on edit',
  'settings.autoSaveInterval': 'Auto-save interval',
  'settings.autoSaveInterval.hint': 'seconds (triggers after {n}s)',
  'unit.s': 's',

  'settings.language.hint': 'Interface display language',
  'settings.unavailable': 'unavailable',

  // ── Shortcuts ──
  'shortcut.newFile': 'New document',
  'shortcut.save': 'Save document',
  'shortcut.openFolder': 'Open folder',
  'shortcut.toggleView': 'Toggle view mode',
  'shortcut.exitRead': 'Exit read mode',
  'shortcut.heading': 'Heading H1-H6',
  'shortcut.body': 'Body text',
  'shortcut.boldItalic': 'Bold / Italic',
  'shortcut.strike': 'Strikethrough',
  'shortcut.quote': 'Blockquote',
  'shortcut.link': 'Insert link',
  'shortcut.tableCell': 'Move between table cells',
  'shortcut.slash': 'Slash command menu',

  // ── Titlebar ──
  'topbar.menu': 'Menu',
  'topbar.toggleView': 'Toggle view',
  'topbar.toggleTheme': 'Toggle theme',
  'topbar.newFile': 'New file',
  'topbar.openFolder': 'Open folder',
  'topbar.about': 'About FkeMark',
  'topbar.settings': 'Settings',
  'topbar.toggleSidebar': 'Toggle sidebar',
  'topbar.minimize': 'Minimize',
  'topbar.maximize': 'Maximize',
  'topbar.close': 'Close',

  // ── Status bar ──
  'status.saved': 'Saved',
  'status.saving': 'Saving…',
  'status.unsaved': 'Unsaved',
  'status.line': 'Line {rows}, Col {col}',
  'status.chars': '{n} chars',
  'status.mode.live': 'Live editing',
  'status.mode.source': 'Source mode',
  'status.mode.read': 'Reading mode',
  'status.settings': 'Settings',

  // ── Welcome ──
  'welcome.tagline': 'Minimal instant-render Markdown editor',
  'welcome.taglineEn': 'Write Simply. Think Clearly.',
  'welcome.newFile': 'New file',
  'welcome.openFolder': 'Open folder',
  'welcome.hintNew': 'New document',
  'welcome.hintOpen': 'Open file',

  // ── Sidebar ──
  'sidebar.tab.files': 'Files',
  'sidebar.tab.tree': 'File tree',
  'sidebar.tab.outline': 'Outline',
  'sidebar.recent': 'Recent',
  'sidebar.recentFolders': 'Recent folders',
  'sidebar.openOther': 'Open other folder',
  'sidebar.empty': 'No files open',
  'sidebar.emptyHint': "Click 'Open folder' to select a directory",
  'sidebar.tocEmpty': 'Write headings in your document to generate an outline',
  'sidebar.remove': 'Remove',
  'sidebar.time.now': 'Just now',
  'sidebar.time.minutes': '{n} min ago',
  'sidebar.time.hours': '{n} h ago',
  'sidebar.time.days': '{n} d ago',

  // ── About ──
  'about.title': 'About',
  'about.close': 'Close',
  'about.intro.title': 'Introduction',
  'about.intro.desc':
    'FkeMark is a database-free, file-system-first minimal Markdown instant-render editor. ' +
    'Built with Tauri + React + ProseMirror, it supports Typora-style instant rendering, ' +
    'slash commands, source/live/read three-mode switching, and drag-to-disk image writing.',
  'about.version.title': 'Version info',
  'about.version.version': 'Version',
  'about.version.build': 'Build',
  'about.version.license': 'License',
  'about.version.engine': 'Engine',
  'about.links.title': 'Links',
  'about.links.site': 'Website',
  'about.links.github': 'GitHub',
  'about.links.feedback': 'Feedback',
  'about.links.license': 'License',
  'about.credits.title': 'Acknowledgements',
  'about.credits.desc':
    'Thanks to open-source projects such as Tauri, React, ProseMirror, TipTap, and lowlight, ' +
    'and to all the developers who contribute to the Markdown writing experience.',

  // ── Editor context menus / dialogs ──
  'ctx.hideMinimap': 'Hide minimap',
  'ctx.showMinimap': 'Show minimap',
  'ctx.liveMode': 'Live edit mode',
  'ctx.readMode': 'Read mode',

  'table.insertRowAbove': 'Insert row above',
  'table.insertRowBelow': 'Insert row below',
  'table.insertColLeft': 'Insert column left',
  'table.insertColRight': 'Insert column right',
  'table.deleteRow': 'Delete row',
  'table.deleteCol': 'Delete column',
  'table.deleteTable': 'Delete table',

  'linkDialog.title': 'Insert link',
  'linkDialog.text': 'Display text (optional)',
  'linkDialog.textPlaceholder': 'Selected text auto-filled',
  'linkDialog.url': 'URL',
  'linkDialog.urlPlaceholder': 'https://',
  'linkDialog.cancel': 'Cancel',
  'linkDialog.ok': 'Insert',

  'codeLang.placeholder': 'Language',

  // ── Slash command menu ──
  'slash.title': 'Slash commands',
  'slash.empty': 'No matching command',
  'slash.navigate': 'navigate',
  'slash.confirm': 'confirm',
  'slash.close': 'close',
  'slash.cmd.h1': 'Heading 1',
  'slash.cmd.h2': 'Heading 2',
  'slash.cmd.h3': 'Heading 3',
  'slash.cmd.h4': 'Heading 4',
  'slash.cmd.bold': 'Bold',
  'slash.cmd.italic': 'Italic',
  'slash.cmd.strike': 'Strikethrough',
  'slash.cmd.quote': 'Quote',
  'slash.cmd.ul': 'Bullet list',
  'slash.cmd.ol': 'Numbered list',
  'slash.cmd.todo': 'Task list',
  'slash.cmd.code': 'Inline code',
  'slash.cmd.codeblock': 'Code block',
  'slash.cmd.table': 'Table',
  'slash.cmd.hr': 'Divider',
  'slash.cmd.image': 'Image',
  'slash.cmd.link': 'Link',
  'slash.cat.heading': 'Headings',
  'slash.cat.format': 'Text format',
  'slash.cat.list': 'Lists & quotes',
  'slash.cat.code': 'Code & structure',
  'slash.cat.insert': 'Insert objects',
}

export const DICTS: Record<Lang, Dict> = {
  'zh-CN': zhCN,
  en: enUS,
}
