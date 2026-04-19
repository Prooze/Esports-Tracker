import { useState, useEffect, useCallback, useRef, Component } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import GameIcon from '../components/GameIcon';
import { apiBase, resolveImageUrl } from '../lib/api';
import { SOCIAL_PLATFORMS, SocialIcon } from '../lib/socialIcons';

// ─── Error boundary ───────────────────────────────────────────────────────────
class AdminErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <main className="container admin-container">
          <h1 className="admin-title">ADMIN DASHBOARD</h1>
          <div className="error-msg" style={{ margin: '24px 0' }}>
            <strong>Something went wrong loading the admin panel.</strong>
            <br /><br />
            {String(this.state.error.message || this.state.error)}
            <br /><br />
            <button className="btn-ghost small" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

// ─── start.gg import form ─────────────────────────────────────────────────────
function StartggImportForm({ games, onImported, authHeaders }) {
  const [url, setUrl] = useState('');
  const [fetchLoading, setFetchLoading] = useState(false);
  const [tournament, setTournament] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [selectedGame, setSelectedGame] = useState('');
  const [date, setDate] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFetch = async () => {
    setError('');
    setSuccess('');
    setTournament(null);
    setSelectedEvent('');
    setFetchLoading(true);

    try {
      const res = await fetch(`${apiBase}/api/admin/startgg/lookup`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTournament(data);
      if (data.startAt) {
        setDate(new Date(data.startAt * 1000).toISOString().split('T')[0]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setFetchLoading(false);
    }
  };

  const handleImport = async () => {
    if (!selectedEvent || !selectedGame) {
      setError('Select an event and a game before importing.');
      return;
    }

    setError('');
    setSuccess('');
    setImportLoading(true);

    const event = tournament.events.find((e) => String(e.id) === selectedEvent);

    try {
      const res = await fetch(`${apiBase}/api/admin/startgg/import`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          eventId: event.id,
          eventName: event.name,
          tournamentName: tournament.name,
          gameId: selectedGame,
          date,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccess(`Imported ${data.count} players from "${data.tournament.name} — ${event.name}"`);
      setUrl('');
      setTournament(null);
      setSelectedEvent('');
      setSelectedGame('');
      onImported();
    } catch (err) {
      setError(err.message);
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="card">
      <h3 className="card-title">Import from start.gg</h3>

      <div className="form-row">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.start.gg/tournament/my-tournament"
          onKeyDown={(e) => e.key === 'Enter' && url && handleFetch()}
          style={{ flex: 1 }}
        />
        <button
          onClick={handleFetch}
          disabled={fetchLoading || !url}
          className="btn-secondary"
        >
          {fetchLoading ? 'Fetching…' : 'Fetch'}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      {tournament && (
        <div className="import-details">
          <div className="found-badge">
            Found: <strong>{tournament.name}</strong>
            <span className="dim"> · {tournament.events.length} event(s)</span>
          </div>

          <div className="form-row" style={{ flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '2 1 220px' }}>
              <label>Event</label>
              <select
                value={selectedEvent}
                onChange={(e) => setSelectedEvent(e.target.value)}
              >
                <option value="">Select event…</option>
                {tournament.events.map((ev) => (
                  <option key={ev.id} value={String(ev.id)}>
                    {ev.name} ({ev.numEntrants ?? '?'} entrants)
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ flex: '2 1 180px' }}>
              <label>Game</label>
              <select
                value={selectedGame}
                onChange={(e) => setSelectedGame(e.target.value)}
              >
                <option value="">Select game…</option>
                {games.map((g) => (
                  <option key={g.id} value={String(g.id)}>
                    {g.icon_emoji} {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ flex: '1 1 140px' }}>
              <label>Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <button
            onClick={handleImport}
            disabled={importLoading}
            className="btn-primary"
          >
            {importLoading ? 'Importing…' : 'Import Top 64 Standings'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Tournaments tab ──────────────────────────────────────────────────────────
function TournamentsTab({ tournaments, games, authHeaders, onRefresh }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('manage_tournaments');
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState({ name: '', event_name: '', game_id: '', date: '' });
  const [manualError, setManualError] = useState('');
  const [filterGame, setFilterGame] = useState('');
  const [filterYear, setFilterYear] = useState('');

  // Years present in the game-filtered subset so the year dropdown stays relevant
  const gameFiltered = filterGame
    ? tournaments.filter((t) => String(t.game_id) === filterGame)
    : tournaments;

  const availableYears = Array.from(
    new Set(
      gameFiltered
        .map((t) => t.date?.slice(0, 4))
        .filter(Boolean)
    )
  ).sort((a, b) => b - a);

  // If the selected year disappeared after a game change, reset it
  const effectiveYear = availableYears.includes(filterYear) ? filterYear : '';

  const filtered = gameFiltered.filter(
    (t) => !effectiveYear || t.date?.slice(0, 4) === effectiveYear
  );

  const handleGameFilterChange = (val) => {
    setFilterGame(val);
    setFilterYear(''); // year options may change; reset to avoid stale selection
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this tournament and all its standings?')) return;
    await fetch(`${apiBase}/api/admin/tournaments/${id}`, { method: 'DELETE', headers: authHeaders });
    onRefresh();
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditData({
      name: t.name,
      event_name: t.event_name || '',
      game_id: String(t.game_id),
      date: t.date || '',
    });
  };

  const saveEdit = async () => {
    await fetch(`${apiBase}/api/admin/tournaments/${editingId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify(editData),
    });
    setEditingId(null);
    onRefresh();
  };

  const handleManualAdd = async (e) => {
    e.preventDefault();
    setManualError('');
    const res = await fetch(`${apiBase}/api/admin/tournaments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(manualForm),
    });
    const data = await res.json();
    if (!res.ok) { setManualError(data.error); return; }
    setManualForm({ name: '', event_name: '', game_id: '', date: '' });
    setShowManual(false);
    onRefresh();
  };

  const isFiltered = filterGame !== '' || effectiveYear !== '';

  return (
    <div className="tab-content">
      {canManage && <StartggImportForm games={games} onImported={onRefresh} authHeaders={authHeaders} />}

      {canManage && <hr className="divider" />}

      <div className="section-head">
        <h3 className="card-title" style={{ marginBottom: 0 }}>
          Tournaments{' '}
          <span className="dim">
            {isFiltered
              ? `(Showing ${filtered.length} of ${tournaments.length})`
              : `(${tournaments.length})`}
          </span>
        </h3>
        {canManage && (
          <button className="btn-ghost small" onClick={() => setShowManual((v) => !v)}>
            {showManual ? '− Cancel' : '+ Add Manually'}
          </button>
        )}
      </div>

      {tournaments.length > 0 && (
        <div className="form-row" style={{ flexWrap: 'wrap', marginBottom: 4 }}>
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label>Game</label>
            <select value={filterGame} onChange={(e) => handleGameFilterChange(e.target.value)}>
              <option value="">All Games</option>
              {games.map((g) => (
                <option key={g.id} value={String(g.id)}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 140px' }}>
            <label>Year</label>
            <select value={effectiveYear} onChange={(e) => setFilterYear(e.target.value)}>
              <option value="">All Years</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          {isFiltered && (
            <div className="form-group" style={{ justifyContent: 'flex-end' }}>
              <button
                className="btn-ghost small"
                onClick={() => { setFilterGame(''); setFilterYear(''); }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {canManage && showManual && (
        <form onSubmit={handleManualAdd} className="card">
          <div className="form-row" style={{ flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '2 1 200px' }}>
              <label>Tournament Name *</label>
              <input
                value={manualForm.name}
                onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group" style={{ flex: '2 1 160px' }}>
              <label>Event Name</label>
              <input
                value={manualForm.event_name}
                onChange={(e) => setManualForm({ ...manualForm, event_name: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ flex: '1 1 160px' }}>
              <label>Game *</label>
              <select
                value={manualForm.game_id}
                onChange={(e) => setManualForm({ ...manualForm, game_id: e.target.value })}
                required
              >
                <option value="">Select…</option>
                {games.map((g) => (
                  <option key={g.id} value={String(g.id)}>
                    {g.icon_emoji} {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: '1 1 140px' }}>
              <label>Date</label>
              <input
                type="date"
                value={manualForm.date}
                onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
              />
            </div>
          </div>
          {manualError && <div className="error-msg">{manualError}</div>}
          <button type="submit" className="btn-primary">Add Tournament</button>
        </form>
      )}

      <div className="list">
        {tournaments.length === 0 ? (
          <div className="empty-state">No tournaments yet. Import from start.gg or add manually.</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No tournaments match the selected filters.</div>
        ) : (
          filtered.map((t) =>
            editingId === t.id ? (
              <div key={t.id} className="list-item edit-row">
                <input
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  placeholder="Name"
                  style={{ flex: 2 }}
                />
                <input
                  value={editData.event_name}
                  onChange={(e) => setEditData({ ...editData, event_name: e.target.value })}
                  placeholder="Event"
                  style={{ flex: 1 }}
                />
                <select
                  value={editData.game_id}
                  onChange={(e) => setEditData({ ...editData, game_id: e.target.value })}
                  style={{ flex: 1 }}
                >
                  {games.map((g) => (
                    <option key={g.id} value={String(g.id)}>{g.name}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={editData.date}
                  onChange={(e) => setEditData({ ...editData, date: e.target.value })}
                  style={{ flex: 1 }}
                />
                <button className="btn-primary small" onClick={saveEdit}>Save</button>
                <button className="btn-ghost small" onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            ) : (
              <div key={t.id} className="list-item">
                <div className="item-info">
                  <span className="item-name">{t.name}</span>
                  {t.event_name && <span className="item-sub">{t.event_name}</span>}
                  <span className="item-meta">
                    {t.icon_emoji} {t.game_name}
                    {t.date && ` · ${new Date(t.date + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`}
                    {` · ${t.player_count} players`}
                  </span>
                </div>
                {canManage && (
                  <div className="item-actions">
                    <button className="btn-ghost small" onClick={() => startEdit(t)}>Edit</button>
                    <button className="btn-danger small" onClick={() => handleDelete(t.id)}>Delete</button>
                  </div>
                )}
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}

// ─── Games tab ────────────────────────────────────────────────────────────────
function GamesTab({ games, pendingGames = [], authHeaders, onRefresh }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('manage_games');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🎮');
  const [error, setError] = useState('');
  const [uploadingId, setUploadingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const fileInputRefs = useRef({});

  const [approveModal, setApproveModal] = useState(null);
  const [approveForm, setApproveForm] = useState({ game_name: '', icon_emoji: '🎮' });
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveError, setApproveError] = useState('');

  const handleOpenApprove = (pending) => {
    setApproveModal(pending);
    setApproveForm({ game_name: pending.game_name, icon_emoji: '🎮' });
    setApproveError('');
  };

  const handleApprove = async () => {
    setApproveLoading(true);
    setApproveError('');
    const res = await fetch(`${apiBase}/api/admin/startgg/pending-games/${approveModal.id}/approve`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(approveForm),
    });
    const data = await res.json();
    setApproveLoading(false);
    if (!res.ok) { setApproveError(data.error || 'Failed to add game'); return; }
    setApproveModal(null);
    onRefresh();
  };

  const handleDismiss = async (id) => {
    if (!confirm('Remove this pending game entry?')) return;
    await fetch(`${apiBase}/api/admin/startgg/pending-games/${id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    onRefresh();
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    const res = await fetch(`${apiBase}/api/admin/games`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name, icon_emoji: emoji }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setName('');
    setEmoji('🎮');
    onRefresh();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this game? All associated tournaments and standings will also be deleted.')) return;
    await fetch(`${apiBase}/api/admin/games/${id}`, { method: 'DELETE', headers: authHeaders });
    onRefresh();
  };

  const handleIconUpload = async (gameId, file) => {
    if (!file) return;
    setUploadingId(gameId);
    const formData = new FormData();
    formData.append('icon', file);
    try {
      const res = await fetch(`${apiBase}/api/admin/games/${gameId}/icon`, {
        method: 'POST',
        headers: { Authorization: authHeaders.Authorization },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Upload failed');
      } else {
        onRefresh();
      }
    } finally {
      setUploadingId(null);
      if (fileInputRefs.current[gameId]) fileInputRefs.current[gameId].value = '';
    }
  };

  const handleRemoveIcon = async (gameId) => {
    setRemovingId(gameId);
    try {
      await fetch(`${apiBase}/api/admin/games/${gameId}/icon`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      onRefresh();
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="tab-content">

      {/* ── Pending games from organizer sync ── */}
      {pendingGames.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <h3 className="card-title" style={{ marginBottom: 6 }}>
            Pending Games
            <span className="tab-badge" style={{ marginLeft: 8 }}>{pendingGames.length}</span>
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
            Found during organizer sync — not yet in your game library. Review and add them.
          </p>
          <div className="list">
            {pendingGames.map((p) => (
              <div key={p.id} className="list-item">
                <div className="item-info">
                  <span className="item-name">{p.game_name}</span>
                  <span className="item-sub">{p.tournament_name}</span>
                  {p.event_date && (
                    <span className="item-meta">
                      {new Date(p.event_date + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
                <div className="item-actions">
                  <button className="btn-primary small" onClick={() => handleOpenApprove(p)}>Add Game</button>
                  <button className="btn-ghost small" onClick={() => handleDismiss(p.id)}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Approve modal ── */}
      {approveModal && (
        <div className="modal-overlay" onClick={() => setApproveModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-title" style={{ marginBottom: 0 }}>Add Game</h3>
            <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              From: <strong>{approveModal.tournament_name}</strong><br />
              All pending tournaments for this game name will be added to Upcoming automatically.
            </p>
            <div className="form-row">
              <div className="form-group" style={{ width: 72 }}>
                <label>Emoji</label>
                <input
                  value={approveForm.icon_emoji}
                  onChange={(e) => setApproveForm(f => ({ ...f, icon_emoji: e.target.value }))}
                  maxLength={4}
                  style={{ textAlign: 'center', fontSize: 20 }}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Game Name</label>
                <input
                  value={approveForm.game_name}
                  onChange={(e) => setApproveForm(f => ({ ...f, game_name: e.target.value }))}
                  required
                  autoFocus
                />
              </div>
            </div>
            <small style={{ color: 'var(--text-dim)', marginTop: -4 }}>
              You can upload a game icon image after adding from the list below.
            </small>
            {approveError && <div className="error-msg">{approveError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-primary"
                onClick={handleApprove}
                disabled={approveLoading || !approveForm.game_name.trim()}
              >
                {approveLoading ? 'Adding…' : 'Add Game & Approve Tournaments'}
              </button>
              <button className="btn-ghost" onClick={() => setApproveModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {canManage && <form onSubmit={handleAdd} className="card">
        <h3 className="card-title">Add Game</h3>
        <div className="form-row">
          <div className="form-group" style={{ width: 72 }}>
            <label>Emoji</label>
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={4}
              style={{ textAlign: 'center', fontSize: 20 }}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Game Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Valorant"
              required
            />
          </div>
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button type="submit" className="btn-primary">Add Game</button>
      </form>}

      <div className="list">
        {games.length === 0 ? (
          <div className="empty-state">No games yet.</div>
        ) : (
          games.map((g) => (
            <div key={g.id} className="list-item" style={{ gap: 12, alignItems: 'center' }}>
              <div style={{ flexShrink: 0 }}>
                <GameIcon game={g} size={48} />
              </div>
              <span className="item-name" style={{ flex: 1, fontSize: 16 }}>
                {g.name}
              </span>
              {canManage && (
                <div className="item-actions" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    ref={(el) => { fileInputRefs.current[g.id] = el; }}
                    onChange={(e) => handleIconUpload(g.id, e.target.files[0])}
                  />
                  <button
                    className="btn-secondary small"
                    disabled={uploadingId === g.id}
                    onClick={() => fileInputRefs.current[g.id]?.click()}
                  >
                    {uploadingId === g.id ? 'Uploading…' : g.icon_path ? 'Replace Icon' : 'Upload Icon'}
                  </button>
                  {g.icon_path && (
                    <button
                      className="btn-ghost small"
                      disabled={removingId === g.id}
                      onClick={() => handleRemoveIcon(g.id)}
                    >
                      {removingId === g.id ? 'Removing…' : 'Remove Icon'}
                    </button>
                  )}
                  <button className="btn-danger small" onClick={() => handleDelete(g.id)}>Delete</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Accounts tab ────────────────────────────────────────────────────────────
const PERMISSIONS = [
  { key: 'manage_games',         label: 'Manage Games' },
  { key: 'manage_tournaments',   label: 'Manage Tournaments' },
  { key: 'manage_upcoming',      label: 'Manage Upcoming Tournaments' },
  { key: 'manage_branding',      label: 'Manage Branding' },
  { key: 'manage_integrations',  label: 'Manage Integrations' },
  { key: 'manage_accounts',      label: 'Manage Accounts' },
];

function PermCheckboxes({ value, onChange, editorUser, targetIsSuperAdmin, readOnly }) {
  if (targetIsSuperAdmin) {
    return (
      <div className="perm-grid">
        {PERMISSIONS.map(({ key, label }) => (
          <label key={key} className="perm-check">
            <input type="checkbox" checked disabled readOnly />
            {label}
          </label>
        ))}
        <span className="dim" style={{ fontSize: 11 }}>Superadmins have all permissions</span>
      </div>
    );
  }
  return (
    <div className="perm-grid">
      {PERMISSIONS.map(({ key, label }) => {
        const canGrant = editorUser?.is_superadmin ||
          (Array.isArray(editorUser?.permissions) && editorUser.permissions.includes(key));
        return (
          <label key={key} className="perm-check">
            <input
              type="checkbox"
              checked={value.includes(key)}
              disabled={readOnly || !canGrant}
              onChange={(e) => {
                if (!onChange) return;
                const next = e.target.checked
                  ? [...value, key]
                  : value.filter(p => p !== key);
                onChange(next);
              }}
            />
            {label}
          </label>
        );
      })}
    </div>
  );
}

function AccountsTab({ accounts, currentAdminId, authHeaders, onRefresh }) {
  const { user: currentUser, hasPermission } = useAuth();
  const canManage = hasPermission('manage_accounts');

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ username: '', password: '', permissions: [] });
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ username: '', password: '', permissions: [] });
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);
    const res = await fetch(`${apiBase}/api/admin/accounts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(addForm),
    });
    const data = await res.json();
    setAddLoading(false);
    if (!res.ok) { setAddError(data.error); return; }
    setAddForm({ username: '', password: '', permissions: [] });
    setShowAdd(false);
    onRefresh();
  };

  const startEdit = (account) => {
    setEditingId(account.id);
    setEditForm({
      username: account.username,
      password: '',
      permissions: account.is_superadmin ? [] : (account.permissions || []),
    });
    setEditError('');
  };

  const saveEdit = async () => {
    setEditError('');
    setEditLoading(true);
    const editedAccount = accounts.find(a => a.id === editingId);
    const isSelf = editingId === currentAdminId;

    // Build body — only include fields we're allowed to send
    const body = {};
    if (canManage) {
      body.username = editForm.username;
      if (!editedAccount?.is_superadmin) body.permissions = editForm.permissions;
    }
    if (editForm.password) body.password = editForm.password;

    const res = await fetch(`${apiBase}/api/admin/accounts/${editingId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setEditLoading(false);
    if (!res.ok) { setEditError(data.error); return; }
    setEditingId(null);
    onRefresh();
  };

  const handleDelete = async (id, username) => {
    if (!confirm(`Delete admin account "${username}"? This cannot be undone.`)) return;
    const res = await fetch(`${apiBase}/api/admin/accounts/${id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error);
      return;
    }
    onRefresh();
  };

  const editingAccount = accounts.find(a => a.id === editingId);

  return (
    <div className="tab-content">
      <div className="section-head">
        <h3 className="card-title" style={{ marginBottom: 0 }}>
          Admin Accounts <span className="dim">({accounts.length})</span>
        </h3>
        {canManage && (
          <button className="btn-ghost small" onClick={() => { setShowAdd((v) => !v); setAddError(''); }}>
            {showAdd ? '− Cancel' : '+ Add Admin'}
          </button>
        )}
      </div>

      {canManage && showAdd && (
        <form onSubmit={handleAdd} className="card">
          <h3 className="card-title">New Admin Account</h3>
          <div className="form-row" style={{ flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 180px' }}>
              <label>Username *</label>
              <input
                value={addForm.username}
                onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                placeholder="e.g. janedoe"
                autoComplete="off"
                required
              />
            </div>
            <div className="form-group" style={{ flex: '1 1 180px' }}>
              <label>Password *</label>
              <input
                type="password"
                value={addForm.password}
                onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                placeholder="Choose a strong password"
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label>Permissions</label>
            <PermCheckboxes
              value={addForm.permissions}
              onChange={(p) => setAddForm({ ...addForm, permissions: p })}
              editorUser={currentUser}
              targetIsSuperAdmin={false}
            />
          </div>
          {addError && <div className="error-msg">{addError}</div>}
          <button type="submit" className="btn-primary" disabled={addLoading}>
            {addLoading ? 'Creating…' : 'Create Account'}
          </button>
        </form>
      )}

      <div className="list">
        {accounts.length === 0 ? (
          <div className="empty-state">No admin accounts found.</div>
        ) : (
          accounts.map((a) =>
            editingId === a.id ? (
              <div key={a.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                <div className="form-row" style={{ flexWrap: 'wrap' }}>
                  {canManage && (
                    <div className="form-group" style={{ flex: '1 1 180px' }}>
                      <label>Username</label>
                      <input
                        value={editForm.username}
                        onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                        autoComplete="off"
                      />
                    </div>
                  )}
                  <div className="form-group" style={{ flex: '1 1 180px' }}>
                    <label>
                      New Password{' '}
                      <span className="dim">(leave blank to keep current)</span>
                    </label>
                    <input
                      type="password"
                      value={editForm.password}
                      onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                      placeholder="Leave blank to keep current"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                {canManage && (
                  <div className="form-group">
                    <label>Permissions</label>
                    <PermCheckboxes
                      value={editForm.permissions}
                      onChange={(p) => setEditForm({ ...editForm, permissions: p })}
                      editorUser={currentUser}
                      targetIsSuperAdmin={editingAccount?.is_superadmin}
                    />
                  </div>
                )}
                {editError && <div className="error-msg">{editError}</div>}
                <div className="item-actions">
                  <button className="btn-primary small" onClick={saveEdit} disabled={editLoading}>
                    {editLoading ? 'Saving…' : 'Save'}
                  </button>
                  <button className="btn-ghost small" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div key={a.id} className="list-item" style={{ flexWrap: 'wrap', gap: 10 }}>
                <div className="item-info" style={{ flex: 1, minWidth: 0 }}>
                  <span className="item-name" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {a.is_superadmin && <span className="badge badge-super">Super Admin</span>}
                    {a.username}
                    {a.id === currentAdminId && (
                      <span className="dim" style={{ fontSize: 11 }}>(you)</span>
                    )}
                  </span>
                  <div style={{ marginTop: 4 }}>
                    {a.is_superadmin ? null : (
                      <div className="perm-badges">
                        {(a.permissions || []).length === 0 ? (
                          <span className="badge badge-none">No permissions</span>
                        ) : (
                          (a.permissions || []).map(p => {
                            const def = PERMISSIONS.find(d => d.key === p);
                            return def
                              ? <span key={p} className="badge badge-perm">{def.label}</span>
                              : null;
                          })
                        )}
                      </div>
                    )}
                  </div>
                  <span className="item-meta" style={{ marginTop: 4 }}>
                    Created {new Date(a.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    {a.last_login && ` · Last login ${new Date(a.last_login).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`}
                  </span>
                </div>
                <div className="item-actions">
                  {/* Any admin can edit their own account (password); manage_accounts can edit all */}
                  {(canManage || a.id === currentAdminId) && (
                    <button className="btn-ghost small" onClick={() => startEdit(a)}>
                      {canManage ? 'Edit' : 'Change Password'}
                    </button>
                  )}
                  {canManage && (
                    <button
                      className="btn-danger small"
                      onClick={() => handleDelete(a.id, a.username)}
                      disabled={accounts.length <= 1 || a.id === currentAdminId}
                      title={
                        a.id === currentAdminId
                          ? 'You cannot delete your own account'
                          : accounts.length <= 1
                          ? 'Cannot delete the last admin account'
                          : undefined
                      }
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}

// ─── Integrations tab ─────────────────────────────────────────────────────────
function IntegrationsTab({ authHeaders, onRefresh }) {
  const [integrations, setIntegrations] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [cloudName, setCloudName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [startggToken, setStartggToken] = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [organizerUrl, setOrganizerUrl] = useState('');
  const [syncFrequency, setSyncFrequency] = useState('manual');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const fetchIntegrations = useCallback(async () => {
    setLoadError('');
    try {
      const res = await fetch(`${apiBase}/api/admin/integrations`, { headers: authHeaders });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setIntegrations(data);
      setCloudName(data.cloudinary_cloud_name || '');
      setOrganizerUrl(data.startgg_organizer_url || '');
      setSyncFrequency(data.startgg_sync_frequency || 'manual');
      if (data.startgg_last_sync_result) setSyncResult(data.startgg_last_sync_result);
    } catch (err) {
      setLoadError(err.message);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchIntegrations(); }, [fetchIntegrations]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError('');

    const body = {
      cloudinary_cloud_name:   cloudName,
      startgg_organizer_url:   organizerUrl,
      startgg_sync_frequency:  syncFrequency,
    };
    if (apiKey)       body.cloudinary_api_key    = apiKey;
    if (apiSecret)    body.cloudinary_api_secret = apiSecret;
    if (startggToken) body.startgg_token         = startggToken;

    const res = await fetch(`${apiBase}/api/admin/integrations`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setApiKey('');
      setApiSecret('');
      setStartggToken('');
      fetchIntegrations();
      onRefresh();
      setTimeout(() => setSaved(false), 3000);
    } else {
      const data = await res.json();
      setSaveError(data.error || 'Save failed');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    const res = await fetch(`${apiBase}/api/admin/startgg/sync-organizer`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ url: organizerUrl }),
    });
    const data = await res.json();
    setSyncing(false);
    setSyncResult(data);
    fetchIntegrations();
    onRefresh();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await fetch(`${apiBase}/api/admin/integrations/test-cloudinary`, {
      method: 'POST',
      headers: authHeaders,
    });
    const data = await res.json();
    setTesting(false);
    setTestResult(data);
    fetchIntegrations();
  };

  if (!integrations && !loadError) return <div className="loading" style={{ padding: 24 }}>Loading…</div>;
  if (loadError) return <div className="error-msg" style={{ margin: 24 }}>{loadError}</div>;

  const isConnected = integrations.cloudinary_test_ok === 'true';
  const hasCredentials = integrations.cloudinary_api_key_set && integrations.cloudinary_api_secret_set;

  return (
    <div className="tab-content">
      <form onSubmit={handleSave}>

        {/* ── Cloudinary ── */}
        <div className="card">
          <div className="section-head" style={{ marginBottom: 12 }}>
            <h3 className="card-title" style={{ marginBottom: 0 }}>Cloudinary</h3>
            {integrations.cloudinary_last_tested && (
              <span className={`badge ${isConnected ? 'badge-perm' : 'badge-none'}`}>
                {isConnected ? 'Connected' : 'Not connected'}
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
            Used for storing uploaded images (logos, favicons, banners, game icons).
            Without credentials, images are stored locally on the server.
          </p>

          {integrations.cloudinary_last_tested && (
            <div className="dim" style={{ fontSize: 11, marginBottom: 12 }}>
              Last tested: {new Date(integrations.cloudinary_last_tested).toLocaleString()}
            </div>
          )}

          <div className="form-group">
            <label>Cloud Name</label>
            <input
              value={cloudName}
              onChange={(e) => setCloudName(e.target.value)}
              placeholder="your-cloud-name"
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={integrations.cloudinary_api_key_set ? '●●●●●●●● (saved — paste new to update)' : 'Paste your API key'}
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label>API Secret</label>
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder={integrations.cloudinary_api_secret_set ? '●●●●●●●● (saved — paste new to update)' : 'Paste your API secret'}
              autoComplete="new-password"
            />
          </div>
          <small style={{ marginBottom: 12, display: 'block' }}>
            Find these at cloudinary.com → Settings → Access Keys
          </small>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleTest}
              disabled={testing || !hasCredentials}
            >
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
            {testResult && (
              <span
                className={testResult.ok ? 'success-msg' : 'error-msg'}
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                {testResult.ok ? '✓ Connected successfully' : `✗ ${testResult.error}`}
              </span>
            )}
          </div>
        </div>

        {/* ── start.gg ── */}
        <div className="card">
          <h3 className="card-title">start.gg</h3>
          <div className="form-group">
            <label>API Token</label>
            <input
              type="password"
              value={startggToken}
              onChange={(e) => setStartggToken(e.target.value)}
              placeholder={integrations.startgg_token_set ? '●●●●●●●● (token saved — paste new to update)' : 'Paste your token here'}
              autoComplete="new-password"
            />
            <small>Get your token at start.gg → Settings → Developer → Personal Access Tokens</small>
          </div>
          {integrations.startgg_token_set && (
            <div className="success-msg" style={{ fontSize: 12 }}>✓ Token is currently configured</div>
          )}
        </div>

        {/* ── Organizer Sync ── */}
        <div className="card">
          <h3 className="card-title">Organizer Sync</h3>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
            Automatically pull upcoming tournaments from a start.gg organizer profile.
            Unknown games are held as pending for review in the Games tab.
          </p>
          <div className="form-group">
            <label>Organizer URL</label>
            <input
              value={organizerUrl}
              onChange={(e) => setOrganizerUrl(e.target.value)}
              placeholder="https://www.start.gg/user/your-username"
              autoComplete="off"
            />
            <small>Paste your start.gg user or org profile URL</small>
          </div>
          <div className="form-group">
            <label>Sync Frequency</label>
            <select value={syncFrequency} onChange={(e) => setSyncFrequency(e.target.value)}>
              <option value="manual">Manual only</option>
              <option value="daily">Daily (auto-syncs every 24 h)</option>
              <option value="weekly">Weekly (auto-syncs every 7 days)</option>
            </select>
          </div>
          {integrations.startgg_last_synced && (
            <div className="dim" style={{ fontSize: 11, marginBottom: 12 }}>
              Last synced: {new Date(integrations.startgg_last_synced).toLocaleString()}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleSync}
              disabled={syncing || !organizerUrl.trim() || !integrations.startgg_token_set}
              title={!integrations.startgg_token_set ? 'Configure a start.gg API token first' : undefined}
            >
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
            {syncResult && (
              <span
                className={syncResult.error ? 'error-msg' : 'success-msg'}
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                {syncResult.error
                  ? `✗ ${syncResult.error}`
                  : `✓ ${syncResult.added ?? 0} added, ${syncResult.pending ?? 0} pending, ${syncResult.skipped ?? 0} skipped`}
              </span>
            )}
          </div>
        </div>

        {saveError && <div className="error-msg">{saveError}</div>}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Integration Settings'}
          </button>
          {saved && <span className="success-msg" style={{ padding: '6px 12px' }}>Saved!</span>}
        </div>
      </form>
    </div>
  );
}

// ─── Upcoming tournaments tab ─────────────────────────────────────────────────
function UpcomingTab({ upcoming, games, authHeaders, onRefresh }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('manage_upcoming');

  const BLANK = { name: '', game_id: '', event_date: '', location: '', startgg_url: '', description: '' };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const resetForm = () => { setForm(BLANK); setError(''); setEditingId(null); setShowForm(false); };

  const startEdit = (t) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      game_id: t.game_id ? String(t.game_id) : '',
      event_date: t.event_date || '',
      location: t.location || '',
      startgg_url: t.startgg_url || '',
      description: t.description || '',
    });
    setShowForm(true);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const url = editingId
      ? `${apiBase}/api/admin/upcoming/${editingId}`
      : `${apiBase}/api/admin/upcoming`;
    const method = editingId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: authHeaders,
      body: JSON.stringify({ ...form, game_id: form.game_id || null }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error); return; }
    resetForm();
    onRefresh();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this upcoming tournament?')) return;
    await fetch(`${apiBase}/api/admin/upcoming/${id}`, { method: 'DELETE', headers: authHeaders });
    onRefresh();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return new Date(+y, +m - 1, +d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="tab-content">
      <div className="section-head">
        <h3 className="card-title" style={{ marginBottom: 0 }}>
          Upcoming Tournaments <span className="dim">({upcoming.length})</span>
        </h3>
        {canManage && !showForm && (
          <button className="btn-ghost small" onClick={() => { setShowForm(true); setEditingId(null); setForm(BLANK); }}>
            + Add Tournament
          </button>
        )}
      </div>

      {canManage && showForm && (
        <form onSubmit={handleSubmit} className="card">
          <h3 className="card-title">{editingId ? 'Edit Tournament' : 'New Upcoming Tournament'}</h3>
          <div className="form-row" style={{ flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '2 1 220px' }}>
              <label>Tournament Name *</label>
              <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="form-group" style={{ flex: '1 1 160px' }}>
              <label>Game</label>
              <select value={form.game_id} onChange={(e) => setForm(f => ({ ...f, game_id: e.target.value }))}>
                <option value="">Select game…</option>
                {games.map((g) => (
                  <option key={g.id} value={String(g.id)}>{g.icon_emoji} {g.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: '1 1 160px' }}>
              <label>Date *</label>
              <input type="date" value={form.event_date} onChange={(e) => setForm(f => ({ ...f, event_date: e.target.value }))} required />
            </div>
          </div>
          <div className="form-row" style={{ flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 200px' }}>
              <label>Location / Venue</label>
              <input value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. LAN Center, City" />
            </div>
            <div className="form-group" style={{ flex: '2 1 260px' }}>
              <label>start.gg URL <span className="dim">(optional)</span></label>
              <input value={form.startgg_url} onChange={(e) => setForm(f => ({ ...f, startgg_url: e.target.value }))} placeholder="https://www.start.gg/tournament/…" />
            </div>
          </div>
          <div className="form-group">
            <label>Description <span className="dim">(optional)</span></label>
            <input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description…" />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Tournament'}
            </button>
            <button type="button" className="btn-ghost" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      <div className="list">
        {upcoming.length === 0 ? (
          <div className="empty-state">No upcoming tournaments. Add one to display it on the public page.</div>
        ) : (
          upcoming.map((t) => (
            <div key={t.id} className="list-item">
              <div className="item-info">
                <span className="item-name">{t.name}</span>
                {t.game_name && <span className="item-sub">{t.icon_emoji} {t.game_name}</span>}
                <span className="item-meta">
                  {formatDate(t.event_date)}
                  {t.location && ` · ${t.location}`}
                  {t.startgg_url && ' · Register link set'}
                </span>
                {t.description && <span className="item-meta" style={{ marginTop: 2 }}>{t.description}</span>}
              </div>
              {canManage && (
                <div className="item-actions">
                  <button className="btn-ghost small" onClick={() => startEdit(t)}>Edit</button>
                  <button className="btn-danger small" onClick={() => handleDelete(t.id)}>Delete</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Branding tab ─────────────────────────────────────────────────────────────
function parseJSON(val, fallback) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val || '[]'); } catch (_e) { return fallback; }
}

function UploadArea({ label, hint, currentPath, uploadKey, onUpload, onRemove, uploading, wide }) {
  const inputRef = useRef(null);
  const fullUrl = resolveImageUrl(currentPath) || null;

  return (
    <div className="form-group">
      <label>{label}</label>
      {hint && <small>{hint}</small>}
      <div className="upload-area" onClick={() => inputRef.current?.click()}>
        {fullUrl ? (
          <img
            src={fullUrl}
            alt={label}
            className={wide ? 'upload-preview-wide' : 'upload-preview'}
            style={wide ? { width: '100%' } : {}}
          />
        ) : (
          <span className="dim" style={{ fontSize: 12 }}>Click to upload…</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files[0] && onUpload(uploadKey, e.target.files[0])}
        />
      </div>
      {fullUrl && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button type="button" className="btn-secondary small" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? 'Uploading…' : 'Replace'}
          </button>
          <button type="button" className="btn-ghost small" onClick={onRemove}>Remove</button>
        </div>
      )}
      {!fullUrl && uploading && <small>Uploading…</small>}
    </div>
  );
}

function BrandingTab({ settings, authHeaders, onRefresh }) {
  const { reloadBranding } = useBranding();

  const [form, setForm] = useState({
    site_name: 'Esports Standings',
    site_tagline: 'Local Circuit',
    primary_color: '#7c6fff',
    accent_color: '#7c6fff',
    announcement_text: '',
    announcement_active: false,
    footer_links: [],
    social_links: [],
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [uploading, setUploading] = useState(null);

  useEffect(() => {
    setForm({
      site_name:          settings.site_name          || 'Esports Standings',
      site_tagline:       settings.site_tagline        || 'Local Circuit',
      primary_color:      settings.primary_color       || '#7c6fff',
      accent_color:       settings.accent_color        || '#7c6fff',
      announcement_text:  settings.announcement_text   || '',
      announcement_active: settings.announcement_active === 'true' || settings.announcement_active === true,
      footer_links:       parseJSON(settings.footer_links,  []),
      social_links:       parseJSON(settings.social_links,  []),
    });
  }, [settings]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError('');
    const res = await fetch(`${apiBase}/api/admin/settings/branding`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      onRefresh();
      reloadBranding();
      setTimeout(() => setSaved(false), 3000);
    } else {
      const data = await res.json();
      setSaveError(data.error || 'Save failed');
    }
  };

  const handleUpload = async (type, file) => {
    setUploading(type);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${apiBase}/api/admin/settings/${type}`, {
        method: 'POST',
        headers: { Authorization: authHeaders.Authorization },
        body: formData,
      });
      if (res.ok) {
        onRefresh();
        reloadBranding();
      } else {
        const data = await res.json();
        alert(data.error || 'Upload failed');
      }
    } finally {
      setUploading(null);
    }
  };

  const handleRemoveFile = async (type) => {
    await fetch(`${apiBase}/api/admin/settings/${type}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    onRefresh();
    reloadBranding();
  };

  // Footer links helpers
  const addFooterLink  = () => setForm(f => ({ ...f, footer_links: [...f.footer_links, { label: '', url: '' }] }));
  const removeFooterLink = (i) => setForm(f => ({ ...f, footer_links: f.footer_links.filter((_, idx) => idx !== i) }));
  const updateFooterLink = (i, field, val) => setForm(f => ({
    ...f,
    footer_links: f.footer_links.map((l, idx) => idx === i ? { ...l, [field]: val } : l),
  }));
  const moveFooterLink = (i, dir) => {
    const arr = [...form.footer_links];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setForm(f => ({ ...f, footer_links: arr }));
  };

  // Social links helpers
  const addSocialLink = () => setForm(f => ({ ...f, social_links: [...f.social_links, { platform: 'twitter', url: '' }] }));
  const removeSocialLink = (i) => setForm(f => ({ ...f, social_links: f.social_links.filter((_, idx) => idx !== i) }));
  const updateSocialLink = (i, field, val) => setForm(f => ({
    ...f,
    social_links: f.social_links.map((l, idx) => idx === i ? { ...l, [field]: val } : l),
  }));

  return (
    <form onSubmit={handleSave} className="tab-content">

      {/* ── Identity ── */}
      <div className="card">
        <h3 className="card-title">Site Identity</h3>
        <div className="form-row" style={{ flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '2 1 220px' }}>
            <label>Site Name</label>
            <input
              value={form.site_name}
              onChange={(e) => setForm(f => ({ ...f, site_name: e.target.value }))}
              placeholder="Esports Standings"
            />
          </div>
          <div className="form-group" style={{ flex: '2 1 220px' }}>
            <label>Tagline</label>
            <input
              value={form.site_tagline}
              onChange={(e) => setForm(f => ({ ...f, site_tagline: e.target.value }))}
              placeholder="Local Circuit"
            />
          </div>
        </div>
      </div>

      {/* ── Images ── */}
      <div className="card">
        <h3 className="card-title">Images</h3>
        <div className="form-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 200px' }}>
            <UploadArea
              label="Site Logo"
              hint="Shown in the navbar. Recommended: transparent PNG, max 400×100 px"
              currentPath={settings.site_logo || ''}
              uploadKey="logo"
              onUpload={handleUpload}
              onRemove={() => handleRemoveFile('logo')}
              uploading={uploading === 'logo'}
            />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <UploadArea
              label="Favicon"
              hint="Browser tab icon. 32×32 or 64×64 px"
              currentPath={settings.site_favicon || ''}
              uploadKey="favicon"
              onUpload={handleUpload}
              onRemove={() => handleRemoveFile('favicon')}
              uploading={uploading === 'favicon'}
            />
          </div>
        </div>
        <UploadArea
          label="Hero Banner"
          hint="Full-width image behind the homepage hero text. Recommended: 1600×500 px"
          currentPath={settings.hero_banner || ''}
          uploadKey="banner"
          onUpload={handleUpload}
          onRemove={() => handleRemoveFile('banner')}
          uploading={uploading === 'banner'}
          wide
        />
      </div>

      {/* ── Colors + Preview ── */}
      <div className="card">
        <h3 className="card-title">Colors</h3>
        <div className="form-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label>Accent Color</label>
            <small>Buttons, active tabs, links</small>
            <div className="color-row">
              <input
                type="color"
                value={form.accent_color}
                onChange={(e) => setForm(f => ({ ...f, accent_color: e.target.value }))}
                style={{ width: 44, padding: '2px 3px', flex: 'none' }}
              />
              <input
                value={form.accent_color}
                onChange={(e) => setForm(f => ({ ...f, accent_color: e.target.value }))}
                placeholder="#7c6fff"
                style={{ flex: 1, fontFamily: 'monospace' }}
              />
            </div>
          </div>
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label>Primary Color</label>
            <small>Logo text &amp; hero gradient highlight</small>
            <div className="color-row">
              <input
                type="color"
                value={form.primary_color}
                onChange={(e) => setForm(f => ({ ...f, primary_color: e.target.value }))}
                style={{ width: 44, padding: '2px 3px', flex: 'none' }}
              />
              <input
                value={form.primary_color}
                onChange={(e) => setForm(f => ({ ...f, primary_color: e.target.value }))}
                placeholder="#ffffff"
                style={{ flex: 1, fontFamily: 'monospace' }}
              />
            </div>
          </div>
        </div>

        {/* Live preview */}
        <div>
          <label className="form-group" style={{ marginBottom: 8 }}><span style={{ color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.5px' }}>Navbar Preview</span></label>
          <div className="branding-preview-panel">
            <div className="branding-preview-nav" style={{ color: form.accent_color }}>
              {settings.site_logo
                ? <img src={resolveImageUrl(settings.site_logo)} alt="logo" style={{ height: 30, objectFit: 'contain' }} />
                : (form.site_name || 'ESPORTS TRACKER').toUpperCase()
              }
            </div>
            <div style={{ padding: '16px', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              <div style={{
                fontFamily: 'var(--font-head)',
                fontSize: 38,
                letterSpacing: 4,
                background: `linear-gradient(135deg, ${form.primary_color} 40%, ${form.accent_color})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                {(form.site_name || 'ESPORTS STANDINGS').toUpperCase()}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>
                {form.site_tagline || 'Local Circuit'}
              </div>
              <button
                type="button"
                style={{ background: form.accent_color, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', marginTop: 4, cursor: 'default' }}
              >
                Sample Button
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Announcement Bar ── */}
      <div className="card">
        <h3 className="card-title">Announcement Bar</h3>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.announcement_active}
              onChange={(e) => setForm(f => ({ ...f, announcement_active: e.target.checked }))}
              style={{ width: 'auto', padding: 0 }}
            />
            Show announcement bar at top of page
          </label>
        </div>
        <div className="form-group">
          <label>Announcement Text</label>
          <input
            value={form.announcement_text}
            onChange={(e) => setForm(f => ({ ...f, announcement_text: e.target.value }))}
            placeholder="e.g. Season 3 registrations are now open!"
          />
        </div>
        {form.announcement_active && form.announcement_text && (
          <div className="announcement-bar" style={{ borderRadius: 6 }}>
            {form.announcement_text}
          </div>
        )}
      </div>

      {/* ── Footer Links ── */}
      <div className="card">
        <div className="section-head">
          <h3 className="card-title" style={{ marginBottom: 0 }}>Footer Links</h3>
          <button type="button" className="btn-ghost small" onClick={addFooterLink}>+ Add Link</button>
        </div>
        {form.footer_links.length === 0 ? (
          <div className="empty-state" style={{ padding: '16px 20px' }}>No footer links yet.</div>
        ) : (
          <div className="link-manager">
            {form.footer_links.map((link, i) => (
              <div key={i} className="link-row">
                <input
                  value={link.label}
                  onChange={(e) => updateFooterLink(i, 'label', e.target.value)}
                  placeholder="Label"
                  style={{ flex: '1 1 140px' }}
                />
                <input
                  value={link.url}
                  onChange={(e) => updateFooterLink(i, 'url', e.target.value)}
                  placeholder="https://…"
                  style={{ flex: '2 1 220px' }}
                />
                <button type="button" className="btn-ghost small" onClick={() => moveFooterLink(i, -1)} disabled={i === 0} title="Move up">↑</button>
                <button type="button" className="btn-ghost small" onClick={() => moveFooterLink(i,  1)} disabled={i === form.footer_links.length - 1} title="Move down">↓</button>
                <button type="button" className="btn-danger small" onClick={() => removeFooterLink(i)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Social Links ── */}
      <div className="card">
        <div className="section-head">
          <h3 className="card-title" style={{ marginBottom: 0 }}>Social Links</h3>
          <button type="button" className="btn-ghost small" onClick={addSocialLink}>+ Add Social</button>
        </div>
        {form.social_links.length === 0 ? (
          <div className="empty-state" style={{ padding: '16px 20px' }}>No social links yet.</div>
        ) : (
          <div className="link-manager">
            {form.social_links.map((link, i) => (
              <div key={i} className="link-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 160px' }}>
                  <SocialIcon platform={link.platform} size={18} />
                  <select
                    value={link.platform}
                    onChange={(e) => updateSocialLink(i, 'platform', e.target.value)}
                    style={{ flex: 1 }}
                  >
                    {SOCIAL_PLATFORMS.map(p => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <input
                  value={link.url}
                  onChange={(e) => updateSocialLink(i, 'url', e.target.value)}
                  placeholder="https://…"
                  style={{ flex: '2 1 220px' }}
                />
                <button type="button" className="btn-danger small" onClick={() => removeSocialLink(i)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Save ── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save Branding Settings'}
        </button>
        {saved && <span className="success-msg" style={{ padding: '6px 12px' }}>Saved!</span>}
        {saveError && <span className="error-msg" style={{ padding: '6px 12px' }}>{saveError}</span>}
      </div>
    </form>
  );
}

// ─── Admin root ───────────────────────────────────────────────────────────────
function AdminPanel() {
  const { token, user, hasPermission } = useAuth();

  // Determine which tabs this admin can see
  const visibleTabs = [
    hasPermission('manage_tournaments')  && 'tournaments',
    hasPermission('manage_upcoming')     && 'upcoming',
    hasPermission('manage_games')        && 'games',
    hasPermission('manage_accounts')     && 'accounts',
    hasPermission('manage_branding')     && 'branding',
    hasPermission('manage_integrations') && 'integrations',
  ].filter(Boolean);

  const [tab, setTab] = useState(() => visibleTabs[0] || '');
  const [games, setGames] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [settings, setSettings] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [pendingGames, setPendingGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const fetchData = useCallback(async () => {
    setLoadError(null);
    try {
      const [gRes, tRes, sRes, aRes, uRes] = await Promise.all([
        fetch(`${apiBase}/api/admin/games`,       { headers: authHeaders }),
        fetch(`${apiBase}/api/admin/tournaments`, { headers: authHeaders }),
        fetch(`${apiBase}/api/admin/settings`,    { headers: authHeaders }),
        fetch(`${apiBase}/api/admin/accounts`,    { headers: authHeaders }),
        fetch(`${apiBase}/api/admin/upcoming`,    { headers: authHeaders }),
      ]);
      if (!gRes.ok || !tRes.ok || !sRes.ok || !aRes.ok || !uRes.ok) {
        throw new Error(`Server error — status ${[gRes, tRes, sRes, aRes, uRes].map(r => r.status).join(', ')}`);
      }
      const [g, t, s, a, u] = await Promise.all([gRes.json(), tRes.json(), sRes.json(), aRes.json(), uRes.json()]);
      setGames(Array.isArray(g) ? g : []);
      setTournaments(Array.isArray(t) ? t : []);
      setUpcoming(Array.isArray(u) ? u : []);
      setSettings(s && typeof s === 'object' ? s : {});
      setAccounts(Array.isArray(a) ? a : []);

      // Pending games — only available to manage_games; ignore 403
      try {
        const pgRes = await fetch(`${apiBase}/api/admin/startgg/pending-games`, { headers: authHeaders });
        if (pgRes.ok) {
          const pg = await pgRes.json();
          setPendingGames(Array.isArray(pg) ? pg : []);
        }
      } catch (_) {}
    } catch (err) {
      setLoadError(err.message || 'Failed to load admin data. Is the server running?');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="loading">Loading admin panel…</div>;

  if (loadError) return (
    <main className="container admin-container">
      <h1 className="admin-title">ADMIN DASHBOARD</h1>
      <div className="error-msg" style={{ margin: '24px 0' }}>
        {loadError}
        <br /><br />
        <button className="btn-ghost small" onClick={fetchData}>Retry</button>
      </div>
    </main>
  );

  return (
    <main className="container admin-container">
      <h1 className="admin-title">ADMIN DASHBOARD</h1>

      <div className="tabs">
        {visibleTabs.map((t) => (
          <button
            key={t}
            className={`tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'games' && pendingGames.length > 0 && (
              <span className="tab-badge" style={{ marginLeft: 6 }}>{pendingGames.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'tournaments' && (
        <TournamentsTab
          tournaments={tournaments}
          games={games}
          authHeaders={authHeaders}
          onRefresh={fetchData}
        />
      )}
      {tab === 'games' && (
        <GamesTab games={games} pendingGames={pendingGames} authHeaders={authHeaders} onRefresh={fetchData} />
      )}
      {tab === 'accounts' && (
        <AccountsTab
          accounts={accounts}
          currentAdminId={user?.id}
          authHeaders={authHeaders}
          onRefresh={fetchData}
        />
      )}
      {tab === 'upcoming' && (
        <UpcomingTab upcoming={upcoming} games={games} authHeaders={authHeaders} onRefresh={fetchData} />
      )}
      {tab === 'branding' && (
        <BrandingTab settings={settings} authHeaders={authHeaders} onRefresh={fetchData} />
      )}
      {tab === 'integrations' && (
        <IntegrationsTab authHeaders={authHeaders} onRefresh={fetchData} />
      )}
    </main>
  );
}

export default function Admin() {
  return (
    <AdminErrorBoundary>
      <AdminPanel />
    </AdminErrorBoundary>
  );
}
