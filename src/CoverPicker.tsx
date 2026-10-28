import { useState } from "react";
import type { Entity, Trip } from "./model";
import { save } from "./store";
import { covers, getCover, suggestCovers } from "./covers";
import CoverPhoto from "./CoverPhoto";
import { Button, Field, Notice, useAsyncAction } from "./ui";
export default function CoverPicker({
  entity,
  onDone,
}: {
  entity: Entity<Trip>;
  onDone: () => void;
}) {
  const [choice, setChoice] = useState(
    entity.data.cover || { id: "tokyo", position: 50 },
  );
  const [query, setQuery] = useState(
    `${entity.data.title} ${entity.data.destinations}`,
  );
  const [category, setCategory] = useState("All");
  const a = useAsyncAction();
  const suggestions = suggestCovers(query),
    selected = getCover(choice.id);
  const suggestedIds = new Set(suggestions.map((c) => c.id));
  const visible = covers.filter(
    (c) =>
      (category === "All" || c.category === category) &&
      !suggestedIds.has(c.id),
  );
  function tile(c: (typeof covers)[number]) {
    return (
      <button
        type="button"
        className="cover-option"
        key={c.id}
        aria-label={`Choose ${c.name}`}
        aria-pressed={choice.id === c.id}
        onClick={() => setChoice({ id: c.id, position: 50 })}
      >
        <CoverPhoto
          key={c.id}
          cover={c}
          thumbnail
          className="cover-thumbnail"
        />
        <span>
          {c.name}
          {choice.id === c.id && <b aria-hidden="true"> ✓</b>}
        </span>
      </button>
    );
  }
  return (
    <div className="cover-picker">
      <div
        className="cover-preview"
        aria-label={`Cover preview: ${selected.name}`}
      >
        <CoverPhoto
          key={choice.id}
          cover={selected}
          position={choice.position}
          className="cover-preview-image"
        />
        <div className="hero-overlay" />
        <div className="cover-preview-title">
          <small>YOUR NEXT CHAPTER</small>
          <h3>{entity.data.title}</h3>
          <span>{entity.data.destinations}</span>
        </div>
      </div>
      <Field label="Photo framing">
        <input
          type="range"
          min="0"
          max="100"
          value={choice.position}
          onChange={(e) =>
            setChoice({ ...choice, position: Number(e.target.value) })
          }
        />
      </Field>
      <small className="cover-hint">
        Move the slider to adjust which part of the photo appears in the banner.
      </small>
      <Field label="Find a cover">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try NYC, mountains, beach…"
        />
      </Field>
      <p className="cover-hint">
        Suggestions match your words to this curated collection. Your trip name
        is never sent to a photo service.
      </p>
      {!!suggestions.length && (
        <>
          <h3>Suggested for your trip</h3>
          <div className="cover-grid">{suggestions.map(tile)}</div>
        </>
      )}
      {!suggestions.length && query.trim() && (
        <p className="cover-hint">
          No specific match yet. Choose a landscape or city below.
        </p>
      )}
      <div className="segmented cover-categories" aria-label="Cover categories">
        {["All", "Cities", "Nature"].map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            className={category === c ? "active" : ""}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="cover-grid">{visible.map(tile)}</div>
      <p className="cover-hint">
        Photos from{" "}
        <a href="https://unsplash.com" target="_blank" rel="noreferrer">
          Unsplash
        </a>
        . Photos need internet; a matching color background appears if
        unavailable. Your choice can be saved offline.
      </p>
      {a.error && <Notice tone="error">{a.error}</Notice>}
      <div className="dialog-actions">
        <Button onClick={onDone} disabled={a.busy}>
          Cancel
        </Button>
        <Button
          className="primary"
          disabled={a.busy}
          onClick={() =>
            a.run(async () => {
              await save({
                ...entity,
                data: { ...entity.data, cover: choice },
              });
              onDone();
            })
          }
        >
          {a.busy ? "Saving…" : "Save cover"}
        </Button>
      </div>
    </div>
  );
}
