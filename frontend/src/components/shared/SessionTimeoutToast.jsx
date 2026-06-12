import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../../stores/authStore";
import client from "../../api/client";

function parseJwtExp(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

const WARN_BEFORE_MS = 5 * 60 * 1000; // show 5 min before expiry
const CHECK_INTERVAL = 30 * 1000;     // check every 30s

export default function SessionTimeoutToast() {
  const { accessToken, refreshToken, setTokens, logout } = useAuthStore();
  const [visible, setVisible] = useState(false);
  const [minutesLeft, setMinutesLeft] = useState(null);
  const [renewing, setRenewing] = useState(false);
  const navigate = useNavigate();
  const timerRef = useRef(null);

  useEffect(() => {
    if (!accessToken) { setVisible(false); return; }

    const check = () => {
      const exp = parseJwtExp(accessToken);
      if (!exp) return;
      const remaining = exp - Date.now();
      if (remaining <= 0) {
        logout();
        navigate("/login");
        return;
      }
      if (remaining <= WARN_BEFORE_MS) {
        setMinutesLeft(Math.ceil(remaining / 60000));
        setVisible(true);
      } else {
        setVisible(false);
      }
    };

    check();
    timerRef.current = setInterval(check, CHECK_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [accessToken, logout, navigate]);

  const handleRenew = async () => {
    if (!refreshToken) return;
    setRenewing(true);
    try {
      const res = await client.post("/auth/refresh", { refresh_token: refreshToken });
      const { access_token } = res.data?.data || {};
      if (access_token) {
        setTokens(access_token, refreshToken);
        setVisible(false);
      }
    } catch {
      logout();
      navigate("/login");
    } finally {
      setRenewing(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[300] flex items-center gap-3 bg-[#252b3b] border border-amber-500/40 rounded-xl px-4 py-3 shadow-2xl max-w-sm">
      <span className="text-amber-400 text-lg shrink-0">⏰</span>
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-medium">Session expiring soon</p>
        <p className="text-white/50 text-xs mt-0.5">
          {minutesLeft != null ? `~${minutesLeft} min` : ""} remaining
        </p>
      </div>
      <button
        onClick={handleRenew}
        disabled={renewing}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold transition-colors disabled:opacity-50"
      >
        {renewing ? "Renewing…" : "Stay signed in"}
      </button>
      <button
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="text-white/20 hover:text-white transition-colors text-sm leading-none shrink-0"
      >
        ✕
      </button>
    </div>
  );
}
