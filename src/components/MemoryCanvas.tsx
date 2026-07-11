import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  CaptureUpdateAction,
  Excalidraw,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import { memoryCardPosition } from "../lib/layout";
import { createMemoryCard, saveMemoryContents } from "../lib/memoryFns";
import { DEFAULT_MEMORY_BODY, type Memory, type MemoryContent } from "../lib/memories";

type SceneElement = ReturnType<ExcalidrawImperativeAPI["getSceneElements"]>[number];

type MemoryCanvasProps = {
  initialMemories: Memory[];
};

function cardText(memory: Pick<Memory, "title" | "body">) {
  return `${memory.title || "Untitled memory"}\n\n${memory.body || DEFAULT_MEMORY_BODY}`;
}

function makeCard(memory: Memory, index: number) {
  const { x, y } = memoryCardPosition(index);

  return convertToExcalidrawElements(
    [
      {
        type: "rectangle",
        x,
        y,
        width: 420,
        height: 180,
        backgroundColor: "#fff3bf",
        strokeColor: "#5f4b32",
        roundness: { type: 3 },
        label: {
          text: cardText(memory),
          width: 360,
          fontSize: 18,
          textAlign: "center",
          verticalAlign: "middle",
        },
        customData: {
          type: "memory-card",
          memoryId: memory.id,
        },
      } satisfies ExcalidrawElementSkeleton,
    ],
    { regenerateIds: true },
  );
}

function getMemoryId(element: SceneElement) {
  const customData = element.customData;
  if (!customData || typeof customData !== "object") return;

  const data = customData as Record<string, unknown>;
  if (data.type !== "memory-card" || typeof data.memoryId !== "string") return;

  return data.memoryId;
}

function readMemoryContents(elements: readonly SceneElement[]) {
  const textByContainerId = new Map<string, string>();

  for (const element of elements) {
    if (element.type === "text" && element.containerId) {
      textByContainerId.set(element.containerId, element.text);
    }
  }

  return elements.flatMap((element) => {
    const id = getMemoryId(element);
    if (!id) return [];

    const text = textByContainerId.get(element.id) ?? "";
    const [title = "", ...bodyLines] = text.split("\n");

    return {
      id,
      title: title.trim() || "Untitled memory",
      body: bodyLines.join("\n").trim(),
    };
  });
}

function snapshot(contents: MemoryContent[]) {
  return JSON.stringify(contents);
}

export default function MemoryCanvas({ initialMemories }: MemoryCanvasProps) {
  const router = useRouter();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const initialElements = useMemo(() => initialMemories.flatMap(makeCard), [initialMemories]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSaved = useRef(snapshot(readMemoryContents(initialElements)));

  const initialData = useMemo(
    () =>
      ({
        elements: initialElements,
        scrollToContent: true,
        appState: {
          viewBackgroundColor: "#f5f1ea",
        },
      }) satisfies ExcalidrawInitialDataState,
    [initialElements],
  );

  const queueContentSave = useCallback((elements: readonly SceneElement[]) => {
    const contents = readMemoryContents(elements);
    const nextSnapshot = snapshot(contents);
    if (nextSnapshot === lastSaved.current) return;

    lastSaved.current = nextSnapshot;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveMemoryContents({ data: { memories: contents } }).catch(() => {
        lastSaved.current = "";
      });
    }, 500);
  }, []);

  const handleApi = useCallback((nextApi: ExcalidrawImperativeAPI) => {
    setApi(nextApi);
  }, []);

  useEffect(() => {
    if (!api) return;

    const timer = setTimeout(() => {
      api.scrollToContent(api.getSceneElements(), {
        fitToViewport: true,
        viewportZoomFactor: 0.8,
        animate: false,
      });
    });

    return () => clearTimeout(timer);
  }, [api]);

  const addCard = useCallback(async () => {
    if (!api) return;

    const memory = await createMemoryCard();
    const elements = api.getSceneElements();
    const nextIndex = readMemoryContents(elements).length;

    api.updateScene({
      elements: [...elements, ...makeCard(memory, nextIndex)],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    await router.invalidate();
  }, [api, router]);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p>Pile of Memories II</p>
          <h1>Arrange what is worth keeping.</h1>
        </div>
        <button type="button" className="card-button" onClick={addCard} disabled={!api}>
          New card
        </button>
      </header>
      <main className="canvas">
        <Excalidraw
          excalidrawAPI={handleApi}
          initialData={initialData}
          onChange={(elements) => queueContentSave(elements)}
          UIOptions={{
            canvasActions: {
              saveToActiveFile: false,
              loadScene: false,
              export: false,
            },
          }}
        />
      </main>
    </div>
  );
}
