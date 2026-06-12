"""Run once to create the initial Super Admin account."""
import asyncio
from sqlalchemy import select
from database import AsyncSessionLocal
from models.user import User, UserRole
from services.auth_service import hash_password


async def seed():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == "admin@bugtrack.app"))
        if result.scalar_one_or_none():
            print("Super admin already exists — skipping.")
            return

        admin = User(
            email="admin@bugtrack.app",
            password_hash=hash_password("Admin1234!"),
            full_name="Super Admin",
            role=UserRole.super_admin,
        )
        db.add(admin)
        await db.commit()
        print("Super admin created:")
        print("  Email:    admin@bugtrack.app")
        print("  Password: Admin1234!")
        print("Change the password after first login!")


asyncio.run(seed())
