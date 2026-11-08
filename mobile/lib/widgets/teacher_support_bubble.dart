import 'package:flutter/material.dart';

import '../screens/support/support_screen.dart';
import 'pressable_scale.dart';

class TeacherSupportBubble extends StatelessWidget {
  const TeacherSupportBubble({super.key});

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: 'Open teacher support',
    child: Tooltip(
      message: 'Teacher support',
      child: PressableScale(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => const SupportScreen(teacher: true),
          ),
        ),
        child: Container(
          width: 58,
          height: 58,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF5065E7), Color(0xFF28379B)],
            ),
            border: Border.all(color: const Color(0xFFB8CBFF), width: 2),
            boxShadow: const [
              BoxShadow(
                color: Color(0x507289FF),
                blurRadius: 22,
                spreadRadius: 3,
              ),
              BoxShadow(
                color: Color(0x50263B85),
                blurRadius: 16,
                offset: Offset(0, 6),
              ),
            ],
          ),
          child: const Icon(
            Icons.chat_bubble_outline_rounded,
            color: Colors.white,
            size: 27,
          ),
        ),
      ),
    ),
  );
}
