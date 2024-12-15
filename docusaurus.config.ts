import PrismLight from './src/utils/prismLight';
import PrismDark from './src/utils/prismDark';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Notes and blogs',
  tagline: 'Talk is cheap. Show me the code.',
  // favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://lin-mt.github.io/',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'lin-mt', // Usually your GitHub org/user name.
  projectName: 'notes', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans'],
  },

  themes: ['@docusaurus/theme-mermaid'],

  markdown: {
    mermaid: true,
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/lin-mt/notes/tree/main/',
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl: 'https://github.com/lin-mt/notes/tree/main/',
          // Useful options to enforce blogging best practices
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    navbar: {
      title: 'Notes',
      // logo: {
      //   alt: 'Notes Logo',
      //   src: 'img/logo.svg',
      // },
      items: [
        {label: 'Blog', position: 'left', to: '/blog'},
        {
          label: '开源',
          type: 'docSidebar',
          position: 'right',
          sidebarId: 'openSource',
        }, {
          label: 'Java',
          position: 'right',
          items: [{
            label: 'Spring Boot',
            type: 'docSidebar',
            sidebarId: 'javaSpringBoot',
          }, {
            label: 'OpenCV',
            type: 'docSidebar',
            sidebarId: 'javaOpenCV',
          }, {
            label: 'Dubbo',
            type: 'docSidebar',
            sidebarId: 'javaDubbo',
          }, {
            label: 'Pulsar',
            type: 'docSidebar',
            sidebarId: 'javaPulsar',
          }]
        }, {
          label: 'DevOps',
          position: 'right',
          items: [{
            label: 'Shell',
            type: 'doc',
            docId: 'dev-ops/shell'
          }, {
            label: 'DevOps工具',
            type: 'docSidebar',
            sidebarId: 'devOpsTool'
          }, {
            label: 'K8S',
            type: 'docSidebar',
            sidebarId: 'devOpsK8S'
          }, {
            label: '服务部署',
            type: 'docSidebar',
            sidebarId: 'devOpsService'
          }, {
            label: '持续集成',
            type: 'docSidebar',
            sidebarId: 'devOpsCICD'
          }]
        },
        {
          href: 'https://github.com/lin-mt/notes',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub repository',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Community',
          items: [
            {
              label: 'Github',
              href: 'https://github.com/lin-mt',
            }
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Notes, Inc. Built with Docusaurus.`,
    },
    prism: {
      theme: PrismLight,
      darkTheme: PrismDark,
      additionalLanguages: ['java'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
