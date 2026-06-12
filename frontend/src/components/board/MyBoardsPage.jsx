import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMyBoards } from "../../hooks/useBoard";
import { createBoard, inviteUser } from "../../api/boards";
import { createList } from "../../api/lists";
import useAuthStore from "../../stores/authStore";

const BG_PRESETS_WIZARD = [
  "#0f9e8e", "#0079bf", "#de350b", "#ff991f",
  "#61bd4f", "#00c2e0", "#c377e0", "#0d1f1d",
];

const DEFAULT_COLUMNS = [
  { id: 1, name: "Backlog" },
  { id: 2, name: "Open" },
  { id: 3, name: "In Progress" },
  { id: 4, name: "Review" },
  { id: 5, name: "Closed" },
];

function FirstBoardWizard({ onCreated, onSkip }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [bgColor, setBgColor] = useState("#0f9e8e");
  const [columns, setColumns] = useState(DEFAULT_COLUMNS.map((c) => ({ ...c })));
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("team");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const addColumn = () =>
    setColumns((prev) => [...prev, { id: Date.now(), name: "" }]);

  const removeColumn = (id) =>
    setColumns((prev) => prev.filter((c) => c.id !== id));

  const renameColumn = (id, val) =>
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, name: val } : c)));

  const handleFinish = async () => {
    setSaving(true);
    setError("");
    try {
      const boardRes = await createBoard({
        name: name.trim(),
        description: description.trim() || null,
        bg_color: bgColor,
      });
      const board = boardRes.data;
      const validCols = columns.filter((c) => c.name.trim());
      for (let i = 0; i < validCols.length; i++) {
        await createList(board.id, { name: validCols[i].name.trim(), position: i + 1 });
      }
      if (inviteEmail.trim()) {
        try { await inviteUser(board.id, inviteEmail.trim(), inviteRole); } catch {}
      }
      onCreated(board);
    } catch (e) {
      setError(e.response?.data?.error?.message || "Failed to create board");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1e2435] border border-white/15 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Progress dots */}
        <div className="flex gap-1.5 justify-center pt-5 pb-1">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s === step ? "w-6 bg-[#0f9e8e]" : s < step ? "w-3 bg-[#0f9e8e]/50" : "w-3 bg-white/15"
              }`}
            />
          ))}
        </div>

        <div className="px-6 pb-6 pt-4">
          {/* Step 1: Name + description + colour */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-white font-semibold text-lg">Welcome to Snagly!</h2>
                <p className="text-white/45 text-sm mt-1">Let's set up your first board.</p>
              </div>
              <div>
                <label className="block text-white/50 text-xs mb-1.5">Board name *</label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) setStep(2); }}
                  maxLength={100}
                  placeholder="e.g. Mobile App Bugs"
                  className="w-full bg-white/8 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#0f9e8e] text-sm"
                />
              </div>
              <div>
                <label className="block text-white/50 text-xs mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="What's this board for?"
                  className="w-full bg-white/8 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#0f9e8e] text-sm resize-none"
                />
              </div>
              <div>
                <label className="block text-white/50 text-xs mb-1.5">Colour</label>
                <div className="flex gap-2 flex-wrap">
                  {BG_PRESETS_WIZARD.map((c) => (
                    <button
                      key={c}
                      onClick={() => setBgColor(c)}
                      className="w-8 h-8 rounded-full border-2 transition-all"
                      style={{ backgroundColor: c, borderColor: bgColor === c ? "white" : "transparent" }}
                      aria-label={`Colour ${c}`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex justify-between items-center pt-1">
                <button onClick={onSkip} className="text-white/30 text-xs hover:text-white transition-colors">
                  Skip for now
                </button>
                <button
                  onClick={() => name.trim() && setStep(2)}
                  disabled={!name.trim()}
                  className="px-5 py-2 rounded-xl bg-[#0f9e8e] hover:bg-[#0b8b7f] text-white text-sm font-medium disabled:opacity-40 transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Column setup */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-white font-semibold text-lg">Set up your columns</h2>
                <p className="text-white/45 text-sm mt-1">These are the stages bugs move through. Rename, remove, or add new ones.</p>
              </div>
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {columns.map((col, idx) => (
                  <div key={col.id} className="flex items-center gap-2">
                    <span className="text-white/25 text-xs w-5 text-right shrink-0">{idx + 1}.</span>
                    <input
                      value={col.name}
                      onChange={(e) => renameColumn(col.id, e.target.value)}
                      className="flex-1 bg-white/8 border border-white/15 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-[#0f9e8e]"
                      placeholder="Column name"
                    />
                    <button
                      onClick={() => removeColumn(col.id)}
                      disabled={columns.length <= 1}
                      className="text-white/20 hover:text-red-400 transition-colors text-base leading-none disabled:opacity-20 w-5 shrink-0"
                      aria-label="Remove column"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={addColumn}
                className="text-[#0f9e8e] text-xs hover:text-[#0b8b7f] transition-colors flex items-center gap-1"
              >
                <span className="text-sm leading-none">+</span> Add column
              </button>
              <div className="flex justify-between items-center pt-1">
                <button onClick={() => setStep(1)} className="text-white/40 text-xs hover:text-white transition-colors">
                  ← Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="px-5 py-2 rounded-xl bg-[#0f9e8e] hover:bg-[#0b8b7f] text-white text-sm font-medium transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Invite first member */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-white font-semibold text-lg">Invite a team member</h2>
                <p className="text-white/45 text-sm mt-1">Get your team working faster. You can invite more members later.</p>
              </div>
              <div>
                <label className="block text-white/50 text-xs mb-1.5">Email address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full bg-white/8 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#0f9e8e] text-sm"
                />
              </div>
              <div>
                <label className="block text-white/50 text-xs mb-1.5">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full bg-[#252b3b] border border-white/15 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#0f9e8e]"
                >
                  <option value="team">Team member</option>
                  <option value="client">Client (view only)</option>
                </select>
              </div>
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <div className="flex justify-between items-center pt-1">
                <button onClick={() => setStep(2)} className="text-white/40 text-xs hover:text-white transition-colors">
                  ← Back
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={handleFinish}
                    disabled={saving}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-sm transition-colors disabled:opacity-50"
                  >
                    {saving ? "Creating…" : "Skip"}
                  </button>
                  <button
                    onClick={handleFinish}
                    disabled={saving || !inviteEmail.trim()}
                    className="px-5 py-2 rounded-xl bg-[#0f9e8e] hover:bg-[#0b8b7f] text-white text-sm font-medium disabled:opacity-40 transition-colors"
                  >
                    {saving ? "Creating…" : "Create & invite →"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const BG_PRESETS = [
  "#0f9e8e", "#0d1f1d", "#0079bf", "#de350b",
  "#ff991f", "#61bd4f", "#00c2e0", "#c377e0",
];

function NewBoardModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [bgColor, setBgColor] = useState("#0f9e8e");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await createBoard({ name: name.trim(), description: description.trim() || null, bg_color: bgColor });
      onCreated(res.data);
    } catch (e) {
      setError(e.response?.data?.error?.message || "Failed to create board");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#22283a] rounded-xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-white font-semibold text-lg mb-4">Create Board</h2>

        {/* bg preview */}
        <div
          className="w-full h-20 rounded-lg mb-4 transition-colors"
          style={{ backgroundColor: bgColor }}
        />

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-white/60 text-xs mb-1 block">Board name *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="My bug board"
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#0f9e8e]"
            />
          </div>

          <div>
            <label className="text-white/60 text-xs mb-1 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What's this board for?"
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#0f9e8e] resize-none"
            />
          </div>

          <div>
            <label className="text-white/60 text-xs mb-2 block">Colour</label>
            <div className="flex gap-2 flex-wrap">
              {BG_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBgColor(c)}
                  className="w-8 h-8 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: bgColor === c ? "white" : "transparent",
                  }}
                  aria-label={`Select colour ${c}`}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-3 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-4 py-2 text-sm bg-[#0f9e8e] text-white rounded-lg hover:bg-[#0b8b7f] disabled:opacity-50 transition-colors"
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BoardCard({ board, onClick }) {
  const initials = board.name.slice(0, 2).toUpperCase();
  const roleColors = {
    owner: "bg-purple-500/20 text-purple-300",
    team: "bg-blue-500/20 text-blue-300",
    client: "bg-green-500/20 text-green-300",
  };

  return (
    <button
      onClick={() => onClick(board.id)}
      className="group relative rounded-xl overflow-hidden text-left cursor-pointer border border-white/10 hover:border-white/30 transition-all hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-[#0f9e8e]"
      style={{ background: board.bg_color || "#0d1f1d" }}
    >
      <div className="h-24 flex items-start justify-between p-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm opacity-80"
          style={{ background: "rgba(0,0,0,0.3)" }}
        >
          {initials}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[board.my_role] || "bg-white/10 text-white/60"}`}>
          {board.my_role}
        </span>
      </div>
      <div className="bg-black/40 backdrop-blur-sm p-3">
        <p className="text-white font-medium text-sm truncate">{board.name}</p>
        <p className="text-white/50 text-xs mt-0.5">
          {board.member_count} member{board.member_count !== 1 ? "s" : ""}
        </p>
      </div>
    </button>
  );
}

