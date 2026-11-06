import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { OwnerAuthService } from './owner-auth.service';

@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(private readonly ownerAuth: OwnerAuthService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    req.owner = await this.ownerAuth.authenticate(req.headers.authorization);
    return true;
  }
}

@Injectable()
export class OwnerIdentityGuard implements CanActivate {
  constructor(private readonly ownerAuth: OwnerAuthService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    req.owner = await this.ownerAuth.authenticate(req.headers.authorization, false);
    return true;
  }
}
