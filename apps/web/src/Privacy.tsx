import { useState } from 'react';
import { analyticsOn, browserObjects, localServer, setAnalyticsOn } from './analytics';
import { t, tPrivacy } from './strings';

export function Privacy({ onHome }: { onHome: () => void }) {
  return (
    <main className="privacy stack">
      <h1 className="title">{tPrivacy.title}</h1>
      <p className="muted small">{tPrivacy.updated}</p>
      <p>{tPrivacy.intro}</p>

      <h2>{tPrivacy.controllerHeading}</h2>
      <p>
        {tPrivacy.controller} <Email />
      </p>

      {tPrivacy.sections.map((section) => (
        <section key={section.heading} className="stack">
          <h2>{section.heading}</h2>
          {section.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </section>
      ))}

      <h2>{tPrivacy.statsHeading}</h2>
      <StatsSwitch />

      <h2>{tPrivacy.rightsHeading}</h2>
      <p>
        {tPrivacy.rights} <Email />
      </p>

      <button onClick={onHome}>{t.backHome}</button>
    </main>
  );
}

function Email() {
  return <a href={`mailto:${tPrivacy.contactEmail}`}>{tPrivacy.contactEmail}</a>;
}

function StatsSwitch() {
  const [on, setOn] = useState(analyticsOn);
  if (localServer) return <p className="muted">{tPrivacy.statsLocalOff}</p>;
  if (browserObjects()) return <p className="muted">{tPrivacy.statsBrowserOff}</p>;
  return (
    <label className="row">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          setAnalyticsOn(e.target.checked);
          setOn(e.target.checked);
        }}
      />
      {tPrivacy.statsOn}
    </label>
  );
}
