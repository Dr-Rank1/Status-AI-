import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:status/main.dart' as app;

/// End-to-end integration tests for core user journeys.
///
/// Prerequisites:
///   - Backend running at API_BASE_URL (default http://10.0.2.2:3000/api/v1 on Android emulator)
///   - PostgreSQL seeded with at least one AI character
///
/// Run:
///   cd mobile
///   flutter test integration_test/app_test.dart \
///     --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1 \
///     --dart-define=SOCKET_URL=http://10.0.2.2:3000
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Status E2E journeys', () {
    testWidgets('registration flow creates account and lands on feed', (tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 8));

      await tester.tap(find.byKey(const Key('e2e_register_link')));
      await tester.pumpAndSettle();

      final stamp = DateTime.now().millisecondsSinceEpoch;
      await tester.enterText(find.byKey(const Key('e2e_register_display_name')), 'E2E Tester');
      await tester.enterText(find.byKey(const Key('e2e_register_username')), 'e2e_$stamp');
      await tester.enterText(find.byKey(const Key('e2e_register_email')), 'e2e_$stamp@status.test');
      await tester.enterText(find.byKey(const Key('e2e_register_password')), 'password123');

      await tester.tap(find.byKey(const Key('e2e_register_submit')));
      await tester.pumpAndSettle(const Duration(seconds: 12));

      expect(find.byKey(const Key('e2e_energy_bar')), findsOneWidget);
      expect(find.text('Energy'), findsOneWidget);
    });

    testWidgets('login, scroll feed, DM character, energy deducts', (tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 8));

      expect(find.byKey(const Key('e2e_login_submit')), findsOneWidget);

      await tester.tap(find.byKey(const Key('e2e_login_submit')));
      await tester.pumpAndSettle(const Duration(seconds: 12));

      expect(find.byKey(const Key('e2e_energy_bar')), findsOneWidget);

      final energyBefore = _readEnergyRemaining(tester);
      expect(energyBefore, isNotNull);

      final feedList = find.byKey(const Key('e2e_feed_list'));
      if (feedList.evaluate().isNotEmpty) {
        await tester.drag(feedList, const Offset(0, -400));
        await tester.pumpAndSettle();
        await tester.drag(feedList, const Offset(0, 300));
        await tester.pumpAndSettle();
      }

      await tester.tap(find.text('Explore'));
      await tester.pumpAndSettle(const Duration(seconds: 6));

      final messageButtons = find.byWidgetPredicate(
        (widget) => widget.key is Key && widget.key.toString().contains('e2e_character_message_'),
      );

      expect(messageButtons, findsWidgets);
      await tester.tap(messageButtons.first);
      await tester.pumpAndSettle(const Duration(seconds: 8));

      await tester.enterText(
        find.byKey(const Key('e2e_chat_input')),
        'E2E integration test message',
      );
      await tester.tap(find.byKey(const Key('e2e_chat_send')));
      await tester.pumpAndSettle(const Duration(seconds: 10));

      await tester.pageBack();
      await tester.pumpAndSettle(const Duration(seconds: 4));

      final energyAfter = _readEnergyRemaining(tester);
      expect(energyAfter, isNotNull);
      expect(energyAfter!, lessThan(energyBefore!));
    });
  });
}

int? _readEnergyRemaining(WidgetTester tester) {
  final barFinder = find.byKey(const Key('e2e_energy_bar'));
  if (barFinder.evaluate().isEmpty) return null;

  final pattern = RegExp(r'(\d+)\s*/\s*\d+');
  for (final element in barFinder.evaluate()) {
    final match = _findEnergyText(element, pattern);
    if (match != null) return int.tryParse(match.group(1)!);
  }

  final allText = find.byType(Text);
  for (var i = 0; i < allText.evaluate().length; i++) {
    final widget = tester.widget<Text>(allText.at(i));
    final match = pattern.firstMatch(widget.data ?? '');
    if (match != null) return int.tryParse(match.group(1)!);
  }

  return null;
}

RegExpMatch? _findEnergyText(Element element, RegExp pattern) {
  final widget = element.widget;
  if (widget is Text) {
    return pattern.firstMatch(widget.data ?? '');
  }

  RegExpMatch? found;
  element.visitChildren((child) {
    found ??= _findEnergyText(child, pattern);
  });
  return found;
}
