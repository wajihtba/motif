// Right inspector rail: Design | Effects (M3) | Animate (M4).

import type { EditorController } from "@/controller"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DesignPanel } from "./DesignPanel"
import { AnimatePanel } from "./AnimatePanel"
import { EffectsPanel } from "./EffectsPanel"

export function InspectorTabs({ ctrl }: { ctrl: EditorController }) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l bg-background">
      <Tabs defaultValue="design" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-2 grid grid-cols-3">
          <TabsTrigger value="design">Design</TabsTrigger>
          <TabsTrigger value="effects">Effects</TabsTrigger>
          <TabsTrigger value="animate">Animate</TabsTrigger>
        </TabsList>
        <TabsContent value="design" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <DesignPanel ctrl={ctrl} />
          </ScrollArea>
        </TabsContent>
        <TabsContent value="effects" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <EffectsPanel ctrl={ctrl} />
          </ScrollArea>
        </TabsContent>
        <TabsContent value="animate" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <AnimatePanel ctrl={ctrl} />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </aside>
  )
}
