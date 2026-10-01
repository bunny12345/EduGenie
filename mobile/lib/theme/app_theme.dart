import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';

/// Central ThemeData — mirrors the web app's card/typography conventions
/// ("cardish" class, Poppins font, brand purple) using Material 3 widgets.
class AppTheme {
  AppTheme._();

  static ThemeData light() => _build(
        background: AppColors.backgroundLight,
        text: AppColors.textLight,
        muted: AppColors.mutedLight,
        card: AppColors.cardLight,
        line: AppColors.lineLight,
        brandSoft: AppColors.brandSoftLight,
        brightness: Brightness.light,
      );

  static ThemeData dark() => _build(
        background: AppColors.backgroundDark,
        text: AppColors.textDark,
        muted: AppColors.mutedDark,
        card: AppColors.cardDark,
        line: AppColors.lineDark,
        brandSoft: AppColors.brandSoftDark,
        brightness: Brightness.dark,
      );

  static ThemeData _build({
    required Color background,
    required Color text,
    required Color muted,
    required Color card,
    required Color line,
    required Color brandSoft,
    required Brightness brightness,
  }) {
    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.brand,
        brightness: brightness,
        primary: AppColors.brand,
        secondary: AppColors.brand2,
        surface: card,
        error: AppColors.danger,
      ),
      scaffoldBackgroundColor: background,
      textTheme: (brightness == Brightness.dark ? GoogleFonts.poppinsTextTheme(ThemeData(brightness: Brightness.dark).textTheme) : GoogleFonts.poppinsTextTheme()).apply(
        bodyColor: text,
        displayColor: text,
      ),
    );

    return base.copyWith(
      appBarTheme: AppBarTheme(
        backgroundColor: background,
        foregroundColor: text,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.poppins(
          color: text,
          fontSize: 18,
          fontWeight: FontWeight.w700,
        ),
      ),
      cardTheme: CardThemeData(
        color: card,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: line),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: card,
        indicatorColor: brandSoft,
        elevation: 2,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return GoogleFonts.poppins(
            fontSize: 11,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            color: selected ? AppColors.brand : muted,
          );
        }),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: GoogleFonts.poppins(fontWeight: FontWeight.w600, fontSize: 14),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: card,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.brand, width: 1.5),
        ),
      ),
    );
  }
}
