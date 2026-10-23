import { parseRoomCode, type CreateRoomResponse } from '@take5/protocol';
import { useState, type FormEvent } from 'react';
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
      onEnter(((await response.json()) as CreateRoomResponse).code);
    } catch {
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
      <h1>{t.appName}</h1>
      <p>{t.tagline}</p>
      <button className="primary" onClick={create} disabled={creating}>
        {creating ? t.creating : t.createRoom}
      </button>
      <form onSubmit={join} className="row">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t.roomCodePlaceholder}
          maxLength={4}
          autoCapitalize="characters"
          aria-label={t.roomCodePlaceholder}
        />
        <button type="submit">{t.joinRoom}</button>
      </form>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
