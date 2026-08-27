import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { startRenderController } from '@/store/render-controller'
import { StlViewer } from '@/viewer/StlViewer'
import { SlotList } from '@/ui/SlotList'
import { PreviewActions } from '@/ui/PreviewActions'
import { registerWebMcpTools } from '@/mcp/register'

export const Route = createFileRoute('/')({ component: App })

function App() {
  useEffect(() => {
    registerWebMcpTools()
    return startRenderController()
  }, [])

  return (
    <main className="grid h-screen w-screen grid-cols-[460px_1fr] bg-(--bg-base)">
      <aside className="flex min-h-0 flex-col border-r border-(--line)">
        <h1 className="shrink-0 px-4 pt-4 text-lg font-semibold tracking-tight text-(--sea-ink)">
          Altoids Pick Insert
        </h1>
        <SlotList className="min-h-0 flex-1 overflow-y-auto p-4" />
      </aside>

      <div className="flex min-h-0 flex-col">
        <div className="flex items-center justify-end gap-3 border-b border-(--line) px-3 py-2">
          <PreviewActions />
        </div>
        <div className="min-h-0 flex-1 bg-black/40">
          <StlViewer className="h-full w-full" />
        </div>
      </div>
    </main>
  )
}
