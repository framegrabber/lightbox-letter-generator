import { useParameters } from "../state/parameters";

export function TextInput() {
  const text = useParameters((s) => s.text);
  const set = useParameters((s) => s.set);
  return (
    <div className="text-input">
      <label htmlFor="text">Text</label>
      <textarea
        id="text"
        rows={2}
        value={text}
        onChange={(e) => set({ text: e.target.value })}
        placeholder="Type a word…"
        spellCheck={false}
      />
    </div>
  );
}
