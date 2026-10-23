import { ROW_LIMIT, sumBullHeads } from '@take5/engine';
import { BullIcon, CardFace } from './Card';
import type { TableState } from './reveal';
import { t } from './strings';

interface Props {
  table: TableState;
  /** Whether the viewer must choose a Row to Take right now. */
  choosable: boolean;
  onChoose: (row: number) => void;
}

/** The four Rows. Each has five Card slots plus an end slot for its Bull-heads or a Sixth Card. */
export function Board({ table, choosable, onChoose }: Props) {
  return (
    <div className={`board ${choosable ? 'choosing' : ''}`}>
      {table.board.map((row, i) => {
        const total = sumBullHeads(row);
        const taking = table.taking?.row === i ? table.taking : null;
        return (
          <button
            key={i}
            className={`board-row ${choosable ? 'choosable' : ''} ${taking ? 'taking' : ''}`}
            data-row={i}
            disabled={!choosable}
            onClick={() => onChoose(i)}
            aria-label={choosable ? t.takeRowLabel(i, total) : t.rowLabel(i)}
          >
            {Array.from({ length: ROW_LIMIT }, (_, slot) => {
              const card = row[slot];
              const placed = card !== undefined && table.placed?.card === card;
              return (
                <span key={slot} className="slot">
                  {card !== undefined && (
                    <CardFace key={card} card={card} className={placed ? 'just-placed' : ''} />
                  )}
                </span>
              );
            })}
            <span className="slot row-end">
              {taking ? (
                <CardFace card={taking.card} className="incoming" />
              ) : (
                <span className="row-total">
                  <BullIcon />
                  {total}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
