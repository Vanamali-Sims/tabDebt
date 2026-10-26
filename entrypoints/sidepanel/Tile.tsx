import { useState } from 'react';
import { hostOf } from '@/src/lib/format';
import type { TabRecord } from '@/src/lib/types';

/** Sites whose logos are dark and vanish on a dark tile. */
const DARK_LOGO_HOSTS = ['github.com', 'openrouter.ai', 'x.com', 'twitter.com', 'notion.so', 'vercel.com', 'openai.com', 'chatgpt.com', 'cursor.com', 'perplexity.ai'];
const LETTER_COLOURS = ['#d9a35b', '#7fb08a', '#c4705a', '#8aa6c9', '#b48ac9', '#c9b98a'];

const colourFor = (host: string) => LETTER_COLOURS[[...host].reduce((n, c) => n + c.charCodeAt(0), 0) % LETTER_COLOURS.length]!;

/** A 28px site tile: the favicon, or the domain's first letter when there isn't one. */
export function Tile({ tab }: { tab: Pick<TabRecord, 'url' | 'favIconUrl'> }) {
  const [failed, setFailed] = useState(false);
  const host = hostOf(tab.url);
  const light = DARK_LOGO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  const showImg = !!tab.favIconUrl?.startsWith('http') && !failed;
  return (
    <span className={light ? 'tile tile-light' : 'tile'} aria-hidden="true">
      {showImg ? (
        <img src={tab.favIconUrl} alt="" width={16} height={16} onError={() => setFailed(true)} />
      ) : (
        <span className="tile-letter" style={{ color: colourFor(host) }}>{(host.charAt(0) || '?').toUpperCase()}</span>
      )}
    </span>
  );
}
