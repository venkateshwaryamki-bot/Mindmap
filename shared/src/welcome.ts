import { type MindMap, createMap } from "./model.ts";

/** The map a new install starts with. */
export function welcomeMap(): MindMap {
  return createMap("Welcome to MindFlow", {}, [
    {
      text: "Editing",
      children: [
        { text: "Tab or ＋Child adds a child" },
        { text: "Enter or Sibling adds a sibling" },
        { text: "Double-click / double-tap to rename" },
        { text: "Drag (or press and hold) to move a node" },
        { text: "Undo and redo anytime" },
      ],
    },
    {
      text: "Views",
      children: [
        { text: "Mind map, logic chart, org chart" },
        { text: "Pan by dragging, pinch or Ctrl+scroll to zoom" },
        { text: "Collapse branches with the dot" },
      ],
    },
    {
      text: "Claude assistant",
      marker: "✨",
      children: [
        { text: "Open Claude and ask it to build a map" },
        { text: "Select a node and ask to expand it" },
        { text: "Ask for a critique or summary" },
      ],
    },
    {
      text: "Your maps",
      marker: "💾",
      children: [
        { text: "Saved automatically" },
        { text: "Export as image, outline or backup" },
      ],
    },
  ]);
}
