import type { UserConfig } from 'tsdown'

const PACKAGE_NAME = 'dsh-mindsee'

const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-runtime/client',
]

const config: UserConfig[] = [
  {
    entry: ['src/index.ts'],
    platform: 'node',
    dts: true,
    clean: true,
    outputOptions: {
      entryFileNames: '[name].js',
    },
  },
  {
    entry: { client: 'src/web/index.ts' },
    platform: 'browser',
    format: 'cjs',
    target: 'es2022',
    dts: false,
    clean: false,
    external: CLIENT_EXTERNALS,
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
]

export default config
