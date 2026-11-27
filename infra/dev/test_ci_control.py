import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("ci-control.sh")


class ControlTests(unittest.TestCase):
    def run_control(self, action, state="running", record=None, dns_failure=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            log = root / "calls"
            aws = root / "aws"
            aws.write_text(
                """#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
with open(os.environ["CALLS"], "a") as out:
    out.write(json.dumps(args) + "\\n")
if args[:2] == ["ec2", "describe-instances"]:
    print(os.environ["STATE"] if "State.Name" in " ".join(args) else "192.0.2.10")
elif args[:2] == ["route53", "list-resource-record-sets"]:
    if os.environ["DNS_FAILURE"] == "1":
        sys.exit(1)
    print(os.environ["RECORD"])
"""
            )
            aws.chmod(0o755)
            env = {
                **os.environ,
                "PATH": f"{root}:{os.environ['PATH']}",
                "CALLS": str(log),
                "STATE": state,
                "RECORD": json.dumps(record or []),
                "DNS_FAILURE": "1" if dns_failure else "0",
            }
            result = subprocess.run(
                ["bash", str(SCRIPT), action], env=env, text=True, capture_output=True
            )
            calls = [json.loads(line) for line in log.read_text().splitlines()]
            return result, calls

    def test_start_updates_only_dev_dns(self):
        result, calls = self.run_control("start", state="stopped")
        self.assertEqual(result.returncode, 0, result.stderr)
        change = next(c for c in calls if c[:2] == ["route53", "change-resource-record-sets"])
        body = json.loads(change[change.index("--change-batch") + 1])
        record = body["Changes"][0]
        self.assertEqual(record["Action"], "UPSERT")
        self.assertEqual(record["ResourceRecordSet"]["Name"], "dev.academix.now")
        self.assertEqual(record["ResourceRecordSet"]["ResourceRecords"], [{"Value": "192.0.2.10"}])
        self.assertTrue(any(c[:2] == ["ec2", "start-instances"] for c in calls))

    def test_stop_deletes_matching_record_and_stops(self):
        record = [{"TTL": 60, "ResourceRecords": [{"Value": "192.0.2.10"}]}]
        result, calls = self.run_control("stop", record=record)
        self.assertEqual(result.returncode, 0, result.stderr)
        change = next(c for c in calls if c[:2] == ["route53", "change-resource-record-sets"])
        self.assertEqual(json.loads(change[change.index("--change-batch") + 1])["Changes"][0]["Action"], "DELETE")
        self.assertTrue(any(c[:2] == ["ec2", "stop-instances"] for c in calls))

    def test_stop_preserves_different_dns_record_and_reports_error(self):
        record = [{"TTL": 60, "ResourceRecords": [{"Value": "192.0.2.11"}]}]
        result, calls = self.run_control("stop", record=record)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(c[:2] == ["route53", "change-resource-record-sets"] for c in calls))
        self.assertTrue(any(c[:2] == ["ec2", "stop-instances"] for c in calls))

    def test_stop_still_stops_if_dns_lookup_fails(self):
        result, calls = self.run_control("stop", dns_failure=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(any(c[:2] == ["ec2", "stop-instances"] for c in calls))

    def test_already_stopped_with_stale_dns_reports_error(self):
        record = [{"TTL": 60, "ResourceRecords": [{"Value": "192.0.2.10"}]}]
        result, calls = self.run_control("stop", state="stopped", record=record)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(c[:2] == ["route53", "change-resource-record-sets"] for c in calls))


if __name__ == "__main__":
    unittest.main()
