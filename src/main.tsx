import { StrictMode, useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
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
import "./styles.css";

const STORAGE_KEY = "pile-of-memories-ii-scene";

function makeCard(x: number, y: number, title = "Memory card") {
  const memoryId = crypto.randomUUID();
  return convertToExcalidrawElements(
    [
      {
        type: "rectangle",
        x,
        y,
        width: 280,
        height: 160,
        backgroundColor: "#fff3bf",
        strokeColor: "#5f4b32",
        roundness: { type: 3 },
        label: {
          text: `${title}\n\nWrite the memory, then move it where it belongs.`,
          fontSize: 20,
          textAlign: "center",
          verticalAlign: "middle",
        },
        customData: {
          type: "memory-card",
          memoryId,
        },
      } satisfies ExcalidrawElementSkeleton,
    ],
    { regenerateIds: true },
  );
}

function loadScene() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const scene = JSON.parse(saved) as ExcalidrawInitialDataState;
    return {
      elements: scene.elements ?? [],
      files: scene.files,
      appState: {
        viewBackgroundColor: scene.appState?.viewBackgroundColor ?? "#f5f1ea",
      },
    } satisfies ExcalidrawInitialDataState;
  }

  return {
    elements: [
      ...makeCard(-360, -120, "Capture"),
      ...makeCard(0, -20, "Arrange"),
      ...makeCard(360, -120, "Connect"),
      ...makeCard(0, 260, "Review"),
    ],
    appState: {
      viewBackgroundColor: "#f5f1ea",
    },
  } satisfies ExcalidrawInitialDataState;
}

function App() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const initialData = useMemo(loadScene, []);

  const addCard = useCallback(() => {
    if (!api) return;

    api.updateScene({
      elements: [...api.getSceneElements(), ...makeCard(40, 40)],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }, [api]);

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
          excalidrawAPI={setApi}
          initialData={initialData}
          onChange={(elements, appState, files) => {
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({
                elements,
                files,
                appState: {
                  viewBackgroundColor: appState.viewBackgroundColor,
                },
              }),
            );
          }}
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
