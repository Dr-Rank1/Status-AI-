import 'package:livekit_client/livekit_client.dart';

/// Connects to a LiveKit room for scalable multi-modal AI live broadcast.
class LiveKitService {
  Room? _room;
  EventsListener<RoomEvent>? _listener;

  Room? get room => _room;
  bool get isConnected => _room?.connectionState == ConnectionState.connected;

  Future<void> connect({
    required String url,
    required String token,
  }) async {
    await disconnect();

    _room = Room();
    _listener = _room!.createListener()
      ..on<RoomDisconnectedEvent>((_) {})
      ..on<TrackSubscribedEvent>((_) {});

    await _room!.connect(
      url,
      token,
      connectOptions: const ConnectOptions(autoSubscribe: true),
    );
  }

  RemoteVideoTrack? get firstRemoteVideo {
    for (final participant in _room?.remoteParticipants.values ?? []) {
      for (final publication in participant.videoTrackPublications) {
        final track = publication.track;
        if (track is RemoteVideoTrack) return track;
      }
    }
    return null;
  }

  Future<void> disconnect() async {
    await _listener?.dispose();
    _listener = null;
    await _room?.disconnect();
    await _room?.dispose();
    _room = null;
  }
}
