import { GameProvider, useGame } from './context/GameContext';
import Home from './components/Home';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import './App.css';

function AppContent() {
  const { screen } = useGame();

  switch (screen) {
    case 'lobby':
      return <Lobby />;
    case 'game':
      return <GameBoard />;
    default:
      return <Home />;
  }
}

function App() {
  return (
    <GameProvider>
      <div className="app">
        <AppContent />
      </div>
    </GameProvider>
  );
}

export default App;
