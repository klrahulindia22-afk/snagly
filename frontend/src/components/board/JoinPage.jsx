import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getJoinPageInfo, createJoinRequest } from "../../api/boards";
import useAuthStore from "../../stores/authStore";

const F = "system-ui,'Segoe UI',sans-serif";

const S = {
  page:  { minHeight: "100vh", background: "linear-gradient(135deg,#0a4a42 0%,#6c63ff 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F, padding: 16 },
  card:  { background: "#fff", borderRadius: 14, padding: "36px 32px", width: "100%", maxWidth: 440, boxShadow: "0 24px 64px rgba(9,30,66,.32)" },
  logo:  { textAlign: "center", marginBottom: 24 },
  mark:  { fontSize: 20, fontWeight: 800, color: "#6c63ff", letterSpacing: -0.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  board: { background: "linear-gradient(135deg,rgba(108,99,255,.08),rgba(108,99,255,.03))", border: "1.5px solid rgba(108,99,255,.2)", borderRadius: 10, padding: "14px 16px", marginBottom: 24, textAlign: "center" },
  bname: { fontSize: 16, fontWeight: 700, color: "#172b4d", marginBottom: 3 },
  bsub:  { fontSize: 12, color: "#5e6c84" },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#5e6c84", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".5px" },
  input: { width: "100%", border: "1.5px solid #dfe1e6", borderRadius: 8, padding: "10px 12px", fontSize: 13, outline: "none", fontFamily: F, boxSizing: "border-box", transition: "border-color .15s", resize: "vertical" },
  btn:   { background: "#6c63ff", color: "#fff", borderRadius: 8, height: 44, width: "100%", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: F, transition: "background .15s", letterSpacing: .2 },
  btnGhost: { background: "none", color: "#6c63ff", borderRadius: 8, height: 44, width: "100%", fontSize: 14, fontWeight: 600, border: "1.5px solid #6c63ff", cursor: "pointer", fontFamily: F, transition: "all .15s", letterSpacing: .2, marginTop: 8 },
  err:   { background: "#fff0f0", border: "1px solid #ffc9c9", borderRadius: 8, padding: "10px 13px", fontSize: 13, color: "#dc2626", marginBottom: 16 },
  userChip: { display: "flex", alignItems: "center", gap: 10, background: "#f8f9fa", border: "1px solid #e9ecef", borderRadius: 8, padding: "10px 12px", marginBottom: 20 },
  muted: { color: "#8993a4", fontSize: 12, textAlign: "center", marginTop: 16 },
};

export default function JoinPage() {
  const { token }  = useParams();
  const navigate   = useNavigate();
  const { user, accessToken } = useAuthStore();
  const isLoggedIn = !!accessToken;

  const [boardInfo, setBoardInfo] = useState(null);
  const [message,   setMessage]   = useState("");
  const [error,     setError]     = useState("");
  // stages: loading | view | submitting | done | error
  const [stage,     setStage]     = useState("loading");

  useEffect(() => {
    getJoinPageInfo(token)
      .then(({ data }) => { setBoardInfo(data); setStage("view"); })
      .catch((e) => {
        setError(e.response?.data?.detail || "This share link is invalid or has been deactivated.");
        setStage("error");
      });
  }, [token]);

  const submit = async () => {
    setStage("submitting");
    setError("");
    try {
      await createJoinRequest(boardInfo.board_id, message.trim() || undefined);
      setStage("done");
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to send request.";
      // Already a member → go straight to the board
      if (err.response?.status === 409 && msg.toLowerCase().includes("already a member")) {
        navigate(`/board/${boardInfo.board_id}`, { replace: true });
        return;
      }
      setError(msg);
      setStage("view");
    }
  };

  const Logo = () => (
    <div style={S.logo}>
      <div style={S.mark}>
        <img src="/favicon.svg" alt="Snagly" style={{ width: 26, height: 26, borderRadius: 6 }} />
        <span>Snagly</span>
      </div>
    </div>
  );

  const BoardCard = () => boardInfo && (
    <div style={S.board}>
      <div style={S.bname}>{boardInfo.board_name}</div>
      <div style={S.bsub}>You've been invited to join this board</div>
    </div>
  );

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (stage === "loading") return (
    <div style={S.page}>
      <div style={{ textAlign: "center", color: "#fff", fontSize: 14, opacity: .8 }}>Loading…</div>
    </div>
  );

  // ── Error (invalid link) ─────────────────────────────────────────────────────
  if (stage === "error") return (
    <div style={S.page}>
      <div style={S.card}>
        <Logo />
        <div style={S.err}>{error}</div>
        <button style={S.btn} onClick={() => navigate("/boards")}>Go to my boards</button>
      </div>
    </div>
  );

  // ── Board is full ─────────────────────────────────────────────────────────────
  if (stage === "view" && boardInfo?.is_full) return (
    <div style={S.page}>
      <div style={S.card}>
        <Logo />
        <BoardCard />
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#172b4d", margin: "0 0 8px" }}>Board is full</h2>
          <p style={{ fontSize: 13, color: "#5e6c84", lineHeight: 1.6, margin: 0 }}>
            This board has reached its member limit
            {boardInfo.max_members ? ` (${boardInfo.member_count}/${boardInfo.max_members} members)` : ""}.
            Ask the board owner to upgrade their plan to add more members.
          </p>
        </div>
        <button style={S.btn} onClick={() => navigate("/boards")}>Go to my boards</button>
      </div>
    </div>
  );

  // ── Success ──────────────────────────────────────────────────────────────────
  if (stage === "done") return (
    <div style={S.page}>
      <div style={S.card}>
        <Logo />
        <BoardCard />
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#172b4d", margin: "0 0 8px" }}>Request sent!</h2>
          <p style={{ fontSize: 13, color: "#5e6c84", lineHeight: 1.6, margin: 0 }}>
            The board owner will review your request. You'll receive a notification once it's approved.
          </p>
        </div>
        <button style={S.btn} onClick={() => navigate("/boards")}>
          Go to my boards
        </button>
      </div>
    </div>
  );

  // ── Not logged in ────────────────────────────────────────────────────────────
  if (!isLoggedIn) return (
    <div style={S.page}>
      <div style={S.card}>
        <Logo />
        <BoardCard />
        <h2 style={{ textAlign: "center", fontSize: 16, fontWeight: 700, color: "#172b4d", margin: "0 0 8px" }}>
          Sign in to request access
        </h2>
        <p style={{ textAlign: "center", fontSize: 13, color: "#5e6c84", margin: "0 0 24px", lineHeight: 1.6 }}>
          You need an account to request to join <strong>{boardInfo?.board_name}</strong>.
        </p>
        <button
          style={S.btn}
          onClick={() => navigate(`/login?next=${encodeURIComponent(`/boards/join/${token}`)}`)}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
        >
          Sign in
        </button>
        <button
          style={S.btnGhost}
          onClick={() => navigate(`/signup?next=${encodeURIComponent(`/boards/join/${token}`)}`)}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(108,99,255,.06)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
        >
          Create account
        </button>
        <p style={S.muted}>Free to use · No credit card required</p>
      </div>
    </div>
  );

  // ── Logged in → request form ──────────────────────────────────────────────────
  const initials = (name) => (name || "U").slice(0, 2).toUpperCase();
  const isSubmitting = stage === "submitting";

  return (
    <div style={S.page}>
      <div style={S.card}>
        <Logo />
        <BoardCard />

        <h2 style={{ textAlign: "center", fontSize: 16, fontWeight: 700, color: "#172b4d", margin: "0 0 6px" }}>
          Request to join
        </h2>
        <p style={{ textAlign: "center", fontSize: 13, color: "#5e6c84", margin: "0 0 20px" }}>
          The board owner will approve your request.
        </p>

        {/* Requesting as chip */}
        <div style={S.userChip}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#6c63ff", color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {initials(user?.full_name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#172b4d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.full_name || "You"}
            </div>
            <div style={{ fontSize: 11, color: "#5e6c84", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.email}
            </div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, color: "#6c63ff", background: "rgba(108,99,255,.1)", borderRadius: 20, padding: "2px 8px", flexShrink: 0 }}>
            You
          </span>
        </div>

        {error && <div style={S.err}>{error}</div>}

        <div style={{ marginBottom: 20 }}>
          <label style={S.label}>Message (optional)</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
            onBlur={(e) => { e.target.style.borderColor = "#dfe1e6"; }}
            placeholder="Introduce yourself or explain why you'd like to join…"
            rows={3}
            style={{ ...S.input, height: "auto" }}
          />
        </div>

        <button
          onClick={submit}
          disabled={isSubmitting}
          style={{ ...S.btn, opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? "not-allowed" : "pointer" }}
          onMouseEnter={(e) => { if (!isSubmitting) e.currentTarget.style.background = "#5b52e0"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
        >
          {isSubmitting ? "Sending request…" : "Request to join"}
        </button>

        <p style={S.muted}>
          Not you?{" "}
          <button
            style={{ background: "none", border: "none", color: "#6c63ff", fontWeight: 600, cursor: "pointer", fontFamily: F, fontSize: 12, textDecoration: "underline", padding: 0 }}
            onClick={() => navigate(`/login?next=${encodeURIComponent(`/boards/join/${token}`)}`)}
          >
            Sign in with a different account
          </button>
        </p>
      </div>
    </div>
  );
}
