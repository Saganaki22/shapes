import { memo, useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { thumbnail } from './engine';
import type { Category, PatternDefinition } from './patterns/model';
import { referenceNames } from './patterns/referenceNames';

const thumbnailSources = new Map<string, string>();

function Thumbnail({ pattern }: { pattern: PatternDefinition }) {
  const frame = useRef<HTMLSpanElement>(null);
  const [source, setSource] = useState(() => thumbnailSources.get(pattern.id));
  useEffect(() => {
    if (source || !frame.current) return;
    function load() {
      const uri = thumbnailSources.get(pattern.id) ?? thumbnail(pattern);
      thumbnailSources.set(pattern.id, uri);
      setSource(uri);
    }
    if (!('IntersectionObserver' in window)) {
      load();
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        load();
        observer.disconnect();
      }
    }, { rootMargin: '120px' });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [pattern, source]);
  return <span ref={frame} className="thumbnail">{source && <img src={source} alt="" decoding="async" />}</span>;
}

export const PatternLibrary = memo(function PatternLibrary({ patterns, selected, onSelect, active }: {
  patterns: PatternDefinition[];
  selected: string;
  onSelect: (pattern: PatternDefinition) => void;
  active: boolean;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const categories = [...new Set(patterns.map((pattern) => pattern.category))].sort();
  const search = query.trim().toLowerCase();
  const visible = patterns.filter((pattern) => (!category || pattern.category === category) &&
    `${pattern.name} ${referenceNames[pattern.id] ?? ''} ${pattern.category} ${pattern.description}`.toLowerCase().includes(search));
  return <aside className="pattern-library" aria-label="Pattern library" data-active={active}>
    <div className="library-head">
      <div className="library-title"><h2>Patterns</h2><span aria-label={`${visible.length} patterns`}>{visible.length}</span></div>
      <label className="search">
        <Search size={17} aria-hidden="true" />
        <input type="search" placeholder="Search patterns" aria-label="Search patterns" value={query}
          onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className="select-wrap category-select">
        <select aria-label="Pattern category" value={category} onChange={(event) => setCategory(event.target.value as Category | '')}>
          <option value="">All categories</option>
          {categories.map((item) => <option key={item}>{item}</option>)}
        </select>
        <ChevronDown size={15} aria-hidden="true" />
      </div>
    </div>
    <div className="pattern-scroll">
      {visible.length === 0 && <p className="empty-state">No matching patterns.</p>}
      <div className="pattern-grid">
        {visible.map((pattern) => {
          const reference = referenceNames[pattern.id];
          const match = search && reference !== pattern.name && reference?.toLowerCase().includes(search);
          return <button type="button" key={pattern.id} className="pattern-card" aria-pressed={pattern.id === selected}
            onClick={() => onSelect(pattern)} title={pattern.name}>
            <Thumbnail pattern={pattern} />
            <span className="pattern-card-name">{pattern.name}</span>
            {match && <span className="pattern-card-reference">{reference}</span>}
          </button>;
        })}
      </div>
    </div>
  </aside>;
});
