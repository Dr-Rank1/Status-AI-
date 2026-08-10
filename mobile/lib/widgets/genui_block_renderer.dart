import 'package:flutter/material.dart';
import 'package:flutter_local_ai/flutter_local_ai.dart';

import '../theme/app_theme.dart';

/// Renders [GenUiModuleSpec] typed blocks using Status dark-mode design tokens.
class GenUiBlockRenderer extends StatefulWidget {
  const GenUiBlockRenderer({
    super.key,
    required this.module,
    this.onPollVote,
  });

  final GenUiModuleSpec module;
  final void Function(String itemId, bool selected)? onPollVote;

  @override
  State<GenUiBlockRenderer> createState() => _GenUiBlockRendererState();
}

class _GenUiBlockRendererState extends State<GenUiBlockRenderer> {
  final Map<String, bool> _checked = {};

  Color get _toneColor {
    switch (widget.module.tone) {
      case 'apricot':
        return AppColors.energy;
      case 'sky':
        return AppColors.accent;
      case 'lilac':
        return AppColors.primary;
      default:
        return AppColors.success;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;

    return Card(
      color: AppColors.surfaceElevated,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: _toneColor.withValues(alpha: 0.35)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.auto_awesome, color: _toneColor, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    widget.module.title,
                    style: theme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
            if (widget.module.blurb.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                widget.module.blurb,
                style: theme.bodySmall?.copyWith(color: AppColors.textSecondary),
              ),
            ],
            const SizedBox(height: 12),
            ...widget.module.blocks.map(_buildBlock),
          ],
        ),
      ),
    );
  }

  Widget _buildBlock(Map<String, dynamic> block) {
    final type = (block['type'] ?? '').toString();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: switch (type) {
        'checklist' => _checklistBlock(block),
        'stat' => _statBlock(block),
        'progress' => _progressBlock(block),
        'amount' => _amountBlock(block),
        'list' => _listBlock(block),
        'reminder' => _reminderBlock(block),
        'calc' => _calcBlock(block),
        'note' => _noteBlock(block),
        _ => _noteBlock(block),
      },
    );
  }

  Widget _checklistBlock(Map<String, dynamic> block) {
    final label = (block['label'] ?? block['title'] ?? 'Poll').toString();
    final items = (block['items'] as List?)?.cast<Map>() ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        ...items.asMap().entries.map((entry) {
          final item = Map<String, dynamic>.from(entry.value);
          final id = (item['id'] ?? 'item_${entry.key}').toString();
          final text = (item['text'] ?? item['label'] ?? 'Option').toString();
          final selected = _checked[id] ?? false;
          return Material(
            color: selected ? _toneColor.withValues(alpha: 0.12) : AppColors.surface,
            borderRadius: BorderRadius.circular(10),
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () {
                setState(() => _checked[id] = !selected);
                widget.onPollVote?.call(id, !selected);
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                child: Row(
                  children: [
                    Icon(
                      selected ? Icons.check_circle : Icons.circle_outlined,
                      color: selected ? _toneColor : AppColors.textMuted,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: Text(text)),
                  ],
                ),
              ),
            ),
          );
        }),
      ],
    );
  }

  Widget _statBlock(Map<String, dynamic> block) {
    final label = (block['label'] ?? 'Mood').toString();
    final value = (block['value'] ?? block['text'] ?? '—').toString();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: _toneColor.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _progressBlock(Map<String, dynamic> block) {
    final label = (block['label'] ?? 'Progress').toString();
    final value = (block['value'] as num?)?.toDouble() ?? 0;
    final target = (block['target'] as num?)?.toDouble() ?? 100;
    final pct = target > 0 ? (value / target).clamp(0.0, 1.0) : 0.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label),
            Text('${(pct * 100).round()}%'),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            value: pct,
            minHeight: 8,
            backgroundColor: AppColors.border,
            color: _toneColor,
          ),
        ),
      ],
    );
  }

  Widget _amountBlock(Map<String, dynamic> block) {
    final label = (block['label'] ?? 'Amount').toString();
    final prefix = (block['prefix'] ?? '').toString();
    final value = (block['value'] ?? '').toString();
    return Row(
      children: [
        Text('$label: ', style: const TextStyle(color: AppColors.textSecondary)),
        Text('$prefix$value', style: TextStyle(color: _toneColor, fontWeight: FontWeight.w700)),
      ],
    );
  }

  Widget _listBlock(Map<String, dynamic> block) {
    final label = (block['label'] ?? block['title'] ?? 'List').toString();
    final items = (block['items'] as List?) ?? [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        ...items.map((item) {
          final text = item is Map
              ? (item['text'] ?? item['label'] ?? '').toString()
              : item.toString();
          return Padding(
            padding: const EdgeInsets.only(left: 8, top: 2),
            child: Row(
              children: [
                Icon(Icons.fiber_manual_record, size: 8, color: _toneColor),
                const SizedBox(width: 8),
                Expanded(child: Text(text)),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _reminderBlock(Map<String, dynamic> block) {
    final label = (block['label'] ?? block['title'] ?? 'Reminder').toString();
    final when = (block['when'] ?? block['time'] ?? '').toString();
    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      leading: Icon(Icons.notifications_active_outlined, color: _toneColor),
      title: Text(label),
      subtitle: when.isNotEmpty ? Text(when) : null,
    );
  }

  Widget _calcBlock(Map<String, dynamic> block) {
    final label = (block['label'] ?? 'Mini game').toString();
    final expr = (block['expression'] ?? block['text'] ?? 'Tap to play').toString();
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(Icons.calculate_outlined, color: _toneColor),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(expr, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _noteBlock(Map<String, dynamic> block) {
    final text = (block['text'] ?? block['label'] ?? block['title'] ?? '').toString();
    return Text(text, style: const TextStyle(height: 1.4));
  }
}
