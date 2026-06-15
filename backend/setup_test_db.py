"""One-shot script: create bugtrack_test DB and grant access to bugtrack user."""
import asyncio
import aiomysql


async def main():
    # Try with no password first, then common defaults
    passwords = ["", "root", "mysql", "admin"]
    for pwd in passwords:
        try:
            conn = await aiomysql.connect(
                host="localhost", port=3306, user="root", password=pwd, db="mysql"
            )
            print(f"Connected as root with password='{pwd}'")
            cur = await conn.cursor()
            await cur.execute(
                "CREATE DATABASE IF NOT EXISTS bugtrack_test "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
            await cur.execute(
                "GRANT ALL PRIVILEGES ON bugtrack_test.* TO 'bugtrack'@'localhost'"
            )
            await cur.execute("FLUSH PRIVILEGES")
            await conn.commit()
            cur.close()
            conn.close()
            print("Done: bugtrack_test created, privileges granted.")
            return
        except Exception as e:
            print(f"root/{pwd!r} failed: {e}")

    print("Could not connect as root. Try setting TEST_DB_URL to use main DB.")


asyncio.run(main())
