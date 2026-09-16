const CELLS = 20;

type ScoreBarProps = {
  /** Side a's share of total backing, 0–1. `null` when there is no backing at all. */
  share: number | null;
  labelA: string;
  labelB: string;
};

/**
 * The segmented score bar: solid cells for side a, hatched cells for side b.
 *
 * The cell straddling the boundary is filled proportionally, so the bar stays
 * exact rather than snapping to twentieths.
 */
export function ScoreBar({share, labelA, labelB}: ScoreBarProps) {
  if (share === null) {
    return (
      <div className="bar bar--empty" role="img" aria-label="no backing recorded">
        {Array.from({length: CELLS}, (_, index) => (
          <div key={index} className="bar__cell" />
        ))}
      </div>
    );
  }

  const filledCells = share * CELLS;

  return (
    <div
      className="bar"
      role="img"
      aria-label={`${labelA} ${Math.round(share * 100)}%, ${labelB} ${100 - Math.round(share * 100)}%`}
    >
      {Array.from({length: CELLS}, (_, index) => {
        const coverage = Math.min(Math.max(filledCells - index, 0), 1);

        if (coverage >= 1) return <div key={index} className="bar__cell bar__cell--filled" />;
        if (coverage <= 0) return <div key={index} className="bar__cell" />;

        // partial cell: solid up to the boundary, hatched after it
        const percent = `${(coverage * 100).toFixed(2)}%`;
        return (
          <div
            key={index}
            className="bar__cell bar__cell--partial"
            style={{
              backgroundImage: `linear-gradient(to right, var(--ink) 0 ${percent}, transparent ${percent} 100%), repeating-linear-gradient(0deg, var(--ink-40) 0 0.5px, transparent 0.5px 3px), repeating-linear-gradient(90deg, var(--ink-40) 0 0.5px, transparent 0.5px 3px)`,
            }}
          />
        );
      })}
    </div>
  );
}
