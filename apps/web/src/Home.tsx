import { parseRoomCode, type CreateRoomResponse } from '@take5/protocol';
import { useState, type FormEvent } from 'react';
import { track } from './analytics';
import { CardFace } from './Card';
import { t } from './strings';

export function Home({ onEnter }: { onEnter: (code: string) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/rooms', { method: 'POST' });
      if (!response.ok) throw new Error(String(response.status));
      const { code } = (await response.json()) as CreateRoomResponse;
      track('room_created', { room_code: code });
      onEnter(code);
    } catch (error) {
      track('room_create_failed', { error: String(error) });
      setError(t.createFailed);
      setCreating(false);
    }
  };

  const join = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseRoomCode(code);
    if (parsed) onEnter(parsed);
    else setError(t.invalidCode);
  };

  return (
    <main className="home">
      <div className="hero-cards" aria-hidden="true">
        {[7, 55, 30, 104].map((card) => (
          <CardFace key={card} card={card} />
        ))}
      </div>
      <h1 className="title">{t.appName}</h1>
      <p className="tagline">{t.tagline}</p>
      <p className="muted">{t.homeHow}</p>
      <button className="primary big-button" onClick={create} disabled={creating}>
        {creating ? t.creating : t.createRoom}
      </button>
      <p className="divider muted">{t.or}</p>
      <form onSubmit={join} className="row join-form">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t.roomCodePlaceholder}
          maxLength={4}
          autoCapitalize="characters"
          autoComplete="off"
          aria-label={t.roomCodePlaceholder}
        />
        <button type="submit">{t.joinRoom}</button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
