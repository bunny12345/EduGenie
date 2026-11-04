// Cleans AI tutor replies for the two places raw LaTeX/markdown looks wrong:
// the on-screen Sam caption (readable symbols) and text-to-speech (plain words).

const _delimited = r'\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$';

String _unwrapMath(String raw, String Function(String) convert) {
  return raw.replaceAllMapped(RegExp(_delimited), (m) {
    final inner = m.group(1) ?? m.group(2) ?? m.group(3) ?? m.group(4) ?? '';
    return convert(inner);
  });
}

String _stripMarkdown(String s) {
  return s
      .replaceAll('**', '')
      .replaceAll('`', '')
      .replaceAllMapped(RegExp(r'\[(.*?)\]\((.*?)\)'), (m) => m.group(1) ?? '')
      .replaceAll(RegExp(r'^\s*#+\s*', multiLine: true), '');
}

String _frac(String a, String b, {required bool words}) {
  if (words) return '$a over $b';
  final simple = RegExp(r'^[\w.\-]+$');
  final left = simple.hasMatch(a.trim()) ? a.trim() : '(${a.trim()})';
  final right = simple.hasMatch(b.trim()) ? b.trim() : '(${b.trim()})';
  return '$left/$right';
}

String _latex(String input, {required bool words}) {
  var s = input;
  final fracRe = RegExp(r'\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}');
  final sqrtRe = RegExp(r'\\sqrt\s*\{([^{}]*)\}');
  final textRe = RegExp(r'\\text\s*\{([^{}]*)\}');
  for (var i = 0; i < 3; i++) {
    s = s
        .replaceAllMapped(fracRe, (m) => _frac(m.group(1) ?? '', m.group(2) ?? '', words: words))
        .replaceAllMapped(sqrtRe, (m) => words ? 'square root of ${m.group(1)}' : '√(${m.group(1)})')
        .replaceAllMapped(textRe, (m) => m.group(1) ?? '');
  }
  final sup = {'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', 'n': 'ⁿ'};
  s = s.replaceAllMapped(RegExp(r'\^\s*\{?(\d|n)\}?'), (m) {
    final d = m.group(1)!;
    if (words) return d == '2' ? ' squared' : (d == '3' ? ' cubed' : ' to the power $d');
    return sup[d] ?? '^$d';
  });
  s = s.replaceAllMapped(RegExp(r'\^\s*\{([^{}]*)\}'), (m) => words ? ' to the power ${m.group(1)}' : '^(${m.group(1)})');

  final symbols = <String, List<String>>{
    r'\neq': ['≠', ' not equal to '],
    r'\ne': ['≠', ' not equal to '],
    r'\leq': ['≤', ' less than or equal to '],
    r'\le': ['≤', ' less than or equal to '],
    r'\geq': ['≥', ' greater than or equal to '],
    r'\ge': ['≥', ' greater than or equal to '],
    r'\times': ['×', ' times '],
    r'\cdot': ['·', ' times '],
    r'\div': ['÷', ' divided by '],
    r'\pm': ['±', ' plus or minus '],
    r'\in': ['∈', ' in '],
    r'\infty': ['∞', ' infinity '],
    r'\pi': ['π', ' pi '],
    r'\ldots': ['…', ' '],
    r'\dots': ['…', ' '],
    r'\%': ['%', ' percent '],
    r'\,': [' ', ' '],
  };
  symbols.forEach((cmd, v) {
    s = s.replaceAll(RegExp('${RegExp.escape(cmd)}(?![a-zA-Z])'), words ? v[1] : v[0]);
  });
  const blackboard = {'R': 'ℝ', 'Z': 'ℤ', 'N': 'ℕ', 'Q': 'ℚ'};
  s = s.replaceAllMapped(RegExp(r'\\(?:mathbb|mathbf)\s*\{?([A-Za-z])\}?'), (m) {
    final c = m.group(1)!;
    return words ? c : (blackboard[c] ?? c);
  });
  return s.replaceAll(RegExp(r'\\[a-zA-Z]+'), ' ').replaceAll(RegExp(r'[{}\\]'), '');
}

/// Readable on-screen text: real symbols instead of LaTeX, no markdown marks.
String tutorDisplayText(String raw) {
  var s = _unwrapMath(raw, (inner) => _latex(inner.trim(), words: false));
  s = _latex(s, words: false);
  s = _stripMarkdown(s).replaceAllMapped(RegExp(r'^\s*[-*]\s+', multiLine: true), (_) => '• ');
  return s.replaceAll(RegExp(r'[ \t]+'), ' ').replaceAll(RegExp(r'\n{3,}'), '\n\n').trim();
}

/// Plain words for text-to-speech (no symbols spelled out, no list markers).
String tutorSpeechText(String raw) {
  var s = _unwrapMath(raw, (inner) => ' ${_latex(inner, words: true)} ');
  s = _latex(s, words: true);
  s = _stripMarkdown(s)
      .replaceAll(RegExp(r'^\s*[-*]\s+', multiLine: true), '')
      .replaceAll(RegExp(r'[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]', unicode: true), ' ')
      .replaceAll(RegExp(r'[•●▪]'), ', ')
      .replaceAllMapped(RegExp(r'([.!?:;,])[ \t]*\n+[ \t]*'), (m) => '${m.group(1)} ')
      .replaceAll(RegExp(r'\s*\n+\s*'), '. ')
      .replaceAll(RegExp(r'\.{2,}'), '.')
      .replaceAll(RegExp(r'\s+'), ' ');
  return s.trim();
}
