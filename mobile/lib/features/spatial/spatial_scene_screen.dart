import 'package:flutter/material.dart';

import '../../models/messaging.dart';
import '../../models/spatial.dart';
import '../../services/spatial_audio_service.dart';
import '../../services/bci_input_service.dart';
import '../../services/api_service.dart';
import '../../services/gaze_voice_navigation_service.dart';
import '../../services/spatial_context_service.dart';
import '../../services/spatial_scene_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/spatial_platform.dart';
import '../../widgets/character_3d_viewer.dart';
import '../../widgets/spatial/plastic_layout.dart';

/// Immersive spatial workspace — persistent AI avatar anchored in the user's room.
class SpatialSceneScreen extends StatefulWidget {
  const SpatialSceneScreen({
    super.key,
    required this.api,
    required this.character,
    this.sceneKey,
  });

  final ApiService api;
  final AiCharacter character;
  final String? sceneKey;

  @override
  State<SpatialSceneScreen> createState() => _SpatialSceneScreenState();
}

class _SpatialSceneScreenState extends State<SpatialSceneScreen> {
  final _contextService = SpatialContextService();
  final _sceneService = SpatialSceneService();
  final _nav = GazeVoiceNavigationService();
  final _spatialAudio = SpatialAudioService();
  final _bci = BciInputService();
  final _messageController = TextEditingController();

  double _distanceMeters = 1.0;
  ProxemicZone _zone = ProxemicZone.personal;
  String? _aiReply;
  bool _busy = false;
  bool _voiceNav = false;
  Color _bciBackground = Colors.black;
  Color _bciAccent = AppColors.primary;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await SpatialContextService.init();
    await _nav.init();
    await _spatialAudio.init();
    _nav.setCommandHandler((action) {
      if (action == SpatialNavAction.goBack && mounted) {
        Navigator.of(context).pop();
      }
    });
    _bci.setCharacterId(widget.character.id);
    _bci.setThemeCallback((theme) {
      if (!mounted) return;
      setState(() {
        _bciBackground = Color(theme.backgroundColor);
        _bciAccent = Color(theme.accentColor);
      });
    });
    await _bci.init(api: widget.api, simulationMode: false);
    await _refreshContext();
    _spatialAudio.updateFromSpatialContext(distanceMeters: _distanceMeters);
  }

  Future<void> _refreshContext() async {
    final ctx = await _contextService.processLocalContext(
      userDistanceMeters: _distanceMeters,
      roomType: 'living',
      lightingLevel: 'neutral',
    );
    setState(() {
      _zone = ctx.proxemicZone;
    });
  }

  Future<void> _persistScene() async {
    final scene = SpatialScene(
      sceneKey: widget.sceneKey ?? 'scene-${widget.character.id}',
      characterId: widget.character.id,
      characterName: widget.character.name,
      anchorLabel: '${widget.character.name} workspace',
      isPersistent: true,
    );
    final context = await _contextService.processLocalContext(userDistanceMeters: _distanceMeters);

    await _sceneService.persistScene(
      scene: scene,
      context: context,
      syncToBackend: (s, c) => widget.api.saveSpatialScene(scene: s, context: c),
    );

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Spatial scene anchored — persists across sessions')),
    );
  }

  Future<void> _sendAmbient() async {
    final text = _messageController.text.trim();
    if (text.isEmpty || _busy) return;

    setState(() => _busy = true);
    try {
      final context = await _contextService.processLocalContext(userDistanceMeters: _distanceMeters);
      final result = await widget.api.spatialCharacterReact(
        characterId: widget.character.id,
        message: text,
        context: context,
        sceneKey: widget.sceneKey,
      );
      if (!mounted) return;
      setState(() {
        _aiReply = result.content;
        _zone = context.proxemicZone;
      });
      _spatialAudio.updateFromSpatialContext(distanceMeters: _distanceMeters);
      await _spatialAudio.speakSpatial(result.content);
      _messageController.clear();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _toggleVoiceNav() async {
    if (_voiceNav) {
      await _nav.stopVoiceNavigation();
    } else {
      await _nav.startVoiceNavigation();
    }
    setState(() => _voiceNav = !_voiceNav);
  }

  @override
  void dispose() {
    _nav.dispose();
    _spatialAudio.dispose();
    _bci.dispose();
    _messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bciBackground,
      appBar: AppBar(
        backgroundColor: _bciBackground,
        title: Text('${widget.character.name} · Spatial'),
        actions: [
          IconButton(
            onPressed: _persistScene,
            icon: Icon(Icons.anchor, color: _bciAccent),
            tooltip: 'Anchor scene',
          ),
          IconButton(
            onPressed: _toggleVoiceNav,
            icon: Icon(_voiceNav ? Icons.hearing_disabled : Icons.hearing, color: _bciAccent),
            tooltip: 'Voice navigation',
          ),
        ],
      ),
      body: SpatialContinuityShell(
        zone: _zone,
        background: Character3DViewer(
          modelUrl: Character3DAssets.forCharacter(
            modelUrl: widget.character.model3dUrl,
            handle: widget.character.handle,
          ),
          config: Character3DConfig(
            height: MediaQuery.sizeOf(context).height * 0.55,
            transparentBackground: true,
            rotationSpeed: 4,
          ),
          fallbackLabel: widget.character.name,
        ),
        header: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              if (SpatialPlatform.isSpatialEnvironment)
                ProxemicZoneControl(
                  zone: _zone,
                  distanceMeters: _distanceMeters,
                  onChanged: (d) async {
                    setState(() => _distanceMeters = d);
                    _spatialAudio.updateFromSpatialContext(distanceMeters: d);
                    await _refreshContext();
                  },
                ),
              if (_aiReply != null)
                PlasticLayout(
                  zone: _zone,
                  child: Text(_aiReply!, style: const TextStyle(height: 1.4)),
                ),
            ],
          ),
        ),
        foreground: Align(
          alignment: Alignment.bottomCenter,
          child: PlasticLayout(
            zone: _zone,
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    decoration: const InputDecoration(
                      hintText: 'Speak to your spatial companion…',
                      border: InputBorder.none,
                    ),
                    onSubmitted: (_) => _sendAmbient(),
                  ),
                ),
                GazeTarget(
                  id: 'spatial_send',
                  navigation: _nav,
                  onActivate: _sendAmbient,
                  child: IconButton(
                    onPressed: _busy ? null : _sendAmbient,
                    icon: Icon(Icons.send_rounded, color: _bciAccent),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
