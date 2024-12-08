import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  // By default, Docusaurus generates a sidebar from the docs folder structure
  javaOpenCV: [{type: 'autogenerated', dirName: 'java/opencv'}],
  devOpsDubbo: [{type: 'autogenerated', dirName: 'java/dubbo'}],
  devOpsDocker: [{type: 'autogenerated', dirName: 'dev-ops/docker'}],
  devOpsK8S: [{type: 'autogenerated', dirName: 'dev-ops/k8s'}],
  devOpsPulsar: [{type: 'autogenerated', dirName: 'dev-ops/pulsar'}],
  devOpsShell: [{type: 'autogenerated', dirName: 'dev-ops/shell'}],

  // But you can create a sidebar manually
  /*
  tutorialSidebar: [
    'intro',
    'hello',
    {
      type: 'category',
      label: 'Tutorial',
      items: ['tutorial-basics/create-a-document'],
    },
  ],
   */
};

export default sidebars;
