import 'package:flutter_test/flutter_test.dart';
import 'package:status/models/session.dart';
import 'package:status/theme/app_theme.dart';

void main() {
  test('SessionUser parses admin flag', () {
    final user = SessionUser.fromJson({
      'id': '00000000-0000-0000-0000-000000000001',
      'username': 'player_one',
      'display_name': 'Player One',
      'is_admin': true,
      'reputation': 10,
      'follower_count': 5,
      'following_count': 2,
    });

    expect(user.isAdmin, isTrue);
    expect(user.displayName, 'Player One');
  });

  test('App theme builds without error', () {
    final theme = buildAppTheme();
    expect(theme.scaffoldBackgroundColor, isNotNull);
  });
}
