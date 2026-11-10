import argparse
from datetime import datetime, timedelta, timezone
import importlib.util
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("backup_db", Path(__file__).with_name("backup_db.py"))
backup_db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup_db)


class BackupTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cluster = tempfile.TemporaryDirectory(prefix="ax-bk-", dir="/tmp")
        cls.directory = Path(cls.cluster.name)
        cls.data = cls.directory / "data"
        cls.env = {**os.environ, "LC_ALL": "C"}
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            cls.port = sock.getsockname()[1]
        cls.command(["initdb", "-D", str(cls.data), "-U", "backup_test", "-A", "trust", "--no-locale"])
        cls.command(["pg_ctl", "-D", str(cls.data), "-l", str(cls.directory / "postgres.log"), "-w",
                     "start", "-o", f"-F -h 127.0.0.1 -p {cls.port} -k '{cls.directory}'"])
        cls.command(["psql", "-h", "127.0.0.1", "-p", str(cls.port), "-U", "backup_test", "-d", "postgres",
                     "-v", "ON_ERROR_STOP=1", "-c",
                     "CREATE ROLE fixture_reader; CREATE TABLE public.backup_fixture (id int, value text);"
                     "INSERT INTO public.backup_fixture VALUES (1, 'restore-fixture');"
                     "ALTER TABLE public.backup_fixture ENABLE ROW LEVEL SECURITY;"
                     "CREATE POLICY fixture_owner ON public.backup_fixture USING (id = 1);"
                     "GRANT SELECT ON public.backup_fixture TO fixture_reader;"])

    @classmethod
    def command(cls, args):
        result = subprocess.run(args, env=cls.env, capture_output=True, text=True, timeout=60)
        if result.returncode:
            raise RuntimeError(f"{args[0]} failed: {result.stderr}")
        return result.stdout

    @classmethod
    def tearDownClass(cls):
        try:
            cls.command(["pg_ctl", "-D", str(cls.data), "-m", "fast", "-w", "stop"])
        finally:
            cls.cluster.cleanup()

    def setUp(self):
        self.working = tempfile.TemporaryDirectory(prefix="ax-bk-case-", dir="/tmp")
        self.addCleanup(self.working.cleanup)
        self.root = Path(self.working.name)
        self.config = self.root / "backup.env"
        self.config.write_text(f"BACKUP_DATABASE_URL=postgresql://backup_test@127.0.0.1:{self.port}/postgres\n")
        self.args = argparse.Namespace(
            env_file=self.config, output_dir=self.root / "backups",
            tools="native", image="postgres:18-alpine", s3_uri=None, local_retention_days=1,
            ssl_root_cert=None,
        )
        self.env_patch = patch.dict(os.environ, {}, clear=True)
        # Preserve PATH so real existing PostgreSQL tools remain available.
        original_path = os.environ.get("PATH", "")
        self.env_patch.start()
        os.environ["PATH"] = original_path
        self.addCleanup(self.env_patch.stop)

    def test_archive_restores_data_policies_and_grants(self):
        result = backup_db.backup(self.args)
        archive = Path(result["archive"])
        self.assertGreater(result["bytes"], 100)
        self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
        self.assertTrue(result["archive_catalog_verified"])
        self.assertFalse(result["offsite_download_verified"])
        self.command(["createdb", "-h", "127.0.0.1", "-p", str(self.port), "-U", "backup_test", "restore_check"])
        try:
            self.command(["pg_restore", "-h", "127.0.0.1", "-p", str(self.port), "-U", "backup_test",
                          "--no-owner", "--exit-on-error", "-d", "restore_check", str(archive)])
            query = self.command(["psql", "-h", "127.0.0.1", "-p", str(self.port), "-U", "backup_test",
                                  "-d", "restore_check", "-At", "-c",
                                  "SELECT value FROM public.backup_fixture;"
                                  "SELECT relrowsecurity FROM pg_class WHERE oid='public.backup_fixture'::regclass;"
                                  "SELECT polname FROM pg_policy WHERE polrelid='public.backup_fixture'::regclass;"
                                  "SELECT has_table_privilege('fixture_reader','public.backup_fixture','SELECT');"])
            self.assertEqual(query.splitlines(), ["restore-fixture", "t", "fixture_owner", "t"])
        finally:
            self.command(["dropdb", "-h", "127.0.0.1", "-p", str(self.port), "-U", "backup_test", "restore_check"])

    def test_failed_or_invalid_dumps_never_publish_success_archive(self):
        with patch.object(backup_db, "pg_tool", side_effect=RuntimeError("fixture pg_dump failure")):
            with self.assertRaises(RuntimeError):
                backup_db.backup(self.args)
        self.assertEqual(list(self.args.output_dir.iterdir()), [])
        real_pg_tool = backup_db.pg_tool

        def corrupt(tool, args, *rest):
            if tool == "pg_dump":
                Path(args[-1]).write_bytes(b"PGDMPbroken")
                return ""
            return real_pg_tool(tool, args, *rest)

        with patch.object(backup_db, "pg_tool", side_effect=corrupt):
            with self.assertRaises(RuntimeError):
                backup_db.backup(self.args)
        self.assertEqual(list(self.args.output_dir.iterdir()), [])

    def s3_runner(self, corrupt=False):
        real_run = backup_db.run
        uploaded = self.root / "remote.dump"

        def run(args, **kwargs):
            if args[:3] != ["aws", "s3", "cp"]:
                return real_run(args, **kwargs)
            if args[2 + 1].startswith("s3://"):
                shutil.copyfile(uploaded, args[4])
                if corrupt:
                    Path(args[4]).write_bytes(b"corrupted transfer")
            else:
                shutil.copyfile(args[3], uploaded)
            return ""
        return run

    def test_offsite_download_must_match_before_local_retention(self):
        self.args.s3_uri = "s3://fixture-backup/database"
        self.args.output_dir.mkdir()
        old = datetime.now(timezone.utc) - timedelta(days=8)
        old_file = self.args.output_dir / f"AcademiX_backup_{old:%Y%m%dT%H%M%SZ}_abcdefabcdef.dump"
        old_file.write_bytes(b"old-fixture")
        unrelated = self.args.output_dir / "do-not-delete.dump"
        unrelated.write_bytes(b"unrelated")
        with patch.object(backup_db, "run", side_effect=self.s3_runner()):
            result = backup_db.backup(self.args)
        self.assertTrue(result["offsite_download_verified"])
        self.assertFalse(old_file.exists())
        self.assertTrue(unrelated.exists())

    def test_failed_upload_verification_keeps_archives_and_fails(self):
        self.args.s3_uri = "s3://fixture-backup/database"
        with patch.object(backup_db, "run", side_effect=self.s3_runner(corrupt=True)):
            with self.assertRaisesRegex(RuntimeError, "does not match"):
                backup_db.backup(self.args)
        self.assertEqual(len(list(self.args.output_dir.glob("*.dump"))), 1)
        self.assertFalse(list(self.args.output_dir.glob(".backup-*")))

    def test_private_connection_parser_and_tls(self):
        self.config.write_text('export BACKUP_DATABASE_URL="postgresql://user:p%40ss@example.test:5432/postgres?sslmode=require"\n')
        env = backup_db.connection_environment(self.config)
        self.assertEqual(env["PGPASSWORD"], "p@ss")
        self.assertEqual(env["PGSSLMODE"], "verify-full")
        self.config.write_text("BACKUP_DATABASE_URL=postgresql://user:pw@aws-1-ap-south-1.pooler.supabase.com:6543/postgres\n")
        with self.assertRaisesRegex(ValueError, "session pooler"):
            backup_db.connection_environment(self.config)
        self.config.write_text("BACKUP_DATABASE_URL=postgresql://user:pw@example.test/postgres?sslmode=disable\n")
        with self.assertRaisesRegex(ValueError, "TLS"):
            backup_db.connection_environment(self.config)
        self.config.write_text("")
        with self.assertRaisesRegex(ValueError, "Configure"):
            backup_db.connection_environment(self.config)

    def test_errors_redact_private_connection_fields(self):
        error = subprocess.CompletedProcess(["pg_dump"], 1, "", "password=private-value user=private-user")
        with patch.object(backup_db.subprocess, "run", return_value=error):
            with self.assertRaises(RuntimeError) as raised:
                backup_db.run(["pg_dump"], private_values=["private-value", "private-user"])
        self.assertNotIn("private-value", str(raised.exception))
        self.assertNotIn("private-user", str(raised.exception))
        self.assertIn("[redacted]", str(raised.exception))

    def test_docker_credentials_and_container_are_cleaned_up(self):
        workspace = self.root
        commands = []
        container = "a" * 64
        private = {"PGPASSWORD": "fixture-password", "PGHOST": "fixture-host"}

        def fake_run(command, **kwargs):
            commands.append(command)
            self.assertNotIn("fixture-password", " ".join(command))
            if command[:2] == ["docker", "create"]:
                env_file = workspace / "connection.env"
                self.assertEqual(env_file.stat().st_mode & 0o777, 0o600)
                self.assertIn("PGPASSWORD=fixture-password", env_file.read_text())
                return container
            if command[:2] == ["docker", "start"]:
                raise subprocess.TimeoutExpired(command, 1)
            return ""

        with patch.object(backup_db, "run", side_effect=fake_run):
            with self.assertRaises(subprocess.TimeoutExpired):
                backup_db.pg_tool("pg_dump", ["--file", str(workspace / "test.dump")],
                                  private, workspace, "docker", "postgres:18-alpine")
        self.assertFalse((workspace / "connection.env").exists())
        self.assertEqual(commands[-1], ["docker", "rm", "--force", container])


if __name__ == "__main__":
    unittest.main()
