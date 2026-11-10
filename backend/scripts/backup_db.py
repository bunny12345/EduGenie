#!/usr/bin/env python3
"""Atomic PostgreSQL archives with optional verified offsite storage."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, unquote, urlsplit
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_NAME = re.compile(r"AcademiX_backup_(\d{8}T\d{6}Z)_[0-9a-f]{12}\.dump")


def connection_urls(env_file):
    settings = {}
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            match = re.match(r"^\s*(?:export\s+)?(BACKUP_DATABASE_URL|DATABASE_URL)\s*=\s*(.*)$", line)
            if match:
                parts = shlex.split(match[2], comments=True)
                if len(parts) != 1:
                    raise ValueError(f"{match[1]} must contain one quoted or unquoted connection URL")
                settings[match[1]] = parts[0]
    return settings


def connection_environment(env_file):
    settings = connection_urls(env_file)
    url = (os.environ.get("BACKUP_DATABASE_URL") or settings.get("BACKUP_DATABASE_URL")
           or os.environ.get("DATABASE_URL") or settings.get("DATABASE_URL"))
    if not url:
        raise ValueError("Configure BACKUP_DATABASE_URL or DATABASE_URL privately")
    parsed = urlsplit(url)
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname or not parsed.username:
        raise ValueError("A PostgreSQL connection URL with hostname and username is required")
    if parsed.hostname.endswith(".pooler.supabase.com") and parsed.port == 6543:
        raise ValueError("Use the Supabase session pooler on port 5432, not the transaction pooler")
    env = {
        "PGHOST": parsed.hostname,
        "PGPORT": str(parsed.port or 5432),
        "PGUSER": unquote(parsed.username),
        "PGPASSWORD": unquote(parsed.password or ""),
        "PGDATABASE": unquote(parsed.path.lstrip("/")) or "postgres",
        "PGCONNECT_TIMEOUT": "20",
        "PGSSLMODE": "verify-full",
        "PGSSLROOTCERT": "system",
        "PGAPPNAME": "academix-backup",
    }
    if parsed.hostname in ("localhost", "127.0.0.1", "::1"):
        env["PGSSLMODE"] = "disable"
        env.pop("PGSSLROOTCERT")
    query = parse_qs(parsed.query)
    if "sslmode" in query and query["sslmode"][-1] not in ("require", "verify-ca", "verify-full"):
        raise ValueError("Remote backup URLs must not disable TLS")
    if any("\n" in value or "\r" in value for value in env.values()):
        raise ValueError("Connection fields must not contain line breaks")
    return env


def run(command, env=None, timeout=3600, private_values=()):
    result = subprocess.run(command, env=env, text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        detail = result.stderr[-2000:].strip()
        for value in sorted(filter(None, private_values), key=len, reverse=True):
            detail = detail.replace(value, "[redacted]")
        detail = re.sub(r"postgres(?:ql)?://\S+", "[redacted connection]", detail)
        raise RuntimeError(f"{Path(command[0]).name} failed (exit {result.returncode}): {detail}")
    return result.stdout


def pg_tool(tool, args, pg_env, workspace, mode, image):
    private = [pg_env.get(key, "") for key in ("PGPASSWORD", "PGHOST", "PGUSER", "PGDATABASE")]
    if mode == "native":
        if not shutil.which(tool):
            raise RuntimeError(f"{tool} is not installed; use --tools docker or install PostgreSQL client tools")
        # Never pass credentials/connection URLs in process arguments.
        env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
        return run([tool, *args], env={**env, **pg_env}, private_values=private)
    env_path = workspace / "connection.env"
    env_path.write_text("".join(f"{key}={value}\n" for key, value in pg_env.items()))
    env_path.chmod(0o600)
    mapped_args = [arg.replace(str(workspace), "/backup") for arg in args]
    container = None
    try:
        container = run([
            "docker", "create", "--network", "bridge", "--memory", "512m", "--cpus", "0.5",
            "--env-file", str(env_path),
            "--mount", f"type=bind,source={workspace},target=/backup",
            image, tool, *mapped_args,
        ]).strip()
        if not re.fullmatch(r"[a-f0-9]{64}", container):
            raise RuntimeError("Docker did not return a valid backup container ID")
        return run(["docker", "start", "--attach", container], private_values=private)
    finally:
        env_path.unlink(missing_ok=True)
        if container and re.fullmatch(r"[a-f0-9]{64}", container):
            run(["docker", "rm", "--force", container], timeout=60)


def sha256(file):
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def upload_verified(archive, bucket_uri, workspace):
    if not re.fullmatch(r"s3://[a-z0-9][a-z0-9.-]+(?:/[A-Za-z0-9/_-]*)?", bucket_uri):
        raise ValueError("Expected a private S3 bucket/prefix URI")
    digest = sha256(archive)
    uri = f"{bucket_uri.rstrip('/')}/{archive.name}"
    run(["aws", "s3", "cp", str(archive), uri, "--sse", "AES256",
         "--checksum-algorithm", "SHA256", "--only-show-errors"])
    downloaded = workspace / "download-check.dump"
    run(["aws", "s3", "cp", uri, str(downloaded), "--only-show-errors"])
    if sha256(downloaded) != digest:
        raise RuntimeError("Downloaded S3 backup does not match the local archive")
    return uri


def prune_local(directory, days, now):
    cutoff = now - timedelta(days=days)
    for candidate in directory.iterdir():
        match = ARCHIVE_NAME.fullmatch(candidate.name)
        if match and not candidate.is_symlink() and candidate.is_file():
            created = datetime.strptime(match[1], "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
            if created < cutoff:
                candidate.unlink()


def backup(args):
    pg_env = connection_environment(args.env_file)
    args.output_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    args.output_dir.chmod(0o700)
    now = datetime.now(timezone.utc)
    name = f"AcademiX_backup_{now:%Y%m%dT%H%M%SZ}_{uuid4().hex[:12]}.dump"
    with tempfile.TemporaryDirectory(prefix=".backup-", dir=args.output_dir) as temporary:
        workspace = Path(temporary)
        archive = workspace / name
        if args.ssl_root_cert:
            certificate = workspace / "root-ca.crt"
            shutil.copyfile(args.ssl_root_cert, certificate)
            pg_env["PGSSLROOTCERT"] = "/backup/root-ca.crt" if args.tools == "docker" else str(certificate)
        pg_tool("pg_dump", ["--format=custom", "--no-owner", "--file", str(archive)],
                pg_env, workspace, args.tools, args.image)
        with archive.open("rb") as stream:
            if stream.read(5) != b"PGDMP":
                raise RuntimeError("pg_dump did not produce a PostgreSQL archive")
        contents = pg_tool("pg_restore", ["--list", str(archive)],
                           {}, workspace, args.tools, args.image)
        if not contents.strip():
            raise RuntimeError("Archive table of contents is empty")
        archive.chmod(0o600)
        # Publish only a completed, readable archive. Preserve it if upload fails.
        final = args.output_dir / name
        archive.replace(final)
        offsite = upload_verified(final, args.s3_uri, workspace) if args.s3_uri else None
        if offsite:
            prune_local(args.output_dir, args.local_retention_days, now)
        return {
            "archive": str(final), "bytes": final.stat().st_size,
            "sha256": sha256(final), "offsite": offsite,
            "archive_catalog_verified": True,
            "offsite_download_verified": bool(offsite),
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "backups")
    parser.add_argument("--tools", choices=("native", "docker"), default="native")
    parser.add_argument("--image", default="postgres:18-alpine")
    parser.add_argument("--s3-uri")
    parser.add_argument("--ssl-root-cert", type=Path)
    parser.add_argument("--local-retention-days", type=int, default=1)
    args = parser.parse_args()
    if args.local_retention_days < 1:
        parser.error("--local-retention-days must be at least one")
    os.umask(0o077)
    try:
        print(json.dumps(backup(args)))
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        detail = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print(f"Database backup FAILED ({detail}). No verified offsite success was recorded. "
              "Check the private connection configuration, connectivity, disk space and tool permissions.",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
