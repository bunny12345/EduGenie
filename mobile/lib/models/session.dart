import 'dart:convert';

/// Mirrors the web app's `AcademiX.session` shape (see `web/src/App.js`
/// `handleLogin`). Keep field names/semantics identical across platforms.
class Session {
  final String role; // 'student' | 'teacher' | 'school_admin'
  final String token;
  final String userId; // studentId or teacherId — empty for school_admin
  final String schoolId;
  final String name;
  final String className; // student's class, or teacher's subject context
  final String email;

  const Session({
    required this.role,
    required this.token,
    this.userId = '',
    this.schoolId = '',
    this.name = '',
    this.className = '',
    this.email = '',
  });

  bool get isStudent => role == 'student';
  bool get isTeacher => role == 'teacher';
  bool get isSchoolAdmin => role == 'school_admin';

  Map<String, dynamic>? get tokenClaims {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return null;
      final decoded = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))));
      return decoded is Map<String, dynamic> ? decoded : null;
    } on FormatException {
      return null;
    }
  }

  DateTime? get expiresAt {
    final exp = tokenClaims?['exp'];
    if (exp is! num || !exp.isFinite || exp <= 0) return null;
    try {
      return DateTime.fromMillisecondsSinceEpoch((exp * 1000).toInt(), isUtc: true);
    } on ArgumentError {
      return null;
    }
  }

  Session withToken(String value) => Session(
    role: role, token: value, userId: userId, schoolId: schoolId,
    name: name, className: className, email: email,
  );

  Map<String, dynamic> toJson() => {
        'role': role,
        'token': token,
        'userId': userId,
        'schoolId': schoolId,
        'name': name,
        'className': className,
        'email': email,
      };

  factory Session.fromJson(Map<String, dynamic> json) => Session(
        role: json['role'] as String? ?? '',
        token: json['token'] as String? ?? '',
        userId: json['userId'] as String? ?? '',
        schoolId: json['schoolId'] as String? ?? '',
        name: json['name'] as String? ?? '',
        className: json['className'] as String? ?? (json['subject'] as String? ?? ''),
        email: json['email'] as String? ?? '',
      );
}
