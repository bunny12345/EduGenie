import { ForbiddenException } from '@nestjs/common';

type StudentRequest = {
  user?: { sub?: unknown; role?: unknown };
  studentId?: unknown;
};

export function requireStudentIdentity(req: StudentRequest, requestedId?: unknown): string {
  const id = req.user?.sub;
  if (req.user?.role !== 'student' || typeof id !== 'string' || !id.trim()) {
    throw new ForbiddenException('Student access required');
  }
  if (requestedId !== undefined && requestedId !== null && requestedId !== '' && requestedId !== id) {
    throw new ForbiddenException('Cannot access another student');
  }
  return id;
}
