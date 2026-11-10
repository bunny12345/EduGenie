data "aws_caller_identity" "backup" {}

resource "aws_s3_bucket" "backups" {
  bucket        = "academix-backups-${data.aws_caller_identity.backup.account_id}"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    id     = "seven-day-database-backups"
    status = "Enabled"
    filter {
      prefix = "database/"
    }
    expiration {
      days = 7
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_policy" "backups" {
  bucket = aws_s3_bucket.backups.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyUnencryptedTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.backups.arn, "${aws_s3_bucket.backups.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

resource "aws_iam_role" "backend_backups" {
  name = "academix-backend-backups"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "backend_backups" {
  role = aws_iam_role.backend_backups.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:AbortMultipartUpload"]
        Resource = "${aws_s3_bucket.backups.arn}/database/*"
      },
      {
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricData"]
        Resource = "*"
        Condition = {
          StringEquals = { "cloudwatch:namespace" = "AcademiX/Backups" }
        }
      }
    ]
  })
}

resource "aws_iam_instance_profile" "backend_backups" {
  name = "academix-backend-backups"
  role = aws_iam_role.backend_backups.name
}

resource "aws_iam_role" "snapshot_lifecycle" {
  name = "academix-snapshot-lifecycle"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "dlm.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "snapshot_lifecycle" {
  role       = aws_iam_role.snapshot_lifecycle.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}

resource "aws_dlm_lifecycle_policy" "backend" {
  description        = "AcademiX daily backend disk snapshots with seven-day retention"
  execution_role_arn = aws_iam_role.snapshot_lifecycle.arn
  state              = "ENABLED"
  policy_details {
    resource_types = ["INSTANCE"]
    target_tags = {
      AcademiXBackup = "daily"
    }
    schedule {
      name = "daily-seven-days"
      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        times         = [var.backup_snapshot_time_utc]
      }
      retain_rule {
        interval      = 7
        interval_unit = "DAYS"
      }
      copy_tags = true
      tags_to_add = {
        Application = "AcademiX"
        ManagedBy   = "DLM"
      }
    }
  }
  depends_on = [aws_iam_role_policy_attachment.snapshot_lifecycle]
}

resource "aws_cloudwatch_metric_alarm" "database_backup" {
  alarm_name          = "academix-database-backup-missing-or-failed"
  alarm_description   = "No successful database archive upload and download verification within the daily 26-hour window. Inspect academix-database-backup.service on EC2."
  namespace           = "AcademiX/Backups"
  metric_name         = "DatabaseBackupSuccess"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 26
  datapoints_to_alarm = 26
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
}

output "database_backup_bucket" {
  value = aws_s3_bucket.backups.id
}

output "backend_snapshot_policy" {
  value = aws_dlm_lifecycle_policy.backend.id
}
