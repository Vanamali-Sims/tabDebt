import { useId, useState } from 'react';
import { completeLastWord } from '@/src/lib/suggest';

interface Props {
  value: string;
  onChange: (value: string) => void;
  vocabulary: string[];
  placeholder?: string;
  label: string;
  type?: 'text' | 'search';
}

/**
 * A text input that shows the rest of the word in grey. Tab or the right arrow accepts it; anything
 * else just keeps typing. The ghost text is decoration: screen readers get a one-line hint instead.
 */
export function Autocomplete({ value, onChange, vocabulary, placeholder, label, type = 'text' }: Props) {
  const [focused, setFocused] = useState(false);
  const hintId = useId();
  const suggestion = focused ? completeLastWord(value, vocabulary) : null;
  const rest = suggestion ? suggestion.slice(value.length) : '';

  const accept = () => {
    if (suggestion) onChange(suggestion);
  };

  return (
    <span className="ac">
      <span className="ac-ghost" aria-hidden="true">
        <span className="ac-typed">{value}</span>
        <span className="ac-rest">{rest}</span>
      </span>
      <input
        className="ac-input"
        type={type}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        aria-describedby={suggestion ? hintId : undefined}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          const atEnd = e.currentTarget.selectionStart === value.length && e.currentTarget.selectionEnd === value.length;
          if (suggestion && (e.key === 'Tab' || (e.key === 'ArrowRight' && atEnd)) && !e.shiftKey) {
            e.preventDefault();
            accept();
          }
        }}
      />
      {suggestion && (
        <>
          <kbd className="ac-key" aria-hidden="true">Tab</kbd>
          <span id={hintId} className="sr-only">Suggestion: {suggestion}. Press Tab to accept.</span>
        </>
      )}
    </span>
  );
}
