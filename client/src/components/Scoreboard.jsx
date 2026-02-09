import { useGame } from '../context/GameContext';
import './Scoreboard.css';

export default function Scoreboard({ expanded, onToggle }) {
  const { gameState } = useGame();

  if (!gameState) return null;

  const isTeamMode = gameState.gameMode === 'teams';

  return (
    <div className={`scoreboard ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="scoreboard-header" onClick={onToggle}>
        <h3>📊 Scoreboard</h3>
        <span className="toggle-icon">{expanded ? '▼' : '▲'}</span>
      </div>

      {expanded && (
        <div className="scoreboard-content">
          {isTeamMode ? (
            <TeamScoreboard gameState={gameState} />
          ) : (
            <IndividualScoreboard gameState={gameState} />
          )}
        </div>
      )}
    </div>
  );
}

function IndividualScoreboard({ gameState }) {
  const sorted = [...gameState.playerOrder].sort(
    (a, b) => (gameState.scores[b] || 0) - (gameState.scores[a] || 0)
  );

  return (
    <div className="score-table-wrapper">
      <table className="score-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Total</th>
            {gameState.roundHistory[gameState.playerOrder[0]]?.map((_, i) => (
              <th key={i}>R{i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(player => (
            <tr key={player} className={player === gameState.myName ? 'my-row' : ''}>
              <td className="player-name-cell">{player}</td>
              <td className="total-cell">{gameState.scores[player] || 0}</td>
              {gameState.roundHistory[player]?.map((rh, i) => (
                <td key={i} className={`round-cell ${rh.penaltyApplied ? 'penalty' : ''} ${rh.roundScore >= 0 ? 'positive' : 'negative'}`}>
                  <div className="round-detail">
                    <span className="round-score">{rh.roundScore >= 0 ? '+' : ''}{rh.roundScore}</span>
                    <span className="round-bid-info">B:{rh.bid} W:{rh.tricks}</span>
                    {rh.isNil && <span className="nil-badge">NIL</span>}
                    {rh.penaltyApplied && <span className="penalty-badge">-55!</span>}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamScoreboard({ gameState }) {
  if (!gameState.teams || !gameState.teamScores) return null;

  const teamNames = Object.keys(gameState.teams);

  return (
    <div className="score-table-wrapper">
      <table className="score-table">
        <thead>
          <tr>
            <th>Team</th>
            <th>Total</th>
            {gameState.teamRoundHistory[teamNames[0]]?.map((_, i) => (
              <th key={i}>R{i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teamNames.map(team => (
            <tr key={team}>
              <td className="player-name-cell">
                {team}
                <div className="team-members">{gameState.teams[team].join(', ')}</div>
              </td>
              <td className="total-cell">{gameState.teamScores[team] || 0}</td>
              {gameState.teamRoundHistory[team]?.map((rh, i) => (
                <td key={i} className={`round-cell ${rh.penaltyApplied ? 'penalty' : ''} ${rh.roundScore >= 0 ? 'positive' : 'negative'}`}>
                  <div className="round-detail">
                    <span className="round-score">{rh.roundScore >= 0 ? '+' : ''}{rh.roundScore}</span>
                    {rh.penaltyApplied && <span className="penalty-badge">-55!</span>}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className="individual-header">Individual Scores</h4>
      <table className="score-table individual">
        <thead>
          <tr>
            <th>Player</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {gameState.playerOrder.map(player => (
            <tr key={player} className={player === gameState.myName ? 'my-row' : ''}>
              <td>{player}</td>
              <td>{gameState.scores[player] || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
