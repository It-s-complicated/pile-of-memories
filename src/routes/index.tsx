import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getMemories } from "../lib/memoryFns";

const MemoryCanvas = lazy(() => import("../components/MemoryCanvas"));

export const Route = createFileRoute("/")({
  ssr: "data-only",
  loader: () => getMemories(),
  pendingComponent: Loading,
  component: Home,
});

function Home() {
  const memories = Route.useLoaderData();

  return (
    <Suspense fallback={<Loading />}>
      <MemoryCanvas initialMemories={memories} />
    </Suspense>
  );
}

function Loading() {
  return <div className="app-loading">Loading memories...</div>;
}
