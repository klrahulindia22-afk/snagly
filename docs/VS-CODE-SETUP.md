# BugTrack — VS Code + Claude Code Setup Guide

Complete step-by-step guide to setting up and using Claude Code with VS Code on Windows.

---

## Part 1 — Prerequisites (One-time)

### Step 1: Install Node.js
1. Go to https://nodejs.org → download the **LTS** version (22.x)
2. Run the installer, accept all defaults
3. Open CMD and verify:
   ```
   node --version
   npm --version
   ```
   Both should print a version number.

### Step 2: Install Python 3.11+
1. Go to https://python.org/downloads → download Python 3.11 or 3.12
2. **Important:** tick "Add Python to PATH" on the first installer screen
3. Verify in CMD:
   ```
   python --version
   pip --version
   ```

### Step 3: Install MySQL 8
1. Go to https://dev.mysql.com/downloads/mysql/ → download MySQL Community Server 8.x
2. Run installer → choose "Developer Default" setup
3. Set a root password — write it down
4. Verify in CMD:
   ```
   mysql --version
   ```

### Step 4: Install Git
1. Go to https://git-scm.com → download for Windows
2. Accept all defaults
3. Verify:
   ```
   git --version
   ```

### Step 5: Install VS Code
1. Go to https://code.visualstudio.com → download
2. Install with defaults
3. Open VS Code → install these extensions (Ctrl+Shift+X):
   - **Claude Code** (by Anthropic) — this is the main one
   - **ESLint**
   - **Tailwind CSS IntelliSense**
   - **Python** (by Microsoft)
   - **Pylance**
   - **MySQL Shell for VS Code** (optional, for DB browsing)

### Step 6: Install Claude Code CLI
Open CMD (not PowerShell — important on Windows):
```
npm install -g @anthropic-ai/claude-code
```
Verify:
```
claude --version
```
If you get "execution policy" errors, use CMD instead of PowerShell, or run:
```
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

---

## Part 2 — Project Setup

### Step 7: Create the project folder
```
mkdir C:\Projects\bugtrack
cd C:\Projects\bugtrack
git init
```

### Step 8: Copy your project files
Copy these two files into `C:\Projects\bugtrack\`:
- `CLAUDE.md` (the guide you just received)
- `docs\PRD.md` (create the `docs` folder first)

```
mkdir docs
```
Then copy `PRD.md` into the `docs` folder.

### Step 9: Open the project in VS Code
```
code C:\Projects\bugtrack
```

Or: File → Open Folder → select `C:\Projects\bugtrack`

### Step 10: Create the frontend project
In VS Code, open the **Terminal** (Ctrl+` backtick):
```
npm create vite@latest frontend -- --template react
cd frontend
npm install
npm install tailwindcss@3 postcss autoprefixer @dnd-kit/core recharts axios zustand react-router-dom
npx tailwindcss init -p
```

### Step 11: Create the backend project
Back in the terminal, go to root:
```
cd C:\Projects\bugtrack
mkdir backend
cd backend
python -m venv venv
venv\Scripts\activate
pip install fastapi uvicorn[standard] sqlalchemy[asyncio] aiomysql alembic python-jose[cryptography] passlib[bcrypt] python-multipart aiosmtplib httpx pydantic-settings cryptography python-dotenv
pip freeze > requirements.txt
```

### Step 12: Create the MySQL database
Open CMD (new window):
```
mysql -u root -p
```
Enter your root password, then run:
```sql
CREATE DATABASE bugtrack CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'bugtrack'@'localhost' IDENTIFIED BY 'bugtrack123';
GRANT ALL PRIVILEGES ON bugtrack.* TO 'bugtrack'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Step 13: Create the `.env` file
In `C:\Projects\bugtrack\backend\`, create a file called `.env`:
```
APP_SECRET_KEY=your-secret-key-here
APP_ENV=development
FRONTEND_URL=http://localhost:5173

DB_URL=mysql+aiomysql://bugtrack:bugtrack123@localhost:3306/bugtrack

JWT_ACCESS_EXPIRE_MINUTES=15
JWT_REFRESH_EXPIRE_DAYS=7

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=noreply@bugtrack.app

UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=10

ENCRYPTION_KEY=
DEFAULT_TIMEZONE=Europe/Berlin
```

To generate the `ENCRYPTION_KEY`, run in the backend venv:
```
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
Paste the output as the `ENCRYPTION_KEY` value.

---

## Part 3 — Using Claude Code in VS Code

### Step 14: Open Claude Code
In VS Code:
- Press **Ctrl+Shift+P** → type "Claude Code" → select "Open Claude Code"
- Or: click the Claude icon in the left sidebar

