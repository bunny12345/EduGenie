import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/session_provider.dart';
import 'api_client.dart';

final supportApiServiceProvider = Provider<SupportApiService>(
  (ref) => SupportApiService(ref.watch(apiClientProvider)),
);

String newSupportId() {
  final random = Random.secure();
  final bytes = List.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

class SupportTicket {
  final String id;
  final String subject;
  final String category;
  final String status;
  final DateTime? updatedAt;

  SupportTicket.fromJson(Map<String, dynamic> json)
    : id = json['id'] as String,
      subject = json['subject'] as String,
      category = json['category'] as String,
      status = json['status'] as String,
      updatedAt = json['updated_at'] == null
          ? null
          : DateTime.parse(json['updated_at'] as String);

  bool get expired =>
      status == 'resolved' &&
      updatedAt != null &&
      !updatedAt!.add(const Duration(hours: 48)).isAfter(DateTime.now());
}

class SupportMessage {
  final String role;
  final String content;

  const SupportMessage(this.role, this.content);

  SupportMessage.fromJson(Map<String, dynamic> json)
    : role = json['author_role'] as String,
      content = json['content'] as String;
}

class SupportTicketPage {
  final List<SupportTicket> tickets;
  final int? nextOffset;

  SupportTicketPage.fromJson(Map<String, dynamic> json)
    : tickets = (json['tickets'] as List)
          .map(
            (t) => SupportTicket.fromJson(Map<String, dynamic>.from(t as Map)),
          )
          .toList(),
      nextOffset = json['nextOffset'] as int?;
}

class SupportThread {
  final SupportTicket ticket;
  final List<SupportMessage> messages;

  const SupportThread(this.ticket, this.messages);
}

class SupportBotReply {
  final String reply;
  final List<String> suggestions;
  final bool needsTechnician;

  SupportBotReply.fromJson(Map<String, dynamic> json)
    : reply = json['reply'] as String,
      suggestions = (json['suggestions'] as List).cast<String>(),
      needsTechnician = json['needsTechnician'] as bool;
}

class SupportSubmission {
  final SupportTicket ticket;
  final String? notificationWarning;

  SupportSubmission.fromJson(Map<String, dynamic> json)
    : ticket = SupportTicket.fromJson(
        Map<String, dynamic>.from(json['ticket'] as Map),
      ),
      notificationWarning = json['notificationWarning'] as String?;
}

class SupportApiException implements Exception {
  final String message;
  final int? statusCode;
  const SupportApiException(this.message, {this.statusCode});
  @override
  String toString() => message;
}

/// Contracts mirror the student support wrappers in web/src/api.js.
class SupportApiService {
  final ApiClient _client;
  SupportApiService(this._client);

  Future<Map<String, dynamic>> _request(
    String path, {
    Map<String, dynamic>? body,
    CancelToken? cancelToken,
  }) async {
    try {
      final response = body == null
          ? await _client.dio.get(path, cancelToken: cancelToken)
          : await _client.dio.post(path, data: body, cancelToken: cancelToken);
      if (response.data is! Map) {
        throw const SupportApiException(
          'Support returned an invalid response. Please contact your school administrator.',
        );
      }
      final data = Map<String, dynamic>.from(response.data as Map);
      if (data['success'] != true) {
        throw SupportApiException(_message(data));
      }
      return data;
    } on DioException catch (e) {
      if (CancelToken.isCancel(e)) rethrow;
      if (e.response?.data is Map) {
        throw SupportApiException(
          _message(e.response!.data as Map),
          statusCode: e.response?.statusCode,
        );
      }
      throw const SupportApiException(
        'Unable to connect to support. Check your connection and try again.',
      );
    }
  }

  String _message(Map data) =>
      (data['message'] ??
              data['error'] ??
              'Support request failed. Please try again.')
          .toString();

  Future<SupportBotReply> ask(
    String message, {
    List<String> previousQuestions = const [],
    CancelToken? cancelToken,
  }) async => SupportBotReply.fromJson(
    await _request(
      '/support/chat',
      body: {'message': message, 'previousQuestions': previousQuestions},
      cancelToken: cancelToken,
    ),
  );

  Future<SupportTicketPage> list({
    int offset = 0,
    CancelToken? cancelToken,
  }) async => SupportTicketPage.fromJson(
    await _request('/support/tickets?offset=$offset', cancelToken: cancelToken),
  );

  Future<SupportThread> thread(String id, {CancelToken? cancelToken}) async {
    final messages = <SupportMessage>[];
    int? offset = 0;
    late SupportTicket ticket;
    do {
      final data = await _request(
        '/support/tickets/${Uri.encodeComponent(id)}?offset=$offset',
        cancelToken: cancelToken,
      );
      ticket = SupportTicket.fromJson(
        Map<String, dynamic>.from(data['ticket'] as Map),
      );
      messages.addAll(
        (data['messages'] as List).map(
          (m) => SupportMessage.fromJson(Map<String, dynamic>.from(m as Map)),
        ),
      );
      final next = data['nextOffset'] as int?;
      if (next != null && next <= offset!) {
        throw const SupportApiException(
          'Support returned invalid message pagination.',
        );
      }
      offset = next;
    } while (offset != null);
    return SupportThread(ticket, messages);
  }

  Future<SupportSubmission> create({
    required String id,
    required String category,
    required String subject,
    required String description,
    required List<SupportMessage> recentMessages,
    CancelToken? cancelToken,
  }) async => SupportSubmission.fromJson(
    await _request(
      '/support/tickets',
      body: {
        'id': id,
        'category': category,
        'subject': subject,
        'description': description,
        'recentMessages': recentMessages
            .where((m) => m.role == 'user')
            .toList()
            .reversed
            .take(12)
            .toList()
            .reversed
            .map((m) => {'role': 'user', 'content': m.content})
            .toList(),
      },
      cancelToken: cancelToken,
    ),
  );

  Future<String?> reply(
    String ticketId,
    String messageId,
    String message, {
    CancelToken? cancelToken,
  }) async {
    final data = await _request(
      '/support/tickets/${Uri.encodeComponent(ticketId)}/messages',
      body: {'id': messageId, 'message': message},
      cancelToken: cancelToken,
    );
    return data['notificationWarning'] as String?;
  }

  Future<String?> retryNotification(
    String id, {
    CancelToken? cancelToken,
  }) async {
    final data = await _request(
      '/support/tickets/${Uri.encodeComponent(id)}/notify',
      body: {},
      cancelToken: cancelToken,
    );
    return data['notificationWarning'] as String?;
  }
}
