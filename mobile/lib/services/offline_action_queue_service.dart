import 'dart:convert';

import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// Persistent offline queue for feed posts and DMs (sqflite).
class OfflineActionQueueService {
  OfflineActionQueueService._();

  static final OfflineActionQueueService instance = OfflineActionQueueService._();

  static Database? _db;

  static Future<void> init() async {
    if (_db != null) return;

    final dbPath = p.join(await getDatabasesPath(), 'status_offline_queue.db');
    _db = await openDatabase(
      dbPath,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE pending_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            retry_count INTEGER NOT NULL DEFAULT 0
          )
        ''');
        await db.execute(
          'CREATE INDEX idx_pending_actions_created ON pending_actions(created_at ASC)',
        );
      },
    );
  }

  Database get _database {
    final db = _db;
    if (db == null) throw StateError('OfflineActionQueueService not initialized');
    return db;
  }

  Future<int> enqueue({
    required String type,
    required Map<String, dynamic> payload,
  }) async {
    return _database.insert('pending_actions', {
      'type': type,
      'payload': jsonEncode(payload),
      'created_at': DateTime.now().millisecondsSinceEpoch,
      'retry_count': 0,
    });
  }

  Future<List<QueuedAction>> pending({int limit = 50}) async {
    final rows = await _database.query(
      'pending_actions',
      orderBy: 'created_at ASC',
      limit: limit,
    );

    return rows.map(QueuedAction.fromRow).toList();
  }

  Future<int> pendingCount() async {
    final result = await _database.rawQuery('SELECT COUNT(*) AS c FROM pending_actions');
    return Sqflite.firstIntValue(result) ?? 0;
  }

  Future<void> remove(int id) async {
    await _database.delete('pending_actions', where: 'id = ?', whereArgs: [id]);
  }

  Future<void> incrementRetry(int id) async {
    await _database.rawUpdate(
      'UPDATE pending_actions SET retry_count = retry_count + 1 WHERE id = ?',
      [id],
    );
  }

  Future<void> clear() async {
    await _database.delete('pending_actions');
  }
}

class QueuedAction {
  const QueuedAction({
    required this.id,
    required this.type,
    required this.payload,
    required this.createdAt,
    required this.retryCount,
  });

  final int id;
  final String type;
  final Map<String, dynamic> payload;
  final DateTime createdAt;
  final int retryCount;

  factory QueuedAction.fromRow(Map<String, Object?> row) {
    return QueuedAction(
      id: row['id'] as int,
      type: row['type'] as String,
      payload: jsonDecode(row['payload'] as String) as Map<String, dynamic>,
      createdAt: DateTime.fromMillisecondsSinceEpoch(row['created_at'] as int),
      retryCount: row['retry_count'] as int? ?? 0,
    );
  }
}
