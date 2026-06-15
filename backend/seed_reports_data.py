"""
Seed rich test data for user ram.kishan@nmgtechnologies.com (user_id=72)
across 3 boards to make global and board reports meaningful.
Run from backend/ directory: python seed_reports_data.py
"""
import asyncio
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text

DB_URL = "mysql+aiomysql://bugtrack:bugtrack123@localhost:3306/bugtrack"
USER_ID = 72   # ram.kishan@nmgtechnologies.com
BOARD_10 = 10  # Hug Security App
BOARD_11 = 11  # Nistle App
BOARD_12 = 12  # Rafino App

engine = create_async_engine(DB_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

def days_ago(n):
    return (datetime.utcnow() - timedelta(days=n)).strftime("%Y-%m-%d %H:%M:%S")

def days_from_now(n):
    return (datetime.utcnow() + timedelta(days=n)).strftime("%Y-%m-%d %H:%M:%S")

async def run(db: AsyncSession):
    # ── 1. Lists for Board 11 (Nistle App) ────────────────────────────────────
    existing = (await db.execute(text("SELECT COUNT(*) FROM lists WHERE board_id=11"))).scalar()
    if existing == 0:
        await db.execute(text("""
            INSERT INTO lists (name, board_id, position, is_archived) VALUES
            ('Backlog',     11, 1, 0),
            ('Open',        11, 2, 0),
            ('In Progress', 11, 3, 0),
            ('Review',      11, 4, 0),
            ('Closed',      11, 5, 0)
        """))
        await db.commit()
        print("Created 5 lists for Board 11")

    # ── 2. Labels ──────────────────────────────────────────────────────────────
    label_map = {}
    for board_id, label_defs in [
        (BOARD_10, [("Bug","#de350b"),("UI","#0079bf"),("API","#9333ea"),("Performance","#e9a825")]),
        (BOARD_11, [("Bug","#de350b"),("Frontend","#0079bf"),("Backend","#9333ea"),("Database","#61bd4f")]),
        (BOARD_12, [("Bug","#de350b"),("Mobile","#0079bf"),("UX","#e9a825"),("Security","#c92a2a")]),
    ]:
        for name, color in label_defs:
            exists = (await db.execute(
                text("SELECT id FROM labels WHERE board_id=:b AND name=:n"),
                {"b": board_id, "n": name}
            )).scalar()
            if not exists:
                await db.execute(
                    text("INSERT INTO labels (name, color, board_id) VALUES (:n,:c,:b)"),
                    {"n": name, "c": color, "b": board_id}
                )
                await db.commit()
                row = (await db.execute(
                    text("SELECT id FROM labels WHERE board_id=:b AND name=:n"),
                    {"b": board_id, "n": name}
                )).scalar()
                label_map[(board_id, name)] = row
                print(f"  Label '{name}' -> board {board_id} (id={row})")
            else:
                label_map[(board_id, name)] = exists

    # ── 3. Fetch list IDs ──────────────────────────────────────────────────────
    rows = (await db.execute(
        text("SELECT id, board_id, name FROM lists WHERE board_id IN (10,11,12)")
    )).fetchall()
    lists = {}
    for lid, bid, lname in rows:
        lists[(bid, lname)] = lid

    print(f"Lists loaded: {lists}")

    async def insert_card(board_id, list_name, title, severity, priority,
                          source="internal", created_days_ago=10,
                          due_days_from_now=None, overdue_days=None,
                          archived_days_ago=None, label_names=None):
        list_id = lists.get((board_id, list_name))
        if not list_id:
            print(f"  SKIP: no list '{list_name}' for board {board_id}")
            return None
        is_archived = 1 if archived_days_ago is not None else 0
        archived_at = days_ago(archived_days_ago) if archived_days_ago is not None else None
        is_complete = 1 if archived_days_ago is not None else 0
        created_at = days_ago(created_days_ago)
        if overdue_days is not None:
            due_date = days_ago(overdue_days)
        elif due_days_from_now is not None:
            due_date = days_from_now(due_days_from_now)
        else:
            due_date = None

        params = {
            "bid": board_id, "lid": list_id, "title": title,
            "severity": severity, "priority": priority, "source": source,
            "uid": USER_ID, "created_at": created_at,
            "is_archived": is_archived, "archived_at": archived_at,
            "is_complete": is_complete, "due_date": due_date,
        }
        await db.execute(text("""
            INSERT INTO cards
              (board_id, list_id, title, severity, priority, source,
               created_by_id, position, created_at,
               is_archived, archived_at, is_complete, is_deleted, is_recurring, due_date)
            VALUES
              (:bid, :lid, :title, :severity, :priority, :source,
               :uid, 0, :created_at,
               :is_archived, :archived_at, :is_complete, 0, 0, :due_date)
        """), params)
        await db.commit()
        card_id = (await db.execute(text("SELECT LAST_INSERT_ID()"))).scalar()

        # assign to user 72
        await db.execute(
            text("INSERT IGNORE INTO card_assignees (card_id, user_id) VALUES (:c, :u)"),
            {"c": card_id, "u": USER_ID}
        )

        # attach labels
        if label_names:
            for ln in label_names:
                lid_label = label_map.get((board_id, ln))
                if lid_label:
                    await db.execute(
                        text("INSERT IGNORE INTO card_labels (card_id, label_id) VALUES (:c, :l)"),
                        {"c": card_id, "l": lid_label}
                    )
        await db.commit()
        return card_id

    # ── 4. Board 10 — Hug Security App ────────────────────────────────────────
    print("\nSeeding Board 10 (Hug Security App)...")
    b10 = [
        # In Progress
        ("In Progress","Auth token refresh fails on mobile","critical","urgent","internal",20,None,None,None,["Bug","API"]),
        ("In Progress","SQL injection in search endpoint","critical","urgent","client",18,None,None,None,["Bug","API"]),
        ("In Progress","Memory leak in WebSocket handler","high","high","internal",15,None,None,None,["Performance","API"]),
        ("In Progress","Unescaped HTML in notifications","medium","normal","internal",12,None,None,None,["Bug","UI"]),
        # Review
        ("Review","Input validation missing on user profile","high","high","internal",12,None,None,None,["Bug","UI"]),
        ("Review","Admin panel accessible without 2FA","critical","urgent","internal",10,None,None,None,["Bug","API"]),
        ("Review","Rate limiting not enforced on login API","high","high","client",8,None,None,None,["Bug","API"]),
        # Closed (resolved this week)
        ("Closed","XSS vulnerability in comment field","critical","urgent","client",25,None,None,2,["Bug","UI"]),
        ("Closed","CSRF token not validated on delete","high","urgent","internal",22,None,None,3,["Bug","API"]),
        ("Closed","Broken access control on /api/admin","critical","urgent","internal",19,None,None,4,["Bug","API"]),
        ("Closed","Insecure direct object reference","high","high","client",16,None,None,5,["Bug","UI"]),
        ("Closed","Sensitive data in error responses","medium","normal","internal",14,None,None,6,["Bug","API"]),
        # Overdue in backlog
        ("Backlog","Password policy not enforced","high","high","client",28,None,5,None,["Bug","UI"]),
        ("Backlog","API keys stored in plaintext","critical","urgent","internal",26,None,3,None,["Bug","API"]),
        ("Open","Session not invalidated on logout","medium","high","internal",24,None,1,None,["Bug","API"]),
        ("Backlog","Weak cipher used in file encryption","high","high","internal",22,7,None,None,["Bug","API"]),
        ("Backlog","No audit trail for admin actions","low","normal","internal",19,14,None,None,["Performance","API"]),
        ("Open","Missing CSP headers on all pages","medium","normal","internal",17,10,None,None,["Bug","UI"]),
    ]
    for row in b10:
        cid = await insert_card(BOARD_10, *row)
        if cid:
            print(f"  Card {cid}: {row[1][:45]}")

    # ── 5. Board 11 — Nistle App ───────────────────────────────────────────────
    print("\nSeeding Board 11 (Nistle App)...")
    b11 = [
        # Backlog
        ("Backlog","Home screen loads slow on Android","medium","normal","client",30,7,None,None,["Bug","Frontend"]),
        ("Backlog","Push notifications not delivered on iOS","high","high","client",28,None,None,None,["Bug","Frontend"]),
        ("Backlog","Product search returns wrong results","high","urgent","internal",26,None,None,None,["Bug","Backend"]),
        ("Backlog","User avatar upload fails > 2MB","low","low","internal",24,10,None,None,["Bug","Frontend"]),
        ("Backlog","Cart total miscalculates with discount","critical","urgent","client",22,None,None,None,["Bug","Backend"]),
        # Open
        ("Open","Payment gateway timeout on checkout","critical","urgent","client",20,None,None,None,["Bug","Backend"]),
        ("Open","Order status not updating in real time","high","high","internal",18,5,None,None,["Bug","Backend"]),
        ("Open","Filter panel resets on page reload","medium","normal","internal",16,None,None,None,["Bug","Frontend"]),
        ("Open","Dark mode toggle breaks layout","low","low","internal",14,None,None,None,["Bug","Frontend"]),
        # In Progress
        ("In Progress","DB query times out for large catalogs","critical","urgent","internal",15,None,None,None,["Bug","Database"]),
        ("In Progress","Session expiry during checkout flow","high","urgent","client",13,None,None,None,["Bug","Backend"]),
        ("In Progress","Wishlist not syncing across devices","medium","normal","internal",11,None,None,None,["Bug","Backend"]),
        # Review
        ("Review","Incorrect tax calculation for EU orders","high","high","client",10,None,None,None,["Bug","Backend"]),
        ("Review","Search autocomplete leaks user data","high","urgent","internal",8,None,None,None,["Bug","Frontend"]),
        # Closed (resolved this week)
        ("Closed","App crash on empty cart checkout","critical","urgent","client",30,None,None,1,["Bug","Frontend"]),
        ("Closed","Duplicate order on double-tap","high","high","client",27,None,None,2,["Bug","Backend"]),
        ("Closed","Images not loading on slow networks","medium","normal","internal",24,None,None,3,["Bug","Frontend"]),
        ("Closed","Promo code applies twice","high","urgent","client",20,None,None,5,["Bug","Backend"]),
        # Overdue
        ("Backlog","N+1 query on product listing API","high","high","internal",29,None,8,None,["Bug","Database"]),
        ("Open","Broken pagination on order history","medium","normal","internal",21,None,2,None,["Bug","Frontend"]),
    ]
    for row in b11:
        cid = await insert_card(BOARD_11, *row)
        if cid:
            print(f"  Card {cid}: {row[1][:45]}")

    # ── 6. Board 12 — Rafino App ───────────────────────────────────────────────
    print("\nSeeding Board 12 (Rafino App)...")
    b12 = [
        # Backlog
        ("Backlog","Map not loading on first app open","high","high","client",35,None,None,None,["Bug","Mobile"]),
        ("Backlog","Booking confirmation email delayed","medium","normal","client",32,None,None,None,["Bug","UX"]),
        ("Backlog","Filter by date range returns empty","high","urgent","internal",30,None,None,None,["Bug","Mobile"]),
        ("Backlog","App freezes on back navigation","medium","normal","client",28,7,None,None,["Bug","Mobile"]),
        ("Backlog","Profile photo not loading after upload","low","low","internal",25,None,None,None,["Bug","UX"]),
        # Open
        ("Open","OTP not received on booking confirm","critical","urgent","client",22,None,None,None,["Bug","Mobile"]),
        ("Open","Price shown differs from invoice","high","urgent","client",20,None,5,None,["Bug","UX"]),
        ("Open","Language switch resets all settings","medium","normal","internal",18,None,None,None,["Bug","Mobile"]),
        ("Open","Accessibility issues in form labels","low","normal","internal",15,None,None,None,["UX","Mobile"]),
        # In Progress
        ("In Progress","GPS accuracy poor in indoor venues","high","high","internal",16,None,None,None,["Bug","Mobile"]),
        ("In Progress","Crash on iOS 17 when sharing location","critical","urgent","client",14,None,None,None,["Bug","Mobile"]),
        ("In Progress","Booking history pagination broken","medium","normal","internal",12,None,None,None,["Bug","UX"]),
        # Review
        ("Review","Security: API auth token exposed in logs","critical","urgent","internal",10,None,None,None,["Security","Bug"]),
        ("Review","Rating submission fails silently","high","high","client",8,None,None,None,["Bug","UX"]),
        ("Review","Push notification body truncated","low","low","internal",6,None,None,None,["Bug","Mobile"]),
        # Closed (resolved this week)
        ("Closed","App crashs on startup for first-time users","critical","urgent","client",40,None,None,1,["Bug","Mobile"]),
        ("Closed","Dark mode status bar not visible","medium","normal","internal",35,None,None,2,["Bug","Mobile"]),
        ("Closed","Venue search results not sorted","low","normal","internal",30,None,None,3,["Bug","UX"]),
        ("Closed","Double booking possible in race condition","high","urgent","client",28,None,None,4,["Security","Bug"]),
        # Overdue
        ("Backlog","Payment refund API returns 500","critical","urgent","client",38,None,10,None,["Security","Bug"]),
        ("Open","Users can't cancel booking within 30min","high","high","client",32,None,6,None,["Bug","UX"]),
    ]
    for row in b12:
        cid = await insert_card(BOARD_12, *row)
        if cid:
            print(f"  Card {cid}: {row[1][:45]}")

    print("\nDone! Seed complete.")


async def main():
    async with AsyncSessionLocal() as db:
        await run(db)
    await engine.dispose()

asyncio.run(main())
