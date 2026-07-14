"""Runs the ad_rank_breakdown edge-case SQL tests."""
import os, shutil, subprocess, sys
from pathlib import Path

SQL = Path(__file__).parent / "sql" / "ad_rank_breakdown_edge_cases.sql"

def main() -> int:
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        print("SKIP: SUPABASE_DB_URL not set", file=sys.stderr); return 0
    if shutil.which("psql") is None:
        print("SKIP: psql not installed", file=sys.stderr); return 0
    r = subprocess.run(["psql", db_url, "-v", "ON_ERROR_STOP=1", "-f", str(SQL)],
                       capture_output=True, text=True)
    sys.stdout.write(r.stdout); sys.stderr.write(r.stderr)
    if r.returncode != 0:
        print("FAIL: ad_rank_breakdown edge-case tests failed", file=sys.stderr)
        return r.returncode
    print("PASS: ad_rank_breakdown edge cases")
    return 0

if __name__ == "__main__":
    sys.exit(main())