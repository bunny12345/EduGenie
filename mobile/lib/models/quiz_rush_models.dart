/// Mirrors the Quiz Rush shapes returned by
/// `backend/src/games/quiz-rush.service.ts` (`getOverview`, `getQuestions`).
library;

import 'package:flutter/material.dart';

Color _parseHex(String? hex, Color fallback) {
  if (hex == null || hex.isEmpty) return fallback;
  var value = hex.replaceFirst('#', '');
  if (value.length == 6) value = 'FF$value';
  final parsed = int.tryParse(value, radix: 16);
  return parsed == null ? fallback : Color(parsed);
}

class QuizRushChapter {
  final String deckId;
  final String? chapterId;
  final String title;
  final int chapterNumber;
  final int questionCount;

  QuizRushChapter({
    required this.deckId,
    this.chapterId,
    required this.title,
    required this.chapterNumber,
    required this.questionCount,
  });

  factory QuizRushChapter.fromJson(Map<String, dynamic> json) {
    return QuizRushChapter(
      deckId: json['deckId']?.toString() ?? '',
      chapterId: json['chapterId']?.toString(),
      title: json['title']?.toString() ?? 'Chapter',
      chapterNumber: (json['chapterNumber'] as num?)?.toInt() ?? 0,
      questionCount: (json['questionCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class QuizRushSubject {
  final String subjectKey;
  final String displayName;
  final Color accent;
  final String treeEmoji;
  final List<QuizRushChapter> chapters;
  final int totalQuestions;
  final bool empty;

  QuizRushSubject({
    required this.subjectKey,
    required this.displayName,
    required this.accent,
    required this.treeEmoji,
    required this.chapters,
    required this.totalQuestions,
    required this.empty,
  });

  factory QuizRushSubject.fromJson(Map<String, dynamic> json) {
    final chaptersJson = json['chapters'] as List? ?? [];
    return QuizRushSubject(
      subjectKey: json['subjectKey']?.toString() ?? '',
      displayName: json['displayName']?.toString() ?? '',
      accent: _parseHex(json['accent']?.toString(), const Color(0xFFF59E0B)),
      treeEmoji: json['treeEmoji']?.toString() ?? '🌳',
      chapters: chaptersJson.map((c) => QuizRushChapter.fromJson(Map<String, dynamic>.from(c as Map))).toList(),
      totalQuestions: (json['totalQuestions'] as num?)?.toInt() ?? 0,
      empty: json['empty'] == true,
    );
  }
}

class QuizRushQuestion {
  final String questionId;
  final String deckId;
  final String? chapterId;
  final String? chapterTitle;
  final String question;
  final List<String> options;
  final int correctIndex;
  final String explanation;
  final String difficulty;

  QuizRushQuestion({
    required this.questionId,
    required this.deckId,
    this.chapterId,
    this.chapterTitle,
    required this.question,
    required this.options,
    required this.correctIndex,
    required this.explanation,
    required this.difficulty,
  });

  factory QuizRushQuestion.fromJson(Map<String, dynamic> json) {
    final opts = json['options'] as List? ?? [];
    return QuizRushQuestion(
      questionId: json['questionId']?.toString() ?? '',
      deckId: json['deckId']?.toString() ?? '',
      chapterId: json['chapterId']?.toString(),
      chapterTitle: json['chapterTitle']?.toString(),
      question: json['question']?.toString() ?? '',
      options: opts.map((o) => o.toString()).toList(),
      correctIndex: (json['correctIndex'] as num?)?.toInt() ?? 0,
      explanation: json['explanation']?.toString() ?? '',
      difficulty: json['difficulty']?.toString() ?? 'medium',
    );
  }
}
