import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../models/admin_character.dart';
import '../../models/messaging.dart';
import '../../models/session.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/character_avatar.dart';

class CharacterCreatorScreen extends StatefulWidget {
  const CharacterCreatorScreen({
    super.key,
    required this.api,
    required this.onCreated,
  });

  final ApiService api;
  final ValueChanged<UserCreatedCharacter> onCreated;

  @override
  State<CharacterCreatorScreen> createState() => _CharacterCreatorScreenState();
}

class _CharacterCreatorScreenState extends State<CharacterCreatorScreen> {
  final _nameController = TextEditingController();
  final _handleController = TextEditingController();
  final _fandomController = TextEditingController(text: 'General');
  final _bioController = TextEditingController();
  final _toneController = TextEditingController(text: 'neutral');
  final _traitsController = TextEditingController();
  final _systemPromptController = TextEditingController();
  bool _publish = true;
  bool _saving = false;
  File? _avatarFile;
  String? _avatarUrl;

  @override
  void dispose() {
    _nameController.dispose();
    _handleController.dispose();
    _fandomController.dispose();
    _bioController.dispose();
    _toneController.dispose();
    _traitsController.dispose();
    _systemPromptController.dispose();
    super.dispose();
  }

  Future<void> _pickAvatar() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(source: ImageSource.gallery, maxWidth: 800);
    if (file != null) {
      setState(() => _avatarFile = File(file.path));
    }
  }

  Future<void> _save() async {
    if (_nameController.text.trim().isEmpty ||
        _handleController.text.trim().isEmpty ||
        _fandomController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Name, handle, and fandom are required')),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      if (_avatarFile != null) {
        _avatarUrl = await widget.api.uploadImage(_avatarFile!);
      }

      final traits = _traitsController.text
          .split(',')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();

      final character = AdminCharacter(
        name: _nameController.text.trim(),
        handle: _handleController.text.trim(),
        fandom: _fandomController.text.trim(),
        bio: _bioController.text.trim().isEmpty ? null : _bioController.text.trim(),
        personality: {
          'tone': _toneController.text.trim().isEmpty ? 'neutral' : _toneController.text.trim(),
          if (traits.isNotEmpty) 'traits': traits,
        },
        systemPrompt: _systemPromptController.text.trim().isEmpty
            ? null
            : _systemPromptController.text.trim(),
        isActive: true,
      );

      final created = await widget.api.createCharacter(
        character: character,
        avatarUrl: _avatarUrl,
        publish: _publish,
      );

      if (!mounted) return;
      widget.onCreated(created);
      Navigator.of(context).pop(created);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _publish
                ? '${created.name} is live on Explore — earn Energy when others interact!'
                : '${created.name} saved as draft',
          ),
        ),
      );
    } on ContentModerationException catch (e) {
      if (!mounted) return;
      _showModerationAlert(e.message);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _showModerationAlert(String message) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Content blocked'),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create Character'),
        actions: [
          TextButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Publish'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Center(
            child: GestureDetector(
              onTap: _pickAvatar,
              child: Stack(
                children: [
                  CharacterAvatar(
                    name: _nameController.text.isEmpty ? '?' : _nameController.text,
                    imageUrl: _avatarFile != null ? null : _avatarUrl,
                    radius: 44,
                  ),
                  if (_avatarFile != null)
                    CircleAvatar(
                      radius: 44,
                      backgroundImage: FileImage(_avatarFile!),
                    ),
                  Positioned(
                    bottom: 0,
                    right: 0,
                    child: CircleAvatar(
                      radius: 16,
                      backgroundColor: AppColors.primary,
                      child: const Icon(Icons.camera_alt, size: 16, color: Colors.white),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          _field('Name', _nameController, hint: 'Nova Starling'),
          _field('Handle', _handleController, hint: 'nova_star', prefix: '@'),
          _field('Fandom', _fandomController, hint: 'Stellar Chronicles'),
          _field('Bio', _bioController, hint: 'Short character description', maxLines: 2),
          _field('Tone', _toneController, hint: 'confident, dry, warm…'),
          _field('Traits', _traitsController, hint: 'leader, sarcastic (comma-separated)'),
          _field(
            'System prompt',
            _systemPromptController,
            hint: 'Optional custom AI persona instructions',
            maxLines: 4,
          ),
          SwitchListTile(
            title: const Text('Publish to Explore'),
            subtitle: const Text('Earn Energy when others DM or follow your character'),
            value: _publish,
            onChanged: (v) => setState(() => _publish = v),
          ),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                'Creator rewards: +3 Energy per DM, +5 per follow, +2 per feed reply on your character.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textMuted),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _field(
    String label,
    TextEditingController controller, {
    String? hint,
    String? prefix,
    int maxLines = 1,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: controller,
        maxLines: maxLines,
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          prefixText: prefix,
          filled: true,
          fillColor: AppColors.surfaceElevated,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
        ),
      ),
    );
  }
}
