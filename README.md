# MindFlow

An XMind / NiceMind-style mind-mapping app with Claude built into the backend through
**MCP (Model Context Protocol)**. Draw and edit maps on an infinite canvas, ask the
in-app Claude assistant to brainstorm or restructure them, or point Claude Desktop /
Claude Code at the MCP endpoint and let Claude work on your maps from the outside.
Every edit, wherever it comes from, appears live on the canvas.

```
┌──────────────┐   REST + SSE    ┌──────────────────────┐   tools    ┌──────────────┐
│  React canvas│ ◄─────────────► │  Node server         │ ◄────────► │  Claude API  │
│  (client/)   │                 │  - map store (JSON)  │            │  (assistant) │
└──────────────┘                 │  - tool registry     │            └──────────────┘
                                 │  - MCP server  /mcp  │ ◄────────► Claude Desktop,
                                 └──────────────────────┘   MCP      Claude Code, …
```

One tool registry (`server/src/tools.ts`) is exposed twice: to the Claude API for the
in-app assistant and over MCP (Streamable HTTP and stdio) for any MCP client.

## Features

**Editor**
- Infinite canvas: scroll to pan, `Ctrl`/`⌘` + scroll to zoom, double-click empty space to fit
- Three layouts: balanced mind map, logic chart (right), org chart (down)
- Six colour themes, per-branch colours, emoji markers, notes, links
- Keyboard-first editing: `Tab` child, `Enter` sibling, `F2` or just type to rename,
  `Delete`, `Space` collapse, arrows to navigate, `Ctrl+↑/↓` reorder, `Ctrl+Z/Y` undo/redo,
  `Ctrl+K` toggle the assistant, `Ctrl+0` fit
- Drag a node onto another node to re-parent it
- Collapse/expand branches with hidden-count badges
- Multiple maps, autosave, live sync across tabs
- Import markdown outlines or `.mindflow.json`; export PNG, Markdown, JSON

**Claude assistant (in-app)**
- Streams responses and shows each tool call as it runs
- Quick actions: expand the selected node, brainstorm branches, find gaps, summarise, reorganise
- "Let Claude generate the first draft" when creating a map

**MCP server**
- Tools: `list_mindmaps`, `get_mindmap`, `create_mindmap`, `add_nodes`, `update_node`,
  `delete_nodes`, `move_node`, `replace_branch`, `search_nodes`, `set_map_options`, `delete_mindmap`
- Resources: `mindmap://{mapId}` (markdown outline with node ids)
- Prompts: `brainstorm`, `review-map`

## Quick start

Requires Node 20+.

```bash
npm install
cp .env.example .env        # add ANTHROPIC_API_KEY for the in-app assistant
npm run dev                  # server on :8787, Vite client on :5173
```

Open <http://localhost:5173>. Without an API key everything works except the in-app
assistant (MCP clients bring their own Claude).

Production:

```bash
npm run build
npm start                    # serves the built client and the API on :8787
```

## Connecting Claude through MCP

### Claude Code

The repo ships a `.mcp.json` that registers the HTTP endpoint, so inside this folder
Claude Code picks it up automatically once the server is running. From anywhere else:

```bash
claude mcp add --transport http mindflow http://localhost:8787/mcp
```

Then try: *"Use mindflow to create a mind map about launching a podcast."*

### Claude Desktop (stdio)

Add to `claude_desktop_config.json` (adjust the path):

```json
{
  "mcpServers": {
    "mindflow": {
      "command": "npm",
      "args": ["run", "mcp", "--prefix", "/absolute/path/to/this/repo"]
    }
  }
}
```

The stdio server shares the `data/maps` folder with the web server, and the web server
pushes changes to open browser tabs, so edits made from Claude Desktop appear live.

### Any other MCP client

- Streamable HTTP: `POST http://localhost:8787/mcp` (stateless; no session header needed)
- stdio: `npm run mcp`

## How Claude edits a map

`get_mindmap` returns the map as an indented outline where every node ends with a
`{#id}` tag. Tools accept those ids and nested markdown outlines, so Claude can build a
whole branch in one call:

```
add_nodes(mapId, parentId, outline: "- Marketing\n  - Social media\n    > focus on short video\n  - Email")
```

All mutations run through `shared/src/model.ts`, the same code the browser uses, and go
through the versioned store, which broadcasts server-sent events to every open tab.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | Enables the in-app assistant |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model for the assistant |
| `CLAUDE_EFFORT` | `medium` | `low` … `max` reasoning effort |
| `CLAUDE_FALLBACKS` | `on` | Server-side refusal fallbacks (`off` to disable) |
| `PORT` | `8787` | Server port |
| `MINDFLOW_DATA_DIR` | `./data/maps` | Where maps are stored |

## Project layout

```
shared/src/model.ts    tree model, mutations, outline parse/serialise (no deps)
server/src/store.ts    file-backed store with versioning + change events
server/src/tools.ts    tool registry (zod schemas) used by MCP and the assistant
server/src/mcp.ts      MCP server: tools, resources, prompts
server/src/mcp-stdio.ts stdio entry point
server/src/ai.ts       streaming Claude tool loop for the in-app assistant
server/src/index.ts    Express: REST, SSE, /mcp, static client
client/src/            React app (canvas, layout engine, panels, export)
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Server + client with hot reload |
| `npm run build` | Build the client, type-check the server |
| `npm start` | Production server |
| `npm run mcp` | MCP server over stdio |
| `npm run typecheck` | Type-check both packages |
