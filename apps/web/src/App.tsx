import { parseRoomCode } from '@take5/protocol';
import { useEffect, useState } from 'react';
import { Home } from './Home';
import { RoomPage } from './RoomPage';

/** Two routes: `/` and `/ABCD`. */
export function App() {
  const [path, setPath] = useState(location.pathname);

  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const navigate = (to: string) => {
    history.pushState(null, '', to);
    setPath(to);
  };

  const code = parseRoomCode(path.slice(1));
  return code ? (
    <RoomPage key={code} code={code} onExit={() => navigate('/')} />
  ) : (
    <Home onEnter={(room) => navigate(`/${room}`)} />
  );
}
