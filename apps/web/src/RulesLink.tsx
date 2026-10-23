import { t } from './strings';

/** The rules of 6 nimmt! on Wikipedia, in a new tab so a Game in progress stays open. */
export function RulesLink({ className }: { className: string }) {
  return (
    <a
      className={className}
      href={t.rulesUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.rulesLabel}
    >
      {t.rules}
    </a>
  );
}
