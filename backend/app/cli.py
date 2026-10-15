"""
Admin commands, run from the backend directory (or on Fly with
`fly ssh console -C "python -m app.cli ..."`):

    python -m app.cli make-admin <username>            # let them delete any tab
    python -m app.cli make-admin <username> --revoke   # take that away again
"""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import select

from app.core.database import AsyncSessionLocal, engine
from app.models.orm import User


async def set_admin(username: str, is_admin: bool) -> bool:
    """Grant or revoke admin rights. Returns False if there's no such user."""
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
        if user is None:
            return False
        user.is_admin = is_admin
        await db.commit()
        return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Banjo Bonanza Jamboree admin commands.")
    commands = parser.add_subparsers(dest="command", required=True)
    make_admin = commands.add_parser("make-admin", help="let an existing user delete anyone's tabs")
    make_admin.add_argument("username")
    make_admin.add_argument("--revoke", action="store_true", help="remove admin rights instead")
    args = parser.parse_args(argv)

    async def run() -> bool:
        try:
            return await set_admin(args.username, not args.revoke)
        finally:
            await engine.dispose()

    if not asyncio.run(run()):
        print(f"No user named {args.username!r}. They need to register first.")
        return 1
    print(f"{args.username} is {'no longer' if args.revoke else 'now'} an admin.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
