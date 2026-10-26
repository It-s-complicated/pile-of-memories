<script lang="ts">
  import { aiDevtoolsPlugin } from "@tanstack/svelte-ai-devtools";
  import { TanStackDevtools } from "@tanstack/svelte-devtools";

  const plugins = [aiDevtoolsPlugin()];
</script>

<TanStackDevtools {plugins} eventBusConfig={{ connectToServerBus: true }} />
