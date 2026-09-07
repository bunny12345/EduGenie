data "aws_vpc" "default" {
  default = true
}

# The private key never leaves the operator's machine (~/.ssh/academix/); this
# only reads the already-existing key pair's metadata so aws_instance can
# reference it by name.
data "aws_key_pair" "backend" {
  key_name           = var.ec2_key_pair_name
  include_public_key = true
}
