/// Mirrors the flashcard shapes returned by `backend/src/games/flashcards.service.ts`
/// (`getFlashcardOverview`, `getCards`, `submitReview`).
library;

import 'package:flutter/material.dart';

Color _parseHex(String? hex, Color fallback) {
  if (hex == null || hex.isEmpty) return fallback;
  var value = hex.replaceFirst('#', '');
  if (value.length == 6) value = 'FF$value';
  final parsed = int.tryParse(value, radix: 16);
  return parsed == null ? fallback : Color(parsed);
}

class FlashcardChapter {
  final String deckId;
  final String? chapterId;
  final String? lessonId;
  final String title;
  final int chapterNumber;
  final int cardCount;
  final int dueCount;
  final int newCount;

  FlashcardChapter({
    required this.deckId,
    this.chapterId,
    this.lessonId,
    required this.title,
    required this.chapterNumber,
    required this.cardCount,
    required this.dueCount,
    required this.newCount,
  });

  factory FlashcardChapter.fromJson(Map<String, dynamic> json) {
    return FlashcardChapter(
      deckId: json['deckId']?.toString() ?? '',
      chapterId: json['chapterId']?.toString(),
      lessonId: json['lessonId']?.toString(),
      title: json['title']?.toString() ?? 'Chapter',
      chapterNumber: (json['chapterNumber'] as num?)?.toInt() ?? 0,
      cardCount: (json['cardCount'] as num?)?.toInt() ?? 0,
      dueCount: (json['dueCount'] as num?)?.toInt() ?? 0,
      newCount: (json['newCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class FlashcardSubject {
  final String subjectKey;
  final String displayName;
  final Color accent;
  final String treeEmoji;
  final List<FlashcardChapter> chapters;
  final int totalCards;
  final int dueCount;
  final bool empty;

  FlashcardSubject({
    required this.subjectKey,
    required this.displayName,
    required this.accent,
    required this.treeEmoji,
    required this.chapters,
    required this.totalCards,
    required this.dueCount,
    required this.empty,
  });

  factory FlashcardSubject.fromJson(Map<String, dynamic> json) {
    final chaptersJson = json['chapters'] as List? ?? [];
    return FlashcardSubject(
      subjectKey: json['subjectKey']?.toString() ?? '',
      displayName: json['displayName']?.toString() ?? '',
      accent: _parseHex(json['accent']?.toString(), const Color(0xFF6D5EFC)),
      treeEmoji: json['treeEmoji']?.toString() ?? '🌳',
      chapters: chaptersJson.map((c) => FlashcardChapter.fromJson(Map<String, dynamic>.from(c as Map))).toList(),
      totalCards: (json['totalCards'] as num?)?.toInt() ?? 0,
      dueCount: (json['dueCount'] as num?)?.toInt() ?? 0,
      empty: json['empty'] == true,
    );
  }
}

class FlashcardCard {
  final String flashcardId;
  final String deckId;
  final String? chapterId;
  final String? chapterTitle;
  final String front;
  final String back;
  final String? hint;
  final String difficulty;

  FlashcardCard({
    required this.flashcardId,
    required this.deckId,
    this.chapterId,
    this.chapterTitle,
    required this.front,
    required this.back,
    this.hint,
    required this.difficulty,
  });

  factory FlashcardCard.fromJson(Map<String, dynamic> json) {
    return FlashcardCard(
      flashcardId: json['flashcardId']?.toString() ?? '',
      deckId: json['deckId']?.toString() ?? '',
      chapterId: json['chapterId']?.toString(),
      chapterTitle: json['chapterTitle']?.toString(),
      front: json['front']?.toString() ?? '',
      back: json['back']?.toString() ?? '',
      hint: json['hint']?.toString(),
      difficulty: json['difficulty']?.toString() ?? 'medium',
    );
  }
}

class FlashcardSchedule {
  final int intervalDays;
  final String label;

  FlashcardSchedule({required this.intervalDays, required this.label});

  factory FlashcardSchedule.fromJson(Map<String, dynamic> json) {
    return FlashcardSchedule(
      intervalDays: (json['intervalDays'] as num?)?.toInt() ?? 0,
      label: json['label']?.toString() ?? '',
    );
  }
}
