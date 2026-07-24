import { defineConfig } from 'vitepress'
import { defineTeekConfig, LayoutMode } from 'vitepress-theme-teek/config'

const repo = 'https://github.com/fantasy-ke/FkeMark'
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true'
// Cloudflare Pages 通常发布到根域名；如需子路径部署，请显式设置 DOCS_BASE。
const base = process.env.DOCS_BASE || (isGitHubActions ? '/FkeMark/' : '/')

const zhVersionMenu = {
  text: '版本',
  items: [
    { text: '历史版本', link: repo + '/releases' },
    { text: '更新日志', link: '/guide/changelog' }
  ]
}

const enVersionMenu = {
  text: 'Versions',
  items: [
    { text: 'Release history', link: repo + '/releases' },
    { text: 'Changelog', link: '/en/guide/changelog' }
  ]
}

const sharedTheme = {
  teekHome: false,
  vpHome: true,
  pageStyle: 'card-nav',
  themeSize: 'default',
  sidebarTrigger: true,
  loading: 'FkeMark Docs',
  author: {
    name: 'fantasyke',
    link: repo
  },
  banner: {
    enabled: false
  },
  themeEnhance: {
    enabled: true,
    position: 'top',
    layoutSwitch: {
      defaultMode: LayoutMode.Original,
      disableHelp: true
    },
    themeColor: {
      defaultColorName: 'fkemark-blue',
      append: [
        {
          label: 'FkeMark',
          tip: '适合 Markdown 编辑器的蓝白清晰主题色',
          options: [
            { value: 'fkemark-blue', label: 'FkeMark 蓝', color: '#2563eb', title: 'FkeMark Blue', ariaLabel: '切换到 FkeMark 蓝白主题' },
            { value: 'editor-sky', label: '编辑器天蓝', color: '#0ea5e9', title: 'Editor Sky', ariaLabel: '切换到编辑器天蓝主题' }
          ]
        }
      ]
    },
    spotlight: {
      defaultValue: true
    }
  },
  backTop: {
    enabled: true,
    content: 'progress'
  },
  codeBlock: {
    enabled: true,
    collapseHeight: 700,
    overlay: true,
    overlayHeight: 420,
    langTextTransform: 'uppercase'
  },
  articleAnalyze: {
    showIcon: true,
    showInfo: true,
    showAuthor: false,
    showCreateDate: false,
    showUpdateDate: true,
    showCategory: false,
    showTag: false
  },
  articleUpdate: {
    enabled: true,
    limit: 5
  },
  docAnalysis: {
    enabled: true,
    title: '站点信息',
    createTime: '2026-07-22',
    wordCount: true,
    readingTime: true
  },
  logo: base + 'logo.svg',
  siteTitle: 'FkeMark Docs'
}

const zhThemeConfig = {
  ...sharedTheme,
  nav: [
    { text: '首页', link: '/' },
    { text: '文档教程', link: '/guide/' },
    { text: '主题设计', link: '/guide/theme' },
    zhVersionMenu,
    { text: 'English', link: '/en/' }
  ],
  sidebar: {
    '/guide/': [
      {
        text: '入门',
        items: [
          { text: '快速开始', link: '/guide/' },
          { text: '安装与构建', link: '/guide/install' },
          { text: '使用方法', link: '/guide/usage' }
        ]
      },
      {
        text: '编辑功能',
        items: [
          { text: '编辑教程', link: '/guide/editing' },
          { text: 'Markdown 语法', link: '/guide/syntax' },
          { text: '工具栏', link: '/guide/toolbar' },
          { text: '功能模块与按钮', link: '/guide/features' },
          { text: '快捷键', link: '/guide/shortcuts' }
        ]
      },
      {
        text: '配置与发布',
        items: [
          { text: '设置页面', link: '/guide/settings' },
          { text: '蓝白主题', link: '/guide/theme' },
          { text: '部署文档站', link: '/guide/deploy' },
          { text: '更新日志', link: '/guide/changelog' }
        ]
      }
    ]
  },
  search: {
    provider: 'local',
    options: {
      translations: {
        button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
        modal: {
          noResultsText: '没有找到结果',
          resetButtonTitle: '清除搜索',
          footer: { selectText: '选择', navigateText: '切换' }
        }
      }
    }
  },
  footerGroup: [
    {
      title: '项目',
      links: [
        { name: '文档教程', link: '/guide/' },
        { name: 'English Docs', link: '/en/guide/' },
        { name: 'GitHub 仓库', link: repo }
      ]
    },
    {
      title: '版本',
      links: [
        { name: '历史版本', link: repo + '/releases' },
        { name: '更新日志', link: '/guide/changelog' }
      ]
    },
    {
      title: '部署',
      links: [
        { name: 'Cloudflare Pages', link: '/guide/deploy' },
        { name: 'VitePress', link: 'https://vitepress.dev/' },
        { name: 'Theme Teek', link: 'https://vp.teek.top/' }
      ]
    }
  ],
  footerInfo: {
    theme: {
      show: true,
      name: 'Theme Teek',
      link: 'https://github.com/Kele-Bingtang/vitepress-theme-teek'
    },
    copyright: {
      show: true,
      createYear: 2026,
      name: 'fantasyke',
      suffix: 'Released under AGPL-3.0-only.'
    }
  },
  langMenuLabel: '切换语言',
  returnToTopLabel: '返回顶部',
  sidebarMenuLabel: '菜单',
  darkModeSwitchLabel: '外观',
  lightModeSwitchTitle: '切换到浅色模式',
  darkModeSwitchTitle: '切换到深色模式',
  editLink: {
    pattern: repo + '/edit/main/doc/:path',
    text: '在 GitHub 上编辑此页'
  },
  docFooter: {
    prev: '上一篇',
    next: '下一篇'
  },
  outline: {
    label: '本页目录',
    level: [2, 3]
  },
  lastUpdated: {
    text: '最近更新'
  },
  footer: {
    message: 'Released under AGPL-3.0-only.',
    copyright: 'Copyright © 2026 fantasyke'
  }
}

