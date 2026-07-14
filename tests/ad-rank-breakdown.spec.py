"""
Integration test runner for the ad_rank_breakdown SQL function.

Executes tests/sql/ad_rank_breakdown_test.sql against SUPABASE_DB_URL using
`psql -v ON_ERROR_STOP=1`. The SQL script runs inside a transaction that is
rolled back at the end, so no fixture data is left behind.

Runs in CI (see .github/workflows/deps.yml or a dedicated tests job) and
locally when SUPABASE_DB_URL is available.
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

SQL = Path(__file__).parent / "sql" / "ad_rank_breakdown_test.sql"


def main() -> int:
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        print("SKIP: SUPABASE_DB_URL not set", file=sys.stderr)
        return 0
    if shutil.which("psql") is None:
        print("SKIP: psql not installed", file=sys.stderr)
        return 0

    result = subprocess.run(
        ["psql", db_url, "-v", "ON_ERROR_STOP=1", "-f", str(SQL)],
        capture_output=True,
        text=True,
    )
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)
    if result.returncode != 0:
        print("FAIL: ad_rank_breakdown tests failed", file=sys.stderr)
        return result.returncode
    print("PASS: ad_rank_breakdown tests")
    return 0


if __name__ == "__main__":
    sys.exit(main())