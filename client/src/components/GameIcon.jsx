export default function GameIcon({ game, size = 64 }) {
  if (game.icon_path) {
    return (
      <img
        src={game.icon_path}
        alt={game.name}
        style={{
          width: size,
          height: size,
          objectFit: 'cover',
          borderRadius: 8,
          display: 'block',
        }}
      />
    );
  }
  return (
    <span style={{ fontSize: size * 0.68, lineHeight: 1 }}>
      {game.icon_emoji || '🎮'}
    </span>
  );
}
