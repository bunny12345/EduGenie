resource "aws_instance" "backend" {
  ami                         = var.backend_ami_id
  instance_type               = var.backend_instance_type
  subnet_id                   = var.backend_subnet_id
  key_name                    = data.aws_key_pair.backend.key_name
  vpc_security_group_ids      = [aws_security_group.backend.id]
  associate_public_ip_address = true

  root_block_device {
    volume_size           = 20
    volume_type           = "gp3"
    delete_on_termination = true
  }

  user_data = file("${path.module}/files/user_data.sh")

  tags = { Name = "academix-backend" }

  lifecycle {
    # Avoid a forced replacement if the "latest Amazon Linux 2023" AMI id
    # drifts over time due to AWS patching — replacing this instance loses
    # backend/local-data/uploads (only lives on this instance's disk today).
    # user_data is also ignored: AWS only applies user_data changes via a
    # stop/modify/start cycle, so letting Terraform "fix" harmless whitespace
    # drift here would silently reboot production on every apply.
    ignore_changes = [ami, user_data]
  }
}