export default function MyBoardsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { boards, loading, error, reload } = useMyBoards();
  const [showNew, setShowNew] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const handleCreated = (board) => {
    setShowNew(false);
    setShowWizard(false);
    reload();
    navigate(`/board/${board.id}`);
  };

  // Show wizard when boards finish loading and there are none
  const shouldShowWizard = !loading && !error && boards.length === 0 && !showWizard;

  return (
    <div className="min-h-screen bg-[#111827] flex flex-col">
      {/* page header */}
      <div className="border-b border-white/10 bg-[#0d1f1d] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-white font-semibold text-xl">My Boards</h1>
          <p className="text-white/40 text-sm mt-0.5">Welcome back, {user?.full_name?.split(" ")[0]}</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#0f9e8e] text-white rounded-lg text-sm font-medium hover:bg-[#0b8b7f] transition-colors"
        >
          <span className="text-lg leading-none">+</span> New Board
        </button>
      </div>

      {/* content */}
      <div className="flex-1 px-6 py-8">
        {loading ? (
          <div className="text-white/40 text-sm">Loading boards…</div>
        ) : error ? (
          <div className="text-red-400 text-sm">{error}</div>
        ) : boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#0f9e8e]/20 flex items-center justify-center text-3xl">
              📋
            </div>
            <p className="text-white text-lg font-medium">You're not on any boards yet.</p>
            <button
              onClick={() => setShowWizard(true)}
              className="mt-2 text-[#0f9e8e] hover:text-white text-sm font-medium transition-colors hover:underline"
            >
              Create your first board →
            </button>
          </div>
        ) : (
          <>
            <p className="text-white/40 text-xs mb-4 uppercase tracking-wider">
              {boards.length} board{boards.length !== 1 ? "s" : ""}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {boards.map((b) => (
                <BoardCard key={b.id} board={b} onClick={(id) => navigate(`/board/${id}`)} />
              ))}
              <button
                onClick={() => setShowNew(true)}
                className="rounded-xl border-2 border-dashed border-white/20 hover:border-[#0f9e8e] h-[calc(96px+56px)] flex flex-col items-center justify-center gap-2 text-white/40 hover:text-[#0f9e8e] transition-colors"
              >
                <span className="text-3xl leading-none">+</span>
                <span className="text-xs">New board</span>
              </button>
            </div>
          </>
        )}
      </div>

      {showNew && (
        <NewBoardModal onClose={() => setShowNew(false)} onCreated={handleCreated} />
      )}

      {(showWizard || shouldShowWizard) && (
        <FirstBoardWizard
          onCreated={handleCreated}
          onSkip={() => { setShowWizard(false); }}
        />
      )}
    </div>
  );
}
