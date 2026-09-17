import { useState } from 'react';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
}

export default function TagInput({ value, onChange, suggestions = [] }: TagInputProps) {
  const [input, setInput] = useState('');

  const add = (raw: string) => {
    const tag = raw.trim().replace(/,/g, '');
    if (!tag) return;
    if (value.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      setInput('');
      return;
    }
    onChange([...value, tag]);
    setInput('');
  };

  const remove = (tag: string) => onChange(value.filter((item) => item !== tag));

  return (
    <div className="tag-input">
      {value.map((tag) => (
        <span className="tag-pill" key={tag}>
          {tag}
          <button type="button" onClick={() => remove(tag)} title="移除标签">
            ✕
          </button>
        </span>
      ))}
      <input
        value={input}
        list="repomarks-tag-suggestions"
        placeholder={value.length === 0 ? '输入标签，回车添加' : ''}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw.endsWith(',') || raw.endsWith('，')) add(raw);
          else setInput(raw);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            add(input);
          } else if (event.key === 'Backspace' && !input && value.length > 0) {
            remove(value[value.length - 1]);
          }
        }}
        onBlur={() => add(input)}
      />
      <datalist id="repomarks-tag-suggestions">
        {suggestions.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
    </div>
  );
}