const enThemeConfig = {
  ...sharedTheme,
  nav: [
    { text: 'Home', link: '/en/' },
    { text: 'Docs', link: '/en/guide/' },
    { text: 'Theme', link: '/en/guide/theme' },
    enVersionMenu,
    { text: '中文', link: '/' }
  ],
  sidebar: {
    '/en/guide/': [
      {
        text: 'Start',
        items: [
          { text: 'Quick Start', link: '/en/guide/' },
          { text: 'Install & Build', link: '/en/guide/install' },
          { text: 'Usage', link: '/en/guide/usage' }
        ]
      },
      {
        text: 'Editing',
        items: [
          { text: 'Editing Guide', link: '/en/guide/editing' },
          { text: 'Markdown Syntax', link: '/en/guide/syntax' },
          { text: 'Toolbar', link: '/en/guide/toolbar' },
          { text: 'Feature Modules & Buttons', link: '/en/guide/features' },
          { text: 'Shortcuts', link: '/en/guide/shortcuts' }
        ]
      },
      {
        text: 'Configuration',
        items: [
          { text: 'Settings', link: '/en/guide/settings' },
          { text: 'Clear Blue Theme', link: '/en/guide/theme' },
          { text: 'Deploy Docs', link: '/en/guide/deploy' },
          { text: 'Changelog', link: '/en/guide/changelog' }
        ]
      }
    ]
  },
  search: {
    provider: 'local'
  },
  footerGroup: [
    {
      title: 'Project',
      links: [
        { name: 'Docs', link: '/en/guide/' },
        { name: '中文文档', link: '/guide/' },
        { name: 'GitHub Repository', link: repo }
      ]
    },
    {
      title: 'Versions',
      links: [
        { name: 'Release history', link: repo + '/releases' },
        { name: 'Changelog', link: '/en/guide/changelog' }
      ]
    },
    {
      title: 'Deploy',
      links: [
        { name: 'Cloudflare Pages', link: '/en/guide/deploy' },
        { name: 'VitePress', link: 'https://vitepress.dev/' },
        { name: 'Theme Teek', link: 'https://vp.teek.top/' }
      ]
    }
  ],
  footerInfo: {
    theme: {
      show: true,
      name: 'Theme Teek',
      link: 'https://github.com/Kele-Bingtang/vitepress-theme-teek'
    },
    copyright: {
      show: true,
      createYear: 2026,
      name: 'fantasyke',
      suffix: 'Released under AGPL-3.0-only.'
    }
  },
  langMenuLabel: 'Change language',
  returnToTopLabel: 'Return to top',
  sidebarMenuLabel: 'Menu',
  darkModeSwitchLabel: 'Appearance',
  lightModeSwitchTitle: 'Switch to light theme',
  darkModeSwitchTitle: 'Switch to dark theme',
  editLink: {
    pattern: repo + '/edit/main/doc/:path',
    text: 'Edit this page on GitHub'
  },
  docFooter: {
    prev: 'Previous page',
    next: 'Next page'
  },
  outline: {
    label: 'On this page',
    level: [2, 3]
  },
  lastUpdated: {
    text: 'Last updated'
  },
  footer: {
    message: 'Released under AGPL-3.0-only.',
    copyright: 'Copyright © 2026 fantasyke'
  }
}

const teekConfig = defineTeekConfig(zhThemeConfig)

export default defineConfig({
  extends: teekConfig,
  title: 'FkeMark',
  description: '文件系统优先的 Markdown 混合即时渲染编辑器文档',
  lang: 'zh-CN',
  base,
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['README.md'],
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/'
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      title: 'FkeMark Docs',
      description: 'Documentation for the filesystem-first Markdown editor.',
      themeConfig: enThemeConfig
    }
  },
  head: [
    ['meta', { name: 'theme-color', content: '#f6f9ff' }],
    ['meta', { property: 'og:title', content: 'FkeMark 文档' }],
    ['meta', { property: 'og:description', content: '文件系统优先的 Markdown 混合即时渲染编辑器文档教程' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: base + 'logo.svg' }]
  ],
  markdown: {
    lineNumbers: true,
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    }
  }
})
