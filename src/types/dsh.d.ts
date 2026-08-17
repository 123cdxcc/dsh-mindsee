declare module '@deepseek-ai/cordis' {
  export interface Context {
    tools: {
      register(definition: unknown): () => void
    }
    credentials?: {
      resolve(ref: string): Promise<{ value: string } | undefined>
    }
    webServer: {
      register(route: {
        kind: 'exact' | 'prefix'
        path: string
        handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void | Promise<void>
      }): () => void
    }
    get(name: string): unknown
    inject(deps: string[], callback: (ctx: Context) => void): void
    effect(callback: () => (() => void) | void, label?: string): void
  }
}
