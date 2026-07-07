terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

variable "database_url" {
  description = "Postgres connection string (DATABASE_URL) used to apply SQL."
  type        = string
}

provider "null" {}

resource "null_resource" "apply_rls" {
  provisioner "local-exec" {
    command = "DATABASE_URL=${var.database_url} bash ${path.module}/../db/apply_rls.sh rls_policies.sql rls_policies_roles.sql"
  }
}
