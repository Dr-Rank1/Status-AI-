import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../models/post.dart';
import '../../../main.dart' show permissionService;
import '../../../theme/app_theme.dart';

Future<String?> showReplySheet(
  BuildContext context, {
  required Post post,
  required int energyRemaining,
  int replyCost = 5,
}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (context) => _ReplySheet(
      post: post,
      energyRemaining: energyRemaining,
      replyCost: replyCost,
    ),
  );
}

class _ReplySheet extends StatefulWidget {
  const _ReplySheet({
    required this.post,
    required this.energyRemaining,
    required this.replyCost,
  });

  final Post post;
  final int energyRemaining;
  final int replyCost;

  @override
  State<_ReplySheet> createState() => _ReplySheetState();
}

class _ReplySheetState extends State<_ReplySheet> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();

  bool get _canAfford => widget.energyRemaining >= widget.replyCost;
  bool get _hasText => _controller.text.trim().isNotEmpty;

  @override
  void initState() {
    super.initState();
    _controller.addListener(() => setState(() {}));
    WidgetsBinding.instance.addPostFrameCallback((_) => _focusNode.requestFocus());
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + bottomInset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text('Reply', style: Theme.of(context).textTheme.titleMedium),
              const Spacer(),
              Text(
                'Costs ${widget.replyCost} energy',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: AppColors.energy,
                    ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'To @${widget.post.authorHandle}',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: AppColors.textMuted,
                ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            focusNode: _focusNode,
            maxLines: 4,
            minLines: 3,
            enabled: _canAfford,
            decoration: InputDecoration(
              hintText: widget.post.isCharacter
                  ? 'Say something — ${widget.post.authorName} may respond...'
                  : 'Write a reply...',
              filled: true,
              fillColor: AppColors.surfaceElevated,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          if (!_canAfford) ...[
            const SizedBox(height: 8),
            Text(
              'Not enough energy (${widget.energyRemaining}/${widget.replyCost}).',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.like),
            ),
          ],
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _canAfford && _hasText
                ? () => Navigator.pop(context, _controller.text.trim())
                : null,
            child: Text(widget.post.isCharacter ? 'Reply & ask AI' : 'Reply'),
          ),
        ],
      ),
    );
  }
}

class ComposeResult {
  const ComposeResult({required this.content, this.imageFile});

  final String content;
  final File? imageFile;
}

Future<ComposeResult?> showComposeSheet(
  BuildContext context, {
  required int energyRemaining,
  int postCost = 10,
}) {
  return showModalBottomSheet<ComposeResult>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (context) => _ComposeSheet(
      energyRemaining: energyRemaining,
      postCost: postCost,
    ),
  );
}

class _ComposeSheet extends StatefulWidget {
  const _ComposeSheet({required this.energyRemaining, required this.postCost});

  final int energyRemaining;
  final int postCost;

  @override
  State<_ComposeSheet> createState() => _ComposeSheetState();
}

class _ComposeSheetState extends State<_ComposeSheet> {
  final _controller = TextEditingController();
  final _picker = ImagePicker();
  File? _imageFile;

  bool get _canAfford => widget.energyRemaining >= widget.postCost;
  bool get _hasText => _controller.text.trim().isNotEmpty;

  Future<void> _pickImage() async {
    final allowed = await permissionService.ensurePhotosAccess();
    if (!allowed) return;

    final picked = await _picker.pickImage(source: ImageSource.gallery, maxWidth: 1200);
    if (picked != null) {
      setState(() => _imageFile = File(picked.path));
    }
  }

  @override
  void initState() {
    super.initState();
    _controller.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + bottomInset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text('New post', style: Theme.of(context).textTheme.titleMedium),
              const Spacer(),
              Text(
                'Costs ${widget.postCost} energy',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(color: AppColors.energy),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_imageFile != null) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.file(_imageFile!, height: 140, width: double.infinity, fit: BoxFit.cover),
            ),
            const SizedBox(height: 8),
          ],
          TextField(
            controller: _controller,
            maxLines: 5,
            minLines: 3,
            enabled: _canAfford,
            decoration: InputDecoration(
              hintText: "What's on your mind?",
              filled: true,
              fillColor: AppColors.surfaceElevated,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              IconButton(
                onPressed: _canAfford ? _pickImage : null,
                icon: const Icon(Icons.image_outlined),
                tooltip: 'Add image',
              ),
              if (_imageFile != null)
                TextButton(
                  onPressed: () => setState(() => _imageFile = null),
                  child: const Text('Remove image'),
                ),
            ],
          ),
          const SizedBox(height: 4),
          FilledButton(
            onPressed: _canAfford && _hasText
                ? () => Navigator.pop(
                      context,
                      ComposeResult(content: _controller.text.trim(), imageFile: _imageFile),
                    )
                : null,
            child: const Text('Post'),
          ),
        ],
      ),
    );
  }
}
