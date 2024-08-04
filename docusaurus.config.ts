import PrismLight from './src/utils/prismLight';
import PrismDark from './src/utils/prismDark';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Notes',
  tagline: '记想记的东西～',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://lin-mt.github.io/',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/notes/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'lin-mt', // Usually your GitHub org/user name.
  projectName: 'notes', // Usually your repo name.
  trailingSlash: false,
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
          editUrl: 'https://github.com/lin-mt/notes/tree/main/',
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
      logo: {
        alt: 'Notes Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          label: 'Java',
          position: 'right',
          items: [
            {
              label: 'OpenCV',
              type: 'docSidebar',
              sidebarId: 'javaOpenCV',
            }
          ]
        },
        {
          label: 'DevOps',
          position: 'right',
          items: [
            {
              label: 'Docker',
              type: 'docSidebar',
              sidebarId: 'devOpsDocker'
            },
            {
              label: 'K8S',
              type: 'docSidebar',
              sidebarId: 'devOpsK8S'
            },
            {
              label: 'Pulsar',
              type: 'docSidebar',
              sidebarId: 'devOpsPulsar'
            },
            {
              label: 'Shell',
              type: 'docSidebar',
              sidebarId: 'devOpsShell'
            }
          ]
        },
        {to: '/blog', label: 'Blog', position: 'left'},
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
              href: 'https://github.com/lin-mt/notes/issue',
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
