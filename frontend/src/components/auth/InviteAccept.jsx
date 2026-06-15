import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getInviteInfo, acceptInvite } from "../../api/boards";
import useAuthStore from "../../stores/authStore";

const F = "system-ui,'Segoe UI',sans-serif";

const S = {
  page:  { minHeight: "100vh", background: "linear-gradient(135deg,#0a4a42 0%,#6c63ff 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F, padding: 16 },
  card:  { background: "#fff", borderRadius: 12, padding: "36px 32px", width: "100%", maxWidth: 420, boxShadow: "0 8px 32px rgba(9,30,66,.28)" },
  logo:  { textAlign: "center", marginBottom: 20 },
  mark:  { fontSize: 20, fontWeight: 800, color: "#6c63ff", letterSpacing: -1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  board: { background: "#f4f5f7", borderRadius: 8, padding: "10px 14px", marginBottom: 20, textAlign: "center" },
  bname: { fontSize: 14, fontWeight: 700, color: "#172b4d" },
  bsub:  { fontSize: 12, color: "#5e6c84", marginTop: 2 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#5e6c84", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".5px" },
  input: { width: "100%", height: 44, border: "2px solid #dfe1e6", borderRadius: 6, padding: "0 12px", fontSize: 14, outline: "none", fontFamily: F, boxSizing: "border-box", transition: "border-color .15s" },
  inputDisabled: { width: "100%", height: 44, border: "2px solid #dfe1e6", borderRadius: 6, padding: "0 12px", fontSize: 14, outline: "none", fontFamily: F, boxSizing: "border-box", background: "#f8f9fa", color: "#6c757d", cursor: "not-allowed" },
  btn:   { background: "#6c63ff", color: "#fff", borderRadius: 6, height: 44, width: "100%", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: F, marginTop: 4, transition: "opacity .15s" },
  err:   { background: "#ffebe6", border: "1px solid #ff8f73", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#de350b", marginBottom: 12 },
  link:  { color: "#6c63ff", fontWeight: 600, cursor: "pointer", background: "none", border: "none", fontFamily: F, fontSize: 13, textDecoration: "underline" },
  muted: { color: "#8993a4", fontSize: 12, textAlign: "center", marginTop: 16 },
};

export default function InviteAccept() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const token      = params.get("token") || "";

  // Use accessToken directly — isAuthenticated is a function in the store, not a boolean
  const { user, accessToken, logout, setAuth } = useAuthStore();
  const isLoggedIn = !!accessToken;

  const [inviteEmail, setInviteEmail] = useState("");
  const [boardName,   setBoardName]   = useState("");
  const [isNewUser,   setIsNewUser]   = useState(false);  // false = existing user
  const [fullName,    setFullName]    = useState("");
  const [password,    setPassword]    = useState("");
  const [error,       setError]       = useState("");
  const [loading,     setLoading]     = useState(false);
  // stages: "loading" | "accepting" | "form" | "error"
  const [stage, setStage] = useState("loading");

  // Prevent StrictMode double-accept
  const acceptedRef = useRef(false);

  const extractErr = (e) =>
    e.response?.data?.detail || e.response?.data?.error?.message || "Something went wrong.";

  // Auto-accept for an already-logged-in user (no password needed — Bearer token proves identity)
  const doAutoAccept = () => {
    if (acceptedRef.current) return;
    acceptedRef.current = true;
    setStage("accepting");

    acceptInvite(token, undefined, undefined)
      .then(({ data: d }) => {
        setAuth(d.access_token, d.refresh_token, d.user);
        navigate(d.board_id ? `/board/${d.board_id}` : "/boards", { replace: true });
      })
      .catch((e) => {
        acceptedRef.current = false;
        setError(extractErr(e));
        setStage("form");
      });
  };

  useEffect(() => {
    if (!token) {
      setError("Invalid invite link.");
      setStage("error");
      return;
    }

    let cancelled = false;

    getInviteInfo(token)
      .then(({ data }) => {
        if (cancelled) return;

        setInviteEmail(data.email);
        setBoardName(data.board_name || "");
        setIsNewUser(data.is_new_user);

        const inviteEmailLC = data.email.toLowerCase();
        const loggedInEmailLC = user?.email?.toLowerCase() || "";

        // Wrong user is logged in → silently log them out, show the appropriate form
        if (isLoggedIn && loggedInEmailLC !== inviteEmailLC) {
          logout();
          setStage("form");
          return;
        }

        // Correct user already logged in → auto-accept (Bearer token sent by client.js)
        if (isLoggedIn && !data.is_new_user) {
          doAutoAccept();
          return;
        }

        // All other cases (not logged in, new or existing) → show the form
        setStage("form");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(extractErr(e));
        setStage("error");
      });

    return () => { cancelled = true; };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      // New users send full_name + password; existing users send password only
      const { data } = await acceptInvite(
        token,
        isNewUser ? fullName.trim() : undefined,
        password,
      );
      setAuth(data.access_token, data.refresh_token, data.user);
      navigate(data.board_id ? `/board/${data.board_id}` : "/boards", { replace: true });
    } catch (ex) {
      setError(extractErr(ex));
    } finally {
      setLoading(false);
    }
  };

  const focusIn  = (e) => { e.target.style.borderColor = "#6c63ff"; };
  const focusOut = (e) => { e.target.style.borderColor = "#dfe1e6"; };

  // ── Loading / auto-accepting spinner ────────────────────────────────────────
  if (stage === "loading" || stage === "accepting") {
    return (
      <div style={S.page}>
        <div style={{ textAlign: "center", color: "#fff", fontSize: 14, opacity: .85 }}>
          {stage === "accepting" ? "Joining the board…" : "Validating invite…"}
        </div>
      </div>
    );
  }

  // ── Fatal error (bad/expired token) ─────────────────────────────────────────
  if (stage === "error") {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.logo}><div style={S.mark}>Snagly</div></div>
          <div style={S.err}>{error || "Invalid invite link."}</div>
          <div style={{ textAlign: "center" }}>
            <button style={S.link} onClick={() => navigate("/login")}>Go to login</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form: new user (create account) vs existing user (login to accept) ──────
  const canSubmitNew      = fullName.trim().length > 0 && password.length >= 8 && !loading;
  const canSubmitExisting = password.length >= 1 && !loading;
  const canSubmit         = isNewUser ? canSubmitNew : canSubmitExisting;

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>
          <div style={S.mark}>
            <img src="/favicon.svg" alt="Snagly" style={{ width: 26, height: 26, borderRadius: 6 }} />
            <span>Snagly</span>
          </div>
        </div>

        {boardName && (
          <div style={S.board}>
            <div style={S.bname}>{boardName}</div>
            <div style={S.bsub}>You've been invited to this board</div>
          </div>
        )}

        {isNewUser ? (
          <>
            <h2 style={{ textAlign: "center", color: "#172b4d", fontWeight: 700, fontSize: 17, marginBottom: 4 }}>
              Create your account
            </h2>
            <p style={{ textAlign: "center", color: "#5e6c84", fontSize: 13, marginBottom: 20 }}>
              Invite sent to <strong>{inviteEmail}</strong>
            </p>
          </>
        ) : (
          <>
            <h2 style={{ textAlign: "center", color: "#172b4d", fontWeight: 700, fontSize: 17, marginBottom: 4 }}>
              Sign in to accept
            </h2>
            <p style={{ textAlign: "center", color: "#5e6c84", fontSize: 13, marginBottom: 20 }}>
              Enter your password to join the board
            </p>
          </>
        )}

        {error && <div style={S.err}>{error}</div>}

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Email — always shown, always read-only (the invite is for this email) */}
          <div>
            <label style={S.label}>Email</label>
            <input
              type="email"
              value={inviteEmail}
              readOnly
              style={S.inputDisabled}
            />
          </div>

          {/* Name — only for new users */}
          {isNewUser && (
            <div>
              <label style={S.label}>Full name</label>
              <input
                autoFocus
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onFocus={focusIn}
                onBlur={focusOut}
                placeholder="Jane Doe"
                required
                style={S.input}
              />
            </div>
          )}

          {/* Password — always required */}
          <div>
            <label style={S.label}>Password</label>
            <input
              type="password"
              autoFocus={!isNewUser}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={focusIn}
              onBlur={focusOut}
              placeholder={isNewUser ? "Minimum 8 characters" : "Your password"}
              required
              minLength={isNewUser ? 8 : 1}
              style={S.input}
            />
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            style={{ ...S.btn, opacity: canSubmit ? 1 : .45, cursor: canSubmit ? "pointer" : "not-allowed" }}
          >
            {loading
              ? (isNewUser ? "Creating account…" : "Signing in…")
              : (isNewUser ? "Accept & Join" : "Sign in & Join")}
          </button>
        </form>

        <p style={S.muted}>
          {isNewUser ? (
            <>
              Already have an account?{" "}
              <button
                style={S.link}
                onClick={() => navigate(`/login?next=${encodeURIComponent(`/invite/accept?token=${token}`)}`)}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              Forgot your password?{" "}
              <button
                style={S.link}
                onClick={() => navigate("/forgot-password")}
              >
                Reset it
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
