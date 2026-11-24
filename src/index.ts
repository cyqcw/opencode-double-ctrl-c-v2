import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "opencode-double-ctrl-c-v2",
  async setup() {
    // This package is TUI-only. The server part exists so that OpenCode can
    // load the package from a local plugin directory without failing with
    // "Plugin entrypoint not found".
  },
})
