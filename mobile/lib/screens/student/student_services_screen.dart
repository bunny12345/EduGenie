import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';

/// "Services" tab — mirrors the web home page's "School Services" panel
/// (`.eg-services-card`/`.eg-services-grid`/`.eg-service-card` in
/// `StudentDashboard.jsx`/`App.css`) exactly: same 8 services, same bundled
/// GIF icons/colors, and the same white-card "Academics" panel frame/grid
/// layout used on the mobile home page.
class StudentServicesScreen extends StatefulWidget {
  const StudentServicesScreen({super.key});

  @override
  State<StudentServicesScreen> createState() => _StudentServicesScreenState();
}

class _ServiceItem {
  final String gifAsset;
  final String label;
  final Color color;
  final Color background;

  const _ServiceItem({required this.gifAsset, required this.label, required this.color, required this.background});
}

const _services = <_ServiceItem>[
  _ServiceItem(gifAsset: 'assets/gifs/student-info.gif', label: 'Student Info', color: Color(0xFF6366F1), background: Color(0xFFEEF0FF)),
  _ServiceItem(gifAsset: 'assets/gifs/fee.gif', label: 'Fee', color: Color(0xFFE67E22), background: Color(0xFFFFF3E2)),
  _ServiceItem(gifAsset: 'assets/gifs/transport.gif', label: 'Transport', color: Color(0xFF0891B2), background: Color(0xFFE0F7FA)),
  _ServiceItem(gifAsset: 'assets/gifs/attendance.gif', label: 'Attendance', color: Color(0xFFE11D48), background: Color(0xFFFDE8EE)),
  _ServiceItem(gifAsset: 'assets/gifs/medical-info.gif', label: 'Medical Info', color: Color(0xFF16A34A), background: Color(0xFFE8F8EE)),
  _ServiceItem(gifAsset: 'assets/gifs/my-room.gif', label: 'My Room', color: Color(0xFFD97706), background: Color(0xFFFFF7E6)),
  _ServiceItem(gifAsset: 'assets/gifs/leaves.gif', label: 'Leaves', color: Color(0xFF2563EB), background: Color(0xFFE8F0FF)),
  _ServiceItem(gifAsset: 'assets/gifs/technical-query.gif', label: 'Technical Query', color: Color(0xFFDB2777), background: Color(0xFFFCE7F3)),
];

/// The site-wide "3D button" frame — a light-black ring border + soft drop
/// shadow, ported from `.eg-subject-hw-card button`/panel rules in `App.css`.
const Color _frame3dColor = Color(0xFF46464E);

Border _frame3dBorder({double alpha = 0.35, double width = 1.5}) => Border.all(color: _frame3dColor.withValues(alpha: alpha), width: width);

List<BoxShadow> _frame3dShadow({double alpha = 0.18, double blur = 10}) =>
    [BoxShadow(color: Colors.black.withValues(alpha: alpha), blurRadius: blur, offset: const Offset(0, 4))];

class _StudentServicesScreenState extends State<StudentServicesScreen> {
  _ServiceItem? _selected;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Services')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(14),
              border: _frame3dBorder(),
              boxShadow: _frame3dShadow(),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('School Services', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                const Text(
                  'Helpful school tools, customizable to your school',
                  style: TextStyle(fontSize: 11, color: AppColors.muted),
                ),
                const SizedBox(height: 12),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 0.82,
                  ),
                  itemCount: _services.length,
                  itemBuilder: (context, i) {
                    final service = _services[i];
                    return _ServiceCard(
                      item: service,
                      selected: _selected == service,
                      onTap: () => setState(() => _selected = _selected == service ? null : service),
                    );
                  },
                ),
                if (_selected != null) ...[
                  const SizedBox(height: 12),
                  _ServiceDemoPanel(item: _selected!, onClose: () => setState(() => _selected = null)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// One "eg-service-card" tile — same white bordered panel + colored icon
/// tile + tactile press effect as the home page's Academics cards.
class _ServiceCard extends StatefulWidget {
  final _ServiceItem item;
  final bool selected;
  final VoidCallback onTap;

  const _ServiceCard({required this.item, required this.selected, required this.onTap});

  @override
  State<_ServiceCard> createState() => _ServiceCardState();
}

class _ServiceCardState extends State<_ServiceCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final highlighted = _pressed || widget.selected;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => setState(() => _pressed = true),
      onTapCancel: () => setState(() => _pressed = false),
      onTapUp: (_) => setState(() => _pressed = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _pressed ? 0.94 : 1.0,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 110),
          curve: Curves.easeOut,
          padding: const EdgeInsets.fromLTRB(6, 10, 6, 8),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: highlighted ? _frame3dBorder() : Border.all(color: const Color(0xFFECE8FF)),
            boxShadow: highlighted ? _frame3dShadow() : const [],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 48,
                height: 48,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: widget.item.background, borderRadius: BorderRadius.circular(14)),
                child: Image.asset(widget.item.gifAsset, width: 32, height: 32, fit: BoxFit.contain),
              ),
              const SizedBox(height: 5),
              Text(
                widget.item.label,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: Color(0xFF374151), height: 1.15),
              ),
            ],
          ),
        ),
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
        color: const Color(0xFFFAFAFF),
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: item.color.withValues(alpha: 0.27)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(item.label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF374151))),
              InkWell(
                borderRadius: BorderRadius.circular(7),
                onTap: onClose,
                child: const Padding(
                  padding: EdgeInsets.all(2),
                  child: Icon(Icons.close_rounded, size: 16, color: Color(0xFF5754AA)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'This school service is ready to be customized for your school requirements.',
            style: TextStyle(fontSize: 11, color: Color(0xFF374151)),
          ),
          const SizedBox(height: 4),
          const Text(
            'For now, this is a client demo preview. Your school can define the fields, approvals, notifications, and workflows.',
            style: TextStyle(fontSize: 10, color: AppColors.muted),
          ),
        ],
      ),
    );
  }
}
