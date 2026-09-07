output "backend_instance_id" {
  value = aws_instance.backend.id
}

output "backend_public_ip" {
  description = "Changes every time the instance is stopped/started (no Elastic IP)."
  value       = aws_instance.backend.public_ip
}

output "alb_dns_name" {
  value = aws_lb.backend.dns_name
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.frontend.domain_name
}

output "frontend_bucket" {
  value = aws_s3_bucket.frontend.bucket
}

output "route53_nameservers" {
  description = "Must match what's configured at the domain registrar (Namecheap)."
  value       = data.aws_route53_zone.root.name_servers
}
