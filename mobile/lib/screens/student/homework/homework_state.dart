import 'package:flutter/material.dart';

import '../../../models/homework_item.dart';

/// Port of `getHomeworkState()` in `StudentDashboard.jsx` — status label,
/// color and flags derived from a homework item's submission/due state.
class HomeworkState {
  final bool submitted;
  final bool resubmitted;
  final bool overdue;
  final bool expired;
  final bool hide;
  final String label;
  final Color color;
  final Color bg;

  const HomeworkState({
    required this.submitted,
    required this.resubmitted,
    required this.overdue,
    required this.expired,
    required this.hide,
    required this.label,
    required this.color,
    required this.bg,
  });
}

DateTime? _parseDate(String? iso) => iso == null ? null : DateTime.tryParse(iso);

HomeworkState homeworkState(HomeworkItem h) {
  final due = _parseDate(h.dueAt) ?? _parseDate(h.startAt);
  final rawStatus = h.status.toLowerCase();
  final resubmitted = rawStatus == 'resubmitted' || h.dueStatus.toLowerCase() == 'resubmitted' || h.remark.toLowerCase() == 'resubmitted';
  final submitted = rawStatus == 'submitted' || rawStatus == 'graded' || rawStatus == 'resubmitted';

  if (submitted) {
    return HomeworkState(
      submitted: true,
      resubmitted: resubmitted,
      overdue: false,
      expired: false,
      hide: false,
      label: resubmitted ? 'Resubmitted' : 'Submitted',
      color: resubmitted ? const Color(0xFF2563EB) : const Color(0xFF16A34A),
      bg: resubmitted ? const Color(0xFFDBEAFE) : const Color(0xFFDCFCE7),
    );
  }
  if (due == null) {
    return const HomeworkState(
      submitted: false,
      resubmitted: false,
      overdue: false,
      expired: false,
      hide: false,
      label: 'Pending',
      color: Color(0xFF6B7280),
      bg: Color(0xFFF3F4F6),
    );
  }
  final daysSinceDue = DateTime.now().difference(due).inDays;
  final overdue = daysSinceDue >= 0;
  final expired = daysSinceDue > 3;
  if (expired) {
    return HomeworkState(
      submitted: false,
      resubmitted: false,
      overdue: true,
      expired: true,
      hide: true,
      label: 'Expired ${daysSinceDue}d overdue',
      color: const Color(0xFFB91C1C),
      bg: const Color(0xFFFEE2E2),
    );
  }
  if (overdue) {
    return HomeworkState(
      submitted: false,
      resubmitted: false,
      overdue: true,
      expired: false,
      hide: false,
      label: 'Overdue ${daysSinceDue}d',
      color: const Color(0xFFB45309),
      bg: const Color(0xFFFFEDD5),
    );
  }
  return const HomeworkState(
    submitted: false,
    resubmitted: false,
    overdue: false,
    expired: false,
    hide: false,
    label: 'Pending',
    color: Color(0xFF6B7280),
    bg: Color(0xFFF3F4F6),
  );
}
