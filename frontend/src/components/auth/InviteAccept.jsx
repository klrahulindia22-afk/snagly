import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { acceptInvite } from "../../api/boards";
import useAuthStore from "../../stores/authStore";

export default function InviteAccept() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const { setTokens, setUser, isAuthenticated } = useAuthStore();

  const [isNew, setIsNew] = useState(false);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!token) {
      setError("Invalid invite link.");
      setChecking(false);
      return;
    }
    // If already logged in, try to accept directly
    if (isAuthenticated) {
      acceptInvite(token, undefined, undefined)
        .then((res) => {
          navigate(res.data.board_id ? `/board/${res.data.board_id}` : "/boards");
        })
        .catch((e) => {
          const msg = e.response?.data?.error?.message || "Failed to accept invite.";
          // Might be a new user link sent to a different email
          if (e.response?.status === 400 && msg.includes("New users")) {
            setIsNew(true);
          } else {
            setError(msg);
          }
          setChecking(false);
        });
    } else {
      setChecking(false);
      setIsNew(true);
    }
  }, [token, isAuthenticated, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await acceptInvite(token, isNew ? fullName : undefined, isNew ? password : undefined);
      setTokens(res.data.access_token, res.data.refresh_token);
      setUser(res.data.user);
      navigate(res.data.board_id ? `/board/${res.data.board_id}` : "/boards");
    } catch (e) {
      setError(e.response?.data?.error?.message || "Failed to accept invite.");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#111827] flex items-center justify-center text-white/40">
        Validating invite…
      </div>
    );
  }

  if (!token || (error && !isNew)) {
    return (
      <div className="min-h-screen bg-[#111827] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-4">{error || "Invalid invite link."}</p>
          <a href="/login" className="text-[#0f9e8e] text-sm hover:underline">Go to login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111827] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-[#0f9e8e] flex items-center justify-center text-white text-xl font-bold mx-auto mb-4">B</div>
          <h1 className="text-white text-2xl font-semibold">You're invited!</h1>
          <p className="text-white/50 text-sm mt-2">Create your account to join the board.</p>
        </div>

        <div className="bg-[#0d1f1d] rounded-2xl p-8 shadow-2xl">
          <form onSubmit={submit} className="space-y-4">
            {isNew && (
              <>
                <div>
                  <label className="text-white/60 text-xs mb-1 block">Full name</label>
                  <input
                    autoFocus
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Doe"
                    required
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#0f9e8e]"
                  />
                </div>
                <div>
                  <label className="text-white/60 text-xs mb-1 block">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    required
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#0f9e8e]"
                  />
                </div>
              </>
            )}

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#0f9e8e] text-white rounded-lg font-medium hover:bg-[#0b8b7f] disabled:opacity-50 transition-colors text-sm"
            >
              {loading ? "Joining…" : "Accept & Join"}
            </button>
          </form>
        </div>

        <p className="text-center text-white/30 text-xs mt-4">
          Already have an account?{" "}
          <a href="/login" className="text-[#0f9e8e] hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  );
}
