import 'package:flutter/material.dart';

import '../../widgets/coming_soon_view.dart';

class StudentGamesScreen extends StatelessWidget {
  const StudentGamesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Games')),
      body: const ComingSoonView(icon: Icons.videogame_asset_rounded, title: 'Games', subtitle: 'Built in Phase 3.'),
    );
  }
}
