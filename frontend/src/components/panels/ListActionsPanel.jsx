import { useState } from "react";
import {
  archiveList,
  updateList,
  toggleAutomationRule,
  createAutomationRule,
} from "../../api/lists";

const AUTOMATION_RULE_TYPES = [
  {
    type: "wip_limit_notify",
    label: "Notify when WIP limit reached",
    description: "Send a notification when this list reaches its card limit",
  },
  {
    type: "auto_archive_on_move",
    label: "Archive card when moved away",
    description: "Automatically archive cards when they leave this list",
  },
  {
    type: "auto_assign_on_move",
    label: "Keep assignee when moved here",
    description: "Preserve card assignees when cards are moved to this list",
  },
  {
    type: "notify_on_new_card",
    label: "Notify members on new card",
    description: "Alert all board members when a card is added to this list",
  },
];

function RenameSection({ list, boardId, onUpdated, onClose }) {
  const [name, setName] = useState(list.name);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || name === list.name) { onClose(); return; }
    setSaving(true);
    try {
      const res = await updateList(boardId, list.id, { name: name.trim() });
      onUpdated(res.data);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 bg-white/5 rounded-lg space-y-2">
      <p className="text-white/60 text-xs">Rename list</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onClose(); }}
        className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-[#0f9e8e]"
      />
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1 bg-[#0f9e8e] text-white rounded text-xs hover:bg-[#0b8b7f] disabled:opacity-50"
        >
          Save
        </button>
        <button onClick={onClose} className="px-3 py-1 text-white/50 hover:text-white text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}

function WipSection({ list, boardId, onUpdated, onClose }) {
  const [limit, setLimit] = useState(list.wip_limit ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const val = limit === "" ? null : parseInt(limit, 10);
      const res = await updateList(boardId, list.id, { wip_limit: val });
      onUpdated(res.data);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 bg-white/5 rounded-lg space-y-2">
      <p className="text-white/60 text-xs">WIP limit (leave blank to disable)</p>
      <input
        type="number"
        min="1"
        value={limit}
        onChange={(e) => setLimit(e.target.value)}
        placeholder="e.g. 5"
        className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-[#0f9e8e]"
      />
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1 bg-[#0f9e8e] text-white rounded text-xs hover:bg-[#0b8b7f] disabled:opacity-50"
        >
          Save
        </button>
        <button onClick={onClose} className="px-3 py-1 text-white/50 hover:text-white text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ColorSection({ list, boardId, onUpdated, onClose }) {
  const colors = ["#0f9e8e","#0079bf","#de350b","#ff991f","#61bd4f","#00c2e0","#c377e0","#8993a4","#f2d600",null];
  const [selected, setSelected] = useState(list.color);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await updateList(boardId, list.id, { color: selected });
      onUpdated(res.data);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 bg-white/5 rounded-lg space-y-2">
      <p className="text-white/60 text-xs">List colour</p>
      <div className="flex flex-wrap gap-2">
        {colors.map((c, i) => (
          <button
            key={i}
            onClick={() => setSelected(c)}
            title={c || "None"}
            className="w-7 h-7 rounded-full border-2 transition-all"
            style={{
              backgroundColor: c || "transparent",
              borderColor: selected === c ? "white" : c ? "transparent" : "rgba(255,255,255,0.3)",
              boxShadow: !c ? "inset 0 0 0 1px rgba(255,255,255,0.2)" : "none",
            }}
            aria-label={c ? `Set colour ${c}` : "Remove colour"}
          >
            {!c && <span className="text-white/40 text-xs">✕</span>}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1 bg-[#0f9e8e] text-white rounded text-xs hover:bg-[#0b8b7f] disabled:opacity-50"
        >
          Save
        </button>
        <button onClick={onClose} className="px-3 py-1 text-white/50 hover:text-white text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}

function AutomationSection({ list, boardId, onUpdated }) {
  const rules = list.automation_rules || [];
  const [toggling, setToggling] = useState(null);

  const getRule = (type) => rules.find((r) => r.rule_type === type);

  const toggle = async (type) => {
    setToggling(type);
    try {
      const existing = getRule(type);
      if (existing) {
        await toggleAutomationRule(boardId, list.id, existing.id, !existing.is_active);
      } else {
        await createAutomationRule(boardId, list.id, { rule_type: type });
      }
      // Reload list data
      const { getLists } = await import("../../api/lists");
      const res = await getLists(boardId);
      const updated = res.data?.find((l) => l.id === list.id);
      if (updated) onUpdated(updated);
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="space-y-2">
      {AUTOMATION_RULE_TYPES.map(({ type, label, description }) => {
        const rule = getRule(type);
        const isActive = rule?.is_active ?? false;
        return (
          <div key={type} className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/5">
            <button
              onClick={() => toggle(type)}
              disabled={toggling === type}
              className={`mt-0.5 w-9 h-5 rounded-full transition-colors shrink-0 relative ${
                isActive ? "bg-[#0f9e8e]" : "bg-white/20"
              }`}
              aria-label={label}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                  isActive ? "left-4" : "left-0.5"
                }`}
              />
            </button>
            <div>
              <p className="text-white text-xs font-medium">{label}</p>
              <p className="text-white/40 text-xs">{description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ListActionsPanel({ list, boardId, myRole, onUpdated, onArchive, onClose }) {
  const [activeSection, setActiveSection] = useState(null);
  const [archiving, setArchiving] = useState(false);

  const canEdit = myRole !== "client";

  const doArchive = async () => {
    if (!window.confirm(`Archive "${list.name}"? Cards will remain and can be restored.`)) return;
    setArchiving(true);
    try {
      await archiveList(boardId, list.id);
      onArchive(list.id);
      onClose();
    } finally {
      setArchiving(false);
    }
  };

  const actions = [
    { id: "rename", label: "Rename list", icon: "✏️", editorOnly: true },
    { id: "wip", label: "Set WIP limit", icon: "🔢", editorOnly: true },
    { id: "color", label: "Change colour", icon: "🎨", editorOnly: true },
    { id: "sort_name", label: "Sort by name", icon: "🔤", editorOnly: false },
    { id: "sort_date", label: "Sort by date", icon: "📅", editorOnly: false },
    { id: "archive_cards", label: "Archive all cards", icon: "📦", editorOnly: true },
    { id: "move_cards", label: "Move all cards…", icon: "↔️", editorOnly: true },
    { id: "archive_list", label: "Archive this list", icon: "🗄️", editorOnly: true, danger: true },
  ];

  return (
    <div className="w-64 bg-[#2d3348] rounded-xl shadow-2xl border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <p className="text-white text-sm font-medium truncate">{list.name}</p>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white transition-colors text-lg leading-none ml-2"
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      <div className="p-2 space-y-0.5">
        {actions.map((action) => {
          if (action.editorOnly && !canEdit) return null;
          if (action.id === "archive_list") {
            return (
              <div key={action.id}>
                {activeSection !== action.id ? (
                  <button
                    onClick={doArchive}
                    disabled={archiving}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 text-sm text-left transition-colors"
                  >
                    <span>{action.icon}</span>
                    <span>{archiving ? "Archiving…" : action.label}</span>
                  </button>
                ) : null}
              </div>
            );
          }
          return (
            <button
              key={action.id}
              onClick={() => setActiveSection(activeSection === action.id ? null : action.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                activeSection === action.id
                  ? "bg-white/10 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span>{action.icon}</span>
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>

      {activeSection === "rename" && (
        <div className="px-3 pb-3">
          <RenameSection list={list} boardId={boardId} onUpdated={onUpdated} onClose={() => setActiveSection(null)} />
        </div>
      )}
      {activeSection === "wip" && (
        <div className="px-3 pb-3">
          <WipSection list={list} boardId={boardId} onUpdated={onUpdated} onClose={() => setActiveSection(null)} />
        </div>
      )}
      {activeSection === "color" && (
        <div className="px-3 pb-3">
          <ColorSection list={list} boardId={boardId} onUpdated={onUpdated} onClose={() => setActiveSection(null)} />
        </div>
      )}

      {/* Automation section always visible at the bottom */}
      {canEdit && (
        <div className="border-t border-white/10 px-3 py-3">
          <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Automation</p>
          <AutomationSection list={list} boardId={boardId} onUpdated={onUpdated} />
        </div>
      )}
    </div>
  );
}
