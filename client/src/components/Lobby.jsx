import { useState } from 'react';
import { useGame } from '../context/GameContext';
import './Lobby.css';

export default function Lobby() {
  const {
    roomCode, roomState, playerName, error,
    toggleReady, setGameMode, assignTeam, updateTeams, startGame, leaveRoom
  } = useGame();

  const isHost = roomState?.hostId === undefined ? false :
    roomState.players.find(p => p.name === playerName)?.id === roomState.hostId;

  const allReady = roomState?.players?.every(p => p.ready) && roomState?.players?.length >= 2;
  const canStartGame = isHost && allReady && (
    roomState.gameMode === 'individual' ||
    (roomState.gameMode === 'teams' && validateTeams())
  );

  function validateTeams() {
    if (!roomState.teams) return false;
    const assigned = Object.values(roomState.teams).flat();
    const allAssigned = roomState.players.every(p => assigned.includes(p.name));
    const evenPlayers = roomState.players.length % 2 === 0;
    const allTeamsHaveMembers = Object.values(roomState.teams).every(t => t.length > 0);
    return allAssigned && evenPlayers && allTeamsHaveMembers;
  }

  const teamNames = roomState?.teams ? Object.keys(roomState.teams) : [];

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
  };

  return (
    <div className="lobby">
      <div className="lobby-header">
        <h1>♠ Game Lobby</h1>
        <button className="btn btn-ghost" onClick={leaveRoom}>Leave</button>
      </div>

      <div className="room-code-section">
        <p className="room-code-label">Room Code</p>
        <div className="room-code-display" onClick={copyRoomCode} title="Click to copy">
          <span className="room-code">{roomCode}</span>
          <span className="copy-icon">📋</span>
        </div>
        <p className="room-code-hint">Share this code with your family!</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      {isHost && (
        <div className="game-mode-section">
          <h3>Game Mode</h3>
          <div className="mode-toggle">
            <button
              className={`btn ${roomState.gameMode === 'individual' ? 'btn-active' : 'btn-outline'}`}
              onClick={() => setGameMode('individual')}
            >
              Individual
            </button>
            <button
              className={`btn ${roomState.gameMode === 'teams' ? 'btn-active' : 'btn-outline'}`}
              onClick={() => setGameMode('teams')}
              disabled={roomState.players.length % 2 !== 0}
            >
              Teams
            </button>
          </div>
          {roomState.players.length % 2 !== 0 && roomState.gameMode !== 'teams' && (
            <p className="hint">Teams require an even number of players</p>
          )}
        </div>
      )}

      {!isHost && (
        <div className="game-mode-section">
          <h3>Game Mode: <span className="mode-badge">{roomState?.gameMode === 'teams' ? 'Teams' : 'Individual'}</span></h3>
        </div>
      )}

      <div className="players-section">
        <h3>Players ({roomState?.players?.length || 0}/8)</h3>
        <div className="player-list">
          {roomState?.players?.map((player) => (
            <div key={player.id} className={`player-card ${player.ready ? 'ready' : ''}`}>
              <div className="player-info">
                <span className="player-name">
                  {player.name}
                  {player.id === roomState.hostId && <span className="host-badge">HOST</span>}
                </span>
                <span className={`ready-status ${player.ready ? 'is-ready' : ''}`}>
                  {player.ready ? '✓ Ready' : 'Not Ready'}
                </span>
              </div>
              {roomState.gameMode === 'teams' && isHost && roomState.teams && (
                <div className="team-assign">
                  {teamNames.map(team => (
                    <button
                      key={team}
                      className={`btn btn-sm ${roomState.teams[team]?.includes(player.name) ? 'btn-active' : 'btn-outline'}`}
                      onClick={() => assignTeam(player.name, team)}
                    >
                      {team}
                    </button>
                  ))}
                </div>
              )}
              {roomState.gameMode === 'teams' && !isHost && roomState.teams && (
                <div className="team-badge">
                  {teamNames.find(t => roomState.teams[t]?.includes(player.name)) || 'Unassigned'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {roomState?.gameMode === 'teams' && isHost && (
        <div className="teams-config">
          <h3>Number of Teams</h3>
          <div className="team-count-selector">
            {[2, 3, 4].map(n => (
              <button
                key={n}
                className={`btn btn-sm ${teamNames.length === n ? 'btn-active' : 'btn-outline'}`}
                onClick={() => updateTeams(n)}
                disabled={roomState.players.length < n * 2}
              >
                {n} Teams
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="lobby-actions">
        <button
          className={`btn btn-lg ${roomState?.players?.find(p => p.name === playerName)?.ready ? 'btn-ready' : 'btn-primary'}`}
          onClick={toggleReady}
        >
          {roomState?.players?.find(p => p.name === playerName)?.ready ? '✓ Ready!' : 'Ready Up'}
        </button>

        {isHost && (
          <button
            className="btn btn-lg btn-start"
            onClick={startGame}
            disabled={!canStartGame}
          >
            {canStartGame ? 'Start Game!' : 'Waiting for players...'}
          </button>
        )}
      </div>
    </div>
  );
}
