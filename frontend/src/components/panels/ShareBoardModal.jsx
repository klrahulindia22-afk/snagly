import { useState, useEffect } from "react";
import {
  inviteUser,
  getBoardInvites,
  createShareLink,
  deactivateShareLink,
  getShareLink,
  listJoinRequests,
  reviewJoinRequest,
} from "../../api/boards";

const TABS = ["Invite", "Share link", "Join requests"];

function InviteTab({ boardId, boardMembers }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("team");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [invites, setInvites] = useState([]);

  useEffect(() => {
    getBoardInvites(boardId)
      .then((r) => setInvites(r.data || []))
      .catch(() => {});
  }, [boardId]);

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    setError("");
    setSuccess("");
    try {
      await inviteUser(boardId, email, role);
      setSuccess(`Invite sent to ${email}`);
      setEmail("");
      const r = await getBoardInvites(boardId);
      setInvites(r.data || []);
    } catch (e) {
      setError(e.response?.data?.error?.message || "Failed to send invite.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={send} className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-white/50 text-xs mb-1 block">Email address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="teammate@example.com"
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#0f9e8e]"
          />
        </div>
        <div>
          <label className="text-white/50 text-xs mb-1 block">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#0f9e8e]"
          >
            <option value="team">Team</option>
            <option value="client">Client</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={sending || !email}
          className="px-4 py-2 bg-[#0f9e8e] text-white rounded-lg text-sm font-medium hover:bg-[#0b8b7f] disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {sending ? "Sending…" : "Send invite"}
        </button>
      </form>

      {success && <p className="text-green-400 text-xs">{success}</p>}
      {error && <p className="text-red-400 text-xs">{error}</p>}

      {invites.length > 0 && (
        <div>
          <p className="text-white/40 text-xs mb-2 uppercase tracking-wide">Pending invites</p>
          <div className="space-y-1">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                <span className="text-white text-sm truncate">{inv.email}</span>
                <span className="text-white/40 text-xs ml-2 shrink-0">{inv.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {boardMembers.length > 0 && (
        <div>
          <p className="text-white/40 text-xs mb-2 uppercase tracking-wide">Current members</p>
          <div className="space-y-1">
            {boardMembers.map((m) => (
              <div key={m.user_id} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                  style={{ backgroundColor: m.initials_color || "#0f9e8e" }}
                >
                  {m.full_name.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-white text-sm truncate flex-1">{m.full_name}</span>
                <span className="text-white/40 text-xs">{m.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ShareLinkTab({ boardId }) {
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getShareLink(boardId)
      .then((r) => setLink(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [boardId]);

  const generate = async () => {
    setWorking(true);
    try {
      const r = await createShareLink(boardId);
      setLink(r.data);
    } finally {
      setWorking(false);
    }
  };

  const deactivate = async () => {
    setWorking(true);
    try {
      await deactivateShareLink(boardId);
      setLink(null);
    } finally {
      setWorking(false);
    }
  };

  const copy = () => {
    if (!link?.url) return;
    navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <p className="text-white/40 text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <p className="text-white/60 text-sm">
        Anyone with this link can request to join the board.
      </p>

      {link ? (
        <>
          <div className="flex gap-2">
            <input
              readOnly
              value={link.url}
              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-xs focus:outline-none"
            />
            <button
              onClick={copy}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            onClick={deactivate}
            disabled={working}
            className="text-red-400 text-xs hover:text-red-300 transition-colors"
          >
            Deactivate link
          </button>
        </>
      ) : (
        <button
          onClick={generate}
          disabled={working}
          className="px-4 py-2 bg-[#0f9e8e] text-white rounded-lg text-sm font-medium hover:bg-[#0b8b7f] disabled:opacity-50 transition-colors"
        >
          {working ? "Generating…" : "Generate share link"}
        </button>
      )}
    </div>
  );
}

function JoinRequestsTab({ boardId }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(null);

  const load = () => {
    listJoinRequests(boardId)
      .then((r) => setRequests(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [boardId]);

  const review = async (reqId, status) => {
    setWorking(reqId);
    try {
      await reviewJoinRequest(boardId, reqId, status);
      load();
    } finally {
      setWorking(null);
    }
  };

  if (loading) return <p className="text-white/40 text-sm">Loading…</p>;

  if (requests.length === 0) {
    return (
      <p className="text-white/40 text-sm text-center py-8">No pending join requests.</p>
    );
  }

  return (
    <div className="space-y-2">
      {requests.map((r) => (
        <div key={r.id} className="bg-white/5 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-white text-sm font-medium">{r.full_name}</span>
            <span className="text-white/40 text-xs">{r.email}</span>
          </div>
          {r.message && <p className="text-white/50 text-xs mb-2 italic">"{r.message}"</p>}
          <div className="flex gap-2">
            <button
              onClick={() => review(r.id, "approved")}
              disabled={working === r.id}
              className="px-3 py-1 bg-green-600/20 text-green-400 rounded text-xs hover:bg-green-600/30 transition-colors disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => review(r.id, "declined")}
              disabled={working === r.id}
              className="px-3 py-1 bg-red-600/20 text-red-400 rounded text-xs hover:bg-red-600/30 transition-colors disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ShareBoardModal({ boardId, boardMembers = [], onClose }) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#22283a] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-0">
          <h2 className="text-white font-semibold">Share Board</h2>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* tabs */}
        <div className="flex gap-1 px-5 mt-4 border-b border-white/10">
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => setActiveTab(i)}
              className={`px-3 py-2 text-sm rounded-t-lg transition-colors ${
                activeTab === i
                  ? "text-white border-b-2 border-[#0f9e8e] -mb-px"
                  : "text-white/50 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 0 && <InviteTab boardId={boardId} boardMembers={boardMembers} />}
          {activeTab === 1 && <ShareLinkTab boardId={boardId} />}
          {activeTab === 2 && <JoinRequestsTab boardId={boardId} />}
        </div>
      </div>
    </div>
  );
}