### Step 15: Authenticate Claude Code
First time only:
```
claude login
```
It opens a browser window — log in with your Anthropic account.

### Step 16: How to give Claude Code tasks

Claude Code reads your `CLAUDE.md` file automatically when you run it from the project folder. Always start Claude Code from `C:\Projects\bugtrack\`.

**Example prompts to start building:**

For Phase 1 (scaffolding):
```
Read CLAUDE.md and the PRD at docs/PRD.md. Then set up the backend FastAPI project structure: create main.py, config.py, database.py, and the folder structure as described in CLAUDE.md §4. Do not write any database models yet. Follow all rules in §2.
```

For Phase 2 (auth):
```
Read CLAUDE.md §6 Phase 2. Build the complete auth system: User model, Alembic migration, and these endpoints: POST /api/v1/auth/login, POST /api/v1/auth/refresh, POST /api/v1/auth/forgot-password, POST /api/v1/auth/reset-password. Follow all security rules in CLAUDE.md §10.
```

For frontend auth:
```
Read CLAUDE.md §6 Phase 2. Build the frontend auth: LoginPage component, Zustand auth store, axios client with JWT interceptor and auto-refresh on 401. Use React Router v6. Tailwind CSS only. No TypeScript.
```

### Step 17: Tips for working with Claude Code

**Always start with context:**
> "Read CLAUDE.md first, then do the following task..."

**Be specific about what phase you're in:**
> "We are on Phase 4 — Boards. Build the Board model and POST /boards endpoint."

**Check the work after each phase:**
> "Review the code you just wrote against the security checklist in CLAUDE.md §10."

**If something goes wrong:**
> "Something is broken. Read CLAUDE.md §2 rule 3 and check if any integration token is being returned in the API response."

**Ask for a test before moving on:**
> "Before we move to Phase 5, write a quick test I can run in CMD to verify the invite email is sending."

---

## Part 4 — Running the Project (Daily workflow)

### Start the backend
```
cd C:\Projects\bugtrack\backend
venv\Scripts\activate
uvicorn main:app --reload --port 8000
```
API docs: http://localhost:8000/docs

### Start the frontend
Open a second terminal:
```
cd C:\Projects\bugtrack\frontend
npm run dev
```
App: http://localhost:5173

### Run database migrations (after model changes)
```
cd C:\Projects\bugtrack\backend
venv\Scripts\activate
alembic revision --autogenerate -m "describe what changed"
alembic upgrade head
```

---

## Part 5 — Project File Checklist

Before asking Claude Code to build anything, confirm these files exist:

| File | Location | Status |
|------|----------|--------|
| `CLAUDE.md` | `C:\Projects\bugtrack\` | ✅ Copy it in |
| `PRD.md` | `C:\Projects\bugtrack\docs\` | ✅ Copy it in |
| `.env` | `C:\Projects\bugtrack\backend\` | ✅ Create it (Step 13) |
| `.gitignore` | `C:\Projects\bugtrack\` | Create it (below) |

### `.gitignore` content
Create `C:\Projects\bugtrack\.gitignore`:
```
# Python
backend/venv/
backend/__pycache__/
backend/*.pyc
backend/.env
backend/uploads/

# Node
frontend/node_modules/
frontend/dist/

# VS Code
.vscode/

# OS
.DS_Store
Thumbs.db
```

---

## Part 6 — Claude Code Commands Reference

| What you want to do | Command / prompt |
|---------------------|-----------------|
| Start Claude Code | `claude` in terminal at project root |
| Give it a task | Type your instruction in the Claude Code panel |
| See what files it changed | Git diff: `git diff` |
| Undo last changes | `git checkout -- .` (careful — discards all uncommitted changes) |
| Ask about a specific file | "Explain what `backend/services/push_service.py` does" |
| Fix a bug | "Fix this error: [paste error message]" |
| Add a feature | "We are on Phase X. Add [feature] following CLAUDE.md rules." |

---

## Common Issues & Fixes

**Issue:** `claude` command not found
**Fix:** Use CMD, not PowerShell. Run `npm install -g @anthropic-ai/claude-code` in CMD.

**Issue:** Python venv won't activate in VS Code terminal
**Fix:** In VS Code: `Ctrl+Shift+P` → "Python: Select Interpreter" → choose the one in `backend\venv`

**Issue:** MySQL connection refused
**Fix:** Open Services (Win+R → `services.msc`) → find "MySQL80" → Start

**Issue:** Alembic says "Target database is not up to date"
**Fix:** Run `alembic upgrade head` in the backend venv

**Issue:** Vite can't find Tailwind styles
**Fix:** Check `tailwind.config.js` has `content: ["./src/**/*.{js,jsx}"]`

---

*BugTrack setup guide · NMG Technologies · Jun 2026*
