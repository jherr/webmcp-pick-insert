/**
 * MCP registration — the one bridge between this app and the outside world.
 *
 * Register each tool on Codex's browser-provided `document.modelContext` and
 * on `navigator.modelContext` for standard WebMCP clients. When the navigator
 * API is absent, load `@mcp-b/global` as a fallback for the MCP-B extension
 * and local relay.
 *
 * This module is idempotent — `useEffect` mounts may fire twice in dev,
 * but only the first successful pass actually registers.
 */
import type { ModelContextCore } from '@mcp-b/global'
import { tools } from './tools'

type CodexDocumentModelContext = {
  registerTool: (tool: {
    name: string
    description: string
    inputSchema: Record<string, unknown>
    execute: (args: unknown) => Promise<unknown>
  }) => unknown
}

declare global {
  interface Document {
    modelContext?: CodexDocumentModelContext
  }
}

let registered = false
let registeredCount = 0
let registrationPromise: Promise<void> | null = null

export function getRegisteredToolCount(): number {
  return registeredCount
}

export function isMcpRegistered(): boolean {
  return registered
}

export function registerWebMcpTools(): Promise<void> {
  if (typeof window === 'undefined' || registered) return Promise.resolve()
  if (registrationPromise) return registrationPromise

  registerCodexWebMcpTools()
  registrationPromise = registerTools()
  return registrationPromise
}

async function registerTools(): Promise<void> {
  let ctx = navigator.modelContext as ModelContextCore | undefined
  let registrationTarget = 'browser-provided WebMCP context'

  if (!ctx) {
    try {
      const { initializeWebModelContext } = await import('@mcp-b/global')
      initializeWebModelContext({ installTestingShim: 'if-missing' })
      ctx = navigator.modelContext as ModelContextCore | undefined
      registrationTarget = '@mcp-b/global fallback'
    } catch (e) {
      console.warn('[mcp] initializeWebModelContext fallback failed', e)
      registrationPromise = null
      return
    }
  }

  if (!ctx) {
    console.warn('[mcp] navigator.modelContext unavailable after init')
    registrationPromise = null
    return
  }

  for (const tool of tools) {
    try {
      ctx.registerTool({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
        execute: tool.execute,
      })
      registeredCount += 1
    } catch (e) {
      console.warn(`[mcp] failed to register tool "${tool.name}"`, e)
    }
  }

  // Only mark as registered once we got far enough to install tools, so a
  // failed init can be retried by the next `useEffect` mount.
  registered = true

  console.log(
    `[mcp] registered ${registeredCount} tools on ${registrationTarget}`,
  )
}

function registerCodexWebMcpTools(): void {
  const ctx = document.modelContext
  if (!ctx || typeof ctx.registerTool !== 'function') return

  let count = 0
  for (const tool of tools) {
    try {
      ctx.registerTool({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        execute: tool.execute,
      })
      count += 1
    } catch (error) {
      console.warn(`[mcp] failed to register Codex tool "${tool.name}"`, error)
    }
  }

  console.log(`[mcp] registered ${count} tools on document.modelContext`)
}
