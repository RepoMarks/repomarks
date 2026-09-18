interface HighlightProps {
  text: string;
  terms?: string[];
}

export default function Highlight({ text, terms }: HighlightProps) {
  const cleaned = (terms ?? []).map((term) => term.trim()).filter(Boolean);
  if (cleaned.length === 0) return <>{text}</>;
  const pattern = new RegExp(
    `(${cleaned.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi'
  );
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, index) =>
        cleaned.some((term) => term.toLowerCase() === part.toLowerCase()) ? (
          <mark key={index}>{part}</mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
}
