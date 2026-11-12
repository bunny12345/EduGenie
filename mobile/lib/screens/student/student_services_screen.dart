import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import '../../widgets/student_shortcut_tile.dart';
import 'student_support_screen.dart';

/// School services use the same raised shortcuts as student Home.
class StudentServicesScreen extends StatefulWidget {
  const StudentServicesScreen({super.key});

  @override
  State<StudentServicesScreen> createState() => _StudentServicesScreenState();
}

class _ServiceItem {
  final String gifAsset;
  final String label;
  final Color color;

  const _ServiceItem({
    required this.gifAsset,
    required this.label,
    required this.color,
  });
}

const _services = <_ServiceItem>[
  _ServiceItem(
    gifAsset: 'assets/gifs/student-info.gif',
    label: 'Student Info',
    color: Color(0xFF6366F1),
  ),
  _ServiceItem(
    gifAsset: 'assets/gifs/fee.gif',
    label: 'Fee',
    color: Color(0xFFE67E22),
  ),
  _ServiceItem(
    gifAsset: 'assets/gifs/transport.gif',
    label: 'Transport',
    color: Color(0xFF0891B2),
  ),
  _ServiceItem(
    gifAsset: 'assets/gifs/attendance.gif',
    label: 'Attendance',
    color: Color(0xFFE11D48),
  ),
  _ServiceItem(
    gifAsset: 'assets/gifs/medical-info.gif',
    label: 'Medical Info',
    color: Color(0xFF16A34A),
  ),
  _ServiceItem(
    gifAsset: 'assets/gifs/my-room.gif',
    label: 'My Room',
    color: Color(0xFFD97706),
  ),
  _ServiceItem(
    gifAsset: 'assets/gifs/leaves.gif',
    label: 'Leaves',
    color: Color(0xFF2563EB),
  ),
  _ServiceItem(
    gifAsset: 'assets/gifs/technical-query.gif',
    label: 'Technical Query',
    color: Color(0xFFDB2777),
  ),
];

class _StudentServicesScreenState extends State<StudentServicesScreen> {
  _ServiceItem? _selected;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Services'), titleSpacing: 20),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.of(context).card,
              borderRadius: BorderRadius.circular(26),
              border: Border.all(color: AppColors.of(context).line),
              boxShadow: [
                BoxShadow(
                  color: AppColors.sidebar.withValues(alpha: 0.04),
                  blurRadius: 24,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppColors.of(context).brandSoft,
                        borderRadius: BorderRadius.circular(11),
                      ),
                      child: Icon(
                        Icons.widgets_rounded,
                        color: AppColors.of(context).accent,
                        size: 19,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'School Services',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: AppColors.of(context).text,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  'Helpful school tools, customizable to your school',
                  style: TextStyle(fontSize: 11, color: AppColors.of(context).muted),
                ),
                const SizedBox(height: 12),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final scale = MediaQuery.textScalerOf(context).scale(1);
                    return GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      padding: EdgeInsets.zero,
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount:
                            constraints.maxWidth < 280 || scale > 1.25 ? 2 : 3,
                        mainAxisSpacing: 10,
                        crossAxisSpacing: 10,
                        mainAxisExtent: 116 + (scale - 1).clamp(0, 3) * 70,
                      ),
                      itemCount: _services.length,
                      itemBuilder: (context, i) {
                        final service = _services[i];
                        return StudentShortcutTile(
                          label: service.label,
                          asset: service.gifAsset,
                          accent: service.color,
                          selected: _selected == service,
                          onTap: () {
                            if (service.label == 'Technical Query') {
                              Navigator.of(context).push(
                                MaterialPageRoute<void>(
                                  builder: (_) => const StudentSupportScreen(),
                                ),
                              );
                            } else {
                              setState(
                                () => _selected = _selected == service
                                    ? null
                                    : service,
                              );
                            }
                          },
                        );
                      },
                    );
                  },
                ),
                if (_selected != null) ...[
                  const SizedBox(height: 12),
                  _ServiceDemoPanel(
                    item: _selected!,
                    onClose: () => setState(() => _selected = null),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Mirrors `.eg-service-demo-panel` — the "coming soon" preview shown below
/// the grid once a service tile is tapped.
class _ServiceDemoPanel extends StatelessWidget {
  final _ServiceItem item;
  final VoidCallback onClose;

  const _ServiceDemoPanel({required this.item, required this.onClose});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.of(context).background,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: item.color.withValues(alpha: 0.27)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  item.label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.of(context).text,
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Close service preview',
                onPressed: onClose,
                icon: Icon(
                  Icons.close_rounded,
                  size: 20,
                  color: AppColors.of(context).accent,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'This school service is ready to be customized for your school requirements.',
            style: TextStyle(fontSize: 11, color: AppColors.of(context).text),
          ),
          const SizedBox(height: 4),
          Text(
            'For now, this is a client demo preview. Your school can define the fields, approvals, notifications, and workflows.',
            style: TextStyle(fontSize: 10, color: AppColors.of(context).muted),
          ),
        ],
      ),
    );
  }
}
