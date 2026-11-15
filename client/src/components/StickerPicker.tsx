import { useState } from "react";

export const STICKERS: Record<string, string[]> = {
  Study: ["📚", "📖", "📝", "✏️", "🖊️", "📌", "📎", "🎯", "💡", "🧠", "🔬", "🧪", "📐", "📏", "🧮", "📊", "📈", "🗓️", "⏰", "🎓", "🏆", "🥇", "📒", "🗂️"],
  Marks: ["⭐", "🔥", "❗", "❓", "✅", "❌", "⚠️", "🚩", "🔑", "💯", "➕", "➖", "🔁", "⏳", "🆕", "🔒", "👍", "👎", "👀", "💬", "🔗", "🧩", "🏁", "🎉"],
  Numbers: ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟", "🅰️", "🅱️", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪"],
  Subjects: ["🌍", "🗺️", "🏛️", "⚖️", "💰", "🏦", "📉", "🌱", "🌊", "☀️", "🌧️", "🌡️", "⚡", "🧬", "🦠", "💊", "🩺", "🧲", "⚛️", "🔭", "🚀", "💻", "🤖", "🎨", "🎵", "🗣️", "🇮🇳"],
  People: ["😀", "😎", "🤔", "😴", "😅", "🥳", "🤯", "🙌", "👏", "💪", "🧑‍🎓", "🧑‍🏫", "🧑‍💻", "🧑‍🔬", "👥", "❤️"],
  Food: ["☕", "🍵", "🍎", "🍕", "🍪", "🥤", "🍫", "🍉"],
};

export function StickerPicker({ value, onPick }: { value?: string; onPick: (sticker: string | null) => void }) {
  const [tab, setTab] = useState("Study");
  return (
    <div className="sticker-picker">
      <div className="sticker-tabs">
        {Object.keys(STICKERS).map((k) => (
          <button key={k} type="button" className={k === tab ? "on" : ""} onClick={() => setTab(k)}>
            {k}
          </button>
        ))}
        {value && (
          <button type="button" className="remove" onClick={() => onPick(null)}>
            Remove
          </button>
        )}
      </div>
      <div className="sticker-grid">
        {STICKERS[tab].map((s) => (
          <button key={s} type="button" className={s === value ? "on" : ""} onClick={() => onPick(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
