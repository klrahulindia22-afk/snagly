import { useState, useEffect } from "react";
import { getBoardMembers } from "../../api/boards";
import { addAssignee, removeAssignee } from "../../api/cards";

export default function MembersPanel({ boardId, cardId, cardAssignees = [], onClose, onCardUpdated }) {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");

  const assignedIds = new Set((cardAssignees || []).map((a) => a.user_id));

  useEffect(() => {
    getBoardMembers(boardId).then((r) => setMembers(r.data || []));
  }, [boardId]);

  const filtered = members.filter((m) =>
    !search || m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.email?.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = async (member) => {
    if (assignedIds.has(member.user_id)) {
      await removeAssignee(cardId, member.user_id);
    } else {
      await addAssignee(cardId, member.user_id);
    }
    onCardUpdated?.();
  };

  return (
    <div className="w-64 bg-[#1e2435] border border-white/10 rounded-xl shadow-2xl p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white text-xs font-semibold">Members</h3>
        <button onClick={onClose} className="text-white/40 hover:text-white text-xs">✕</button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search members…"
        className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-white text-xs placeholder-white/30 focus:outline-none focus:border-[#0f9e8e] mb-2"
      />

      <div className="space-y-1 max-h-60 overflow-y-auto">
        {filtered.map((member) => {
          const isAssigned = assignedIds.has(member.user_id);
          const initials = member.full_name.slice(0, 2).toUpperCase();
          return (
            <button
              key={member.user_id}
              onClick={() => toggle(member)}
              className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors ${
                isAssigned ? "bg-white/15" : "hover:bg-white/10"
              }`}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                style={{ backgroundColor: member.initials_color || "#0f9e8e" }}
              >
                {initials}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-white text-xs font-medium truncate">{member.full_name}</p>
                <p className="text-white/40 text-[10px] truncate">{member.role}</p>
              </div>
              {isAssigned && (
                <svg className="w-3.5 h-3.5 text-[#0f9e8e] shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-white/30 text-xs px-1 py-2">No members found</p>
        )}
      </div>
    </div>
  );
}
