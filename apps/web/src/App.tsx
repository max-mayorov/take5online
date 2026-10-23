import { parseRoomCode } from '@take5/protocol';
import { useEffect, useState } from 'react';
import { Sprites } from './Card';
import { Home } from './Home';
import { Privacy } from './Privacy';
import { RoomPage } from './RoomPage';
import { unlockAudio } from './sound';

/** Three routes: `/`, `/ABCD` and `/privacy`. */
export function App() {
  const [path, setPath] = useState(location.pathname);

  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener('popstate', onPop);
    addEventListener('pointerdown', unlockAudio);
    addEventListener('keydown', unlockAudio);
    return () => {
      removeEventListener('popstate', onPop);
      removeEventListener('pointerdown', unlockAudio);
      removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const navigate = (to: string) => {
    history.pushState(null, '', to);
    setPath(to);
  };

  const code = parseRoomCode(path.slice(1));
  return (
    <>
      <Sprites />
      {code ? (
        <RoomPage key={code} code={code} onExit={() => navigate('/')} />
      ) : path === '/privacy' ? (
        <Privacy onHome={() => navigate('/')} />
      ) : (
        <Home onEnter={(room) => navigate(`/${room}`)} onPrivacy={() => navigate('/privacy')} />
      )}
    </>
  );
}
