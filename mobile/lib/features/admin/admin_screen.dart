import 'package:flutter/material.dart';

import '../../models/admin_character.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key, required this.api});

  final ApiService api;

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  late Future<List<AdminCharacter>> _charactersFuture;
  AdminCharacter? _selected;

  final _nameController = TextEditingController();
  final _handleController = TextEditingController();
  final _fandomController = TextEditingController();
  final _bioController = TextEditingController();
  final _systemPromptController = TextEditingController();
  final _traitsController = TextEditingController();
  final _toneController = TextEditingController();
  bool _isActive = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _handleController.dispose();
    _fandomController.dispose();
    _bioController.dispose();
    _systemPromptController.dispose();
    _traitsController.dispose();
    _toneController.dispose();
    super.dispose();
  }

  void _reload() {
    _charactersFuture = widget.api.fetchAdminCharacters();
  }

  void _select(AdminCharacter character) {
    setState(() {
      _selected = character;
      _nameController.text = character.name;
      _handleController.text = character.handle;
      _fandomController.text = character.fandom;
      _bioController.text = character.bio ?? '';
      _systemPromptController.text = character.systemPrompt ?? '';
      _traitsController.text = (character.personality['traits'] as List?)?.join(', ') ?? '';
      _toneController.text = character.personality['tone'] as String? ?? '';
      _isActive = character.isActive;
    });
  }

  void _newCharacter() {
    setState(() {
      _selected = null;
      _nameController.clear();
      _handleController.clear();
      _fandomController.text = 'General';
      _bioController.clear();
      _systemPromptController.clear();
      _traitsController.clear();
      _toneController.text = 'neutral';
      _isActive = true;
    });
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
      final traits = _traitsController.text
          .split(',')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();

      final character = AdminCharacter(
        id: _selected?.id,
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
        isActive: _isActive,
      );

      await widget.api.upsertAdminCharacter(character);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_selected == null ? 'Character created' : 'Character updated')),
      );
      setState(_reload);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin · Characters'),
        actions: [
          IconButton(onPressed: _newCharacter, icon: const Icon(Icons.add_rounded), tooltip: 'New'),
          IconButton(
            onPressed: () => setState(_reload),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: Row(
        children: [
          Expanded(
            flex: 2,
            child: FutureBuilder<List<AdminCharacter>>(
              future: _charactersFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator(color: AppColors.primary));
                }
                if (snapshot.hasError) {
                  return Center(child: Text(snapshot.error.toString()));
                }
                final items = snapshot.data ?? [];
                return ListView.separated(
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final c = items[index];
                    final selected = _selected?.id == c.id;
                    return ListTile(
                      selected: selected,
                      title: Text(c.name),
                      subtitle: Text('@${c.handle} · ${c.fandom}${c.isActive ? '' : ' · inactive'}'),
                      onTap: () => _select(c),
                    );
                  },
                );
              },
            ),
          ),
          const VerticalDivider(width: 1),
          Expanded(
            flex: 3,
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    _selected == null ? 'New character' : 'Edit character',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 16),
                  _field('Name', _nameController),
                  _field('Handle', _handleController),
                  _field('Fandom', _fandomController),
                  _field('Bio', _bioController, maxLines: 2),
                  _field('Tone', _toneController),
                  _field('Traits (comma-separated)', _traitsController),
                  _field('System prompt override', _systemPromptController, maxLines: 6),
                  SwitchListTile(
                    value: _isActive,
                    onChanged: (v) => setState(() => _isActive = v),
                    title: const Text('Active'),
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _saving ? null : _save,
                    child: _saving
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(_selected == null ? 'Create' : 'Save changes'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _field(String label, TextEditingController controller, {int maxLines = 1}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: controller,
        maxLines: maxLines,
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: AppColors.surfaceElevated,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
        ),
      ),
    );
  }
}
