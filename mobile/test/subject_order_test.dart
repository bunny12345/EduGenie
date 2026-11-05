import 'package:mobile/utils/subject_order.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('subjects follow school order regardless of registration order', () {
    expect(
      sortSubjects(['Biology', 'Social Studies', 'English', 'Computer Science', 'Hindi', 'Mathematics', 'Science', 'Telugu']),
      ['Telugu', 'Hindi', 'English', 'Mathematics', 'Science', 'Biology', 'Computer Science', 'Social Studies'],
    );
  });

  test('unknown subjects sit between the sciences and social studies', () {
    expect(
      sortSubjects(['Social Science', 'Art', 'Physics', 'History', 'Sanskrit', 'Chemistry']),
      ['Sanskrit', 'Physics', 'Chemistry', 'Art', 'History', 'Social Science'],
    );
  });
}
