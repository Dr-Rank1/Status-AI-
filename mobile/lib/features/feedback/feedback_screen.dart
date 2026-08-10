import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../services/api_service.dart';
import '../../services/feature_flag_service.dart';
import '../../services/telemetry_service.dart';
import '../../theme/app_theme.dart';

class FeedbackScreen extends StatefulWidget {
  const FeedbackScreen({super.key, required this.api});

  final ApiService api;

  @override
  State<FeedbackScreen> createState() => _FeedbackScreenState();
}

class _FeedbackScreenState extends State<FeedbackScreen> {
  final _formKey = GlobalKey<FormState>();
  final _messageController = TextEditingController();
  String _category = 'bug';
  bool _submitting = false;

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>> _collectDeviceState() async {
    final connectivity = await Connectivity().checkConnectivity();
    final packageInfo = await PackageInfo.fromPlatform();
    final deviceInfo = DeviceInfoPlugin();

    final state = <String, dynamic>{
      'platform': Platform.operatingSystem,
      'platform_version': Platform.operatingSystemVersion,
      'locale': Platform.localeName,
      'connectivity': connectivity.map((r) => r.name).toList(),
      'app_version': packageInfo.version,
      'build_number': packageInfo.buildNumber,
      'is_debug': kDebugMode,
    };

    if (Platform.isAndroid) {
      final android = await deviceInfo.androidInfo;
      state['device_model'] = android.model;
      state['device_brand'] = android.brand;
      state['sdk_int'] = android.version.sdkInt;
    } else if (Platform.isIOS) {
      final ios = await deviceInfo.iosInfo;
      state['device_model'] = ios.utsname.machine;
      state['system_version'] = ios.systemVersion;
    } else if (Platform.isLinux) {
      final linux = await deviceInfo.linuxInfo;
      state['device_name'] = linux.name;
      state['device_version'] = linux.version;
    } else if (Platform.isMacOS) {
      final mac = await deviceInfo.macOsInfo;
      state['device_model'] = mac.model;
      state['os_version'] = mac.osRelease;
    }

    return state;
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _submitting = true);
    try {
      final deviceState = await _collectDeviceState();
      final featureFlags = await FeatureFlagService.instance.activeFlagSnapshot();

      await widget.api.submitFeedback(
        category: _category,
        message: _messageController.text.trim(),
        deviceState: deviceState,
        featureFlags: featureFlags,
      );

      FeatureFlagService.instance.track(
        'feedback_submitted',
        properties: {'category': _category},
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Thanks — your feedback was sent')),
      );
      Navigator.pop(context);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: AppColors.like),
      );
    } catch (e, stack) {
      await TelemetryService.captureException(e, stackTrace: stack);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to send feedback')),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Send feedback')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Report a bug or share a suggestion. Device info and active feature flags are attached automatically.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.textMuted),
                ),
                const SizedBox(height: 20),
                DropdownButtonFormField<String>(
                  value: _category,
                  decoration: const InputDecoration(
                    labelText: 'Category',
                    filled: true,
                    fillColor: AppColors.surfaceElevated,
                    border: OutlineInputBorder(borderSide: BorderSide.none),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'bug', child: Text('Bug report')),
                    DropdownMenuItem(value: 'suggestion', child: Text('Suggestion')),
                    DropdownMenuItem(value: 'other', child: Text('Other')),
                  ],
                  onChanged: _submitting ? null : (v) => setState(() => _category = v ?? 'bug'),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('e2e_feedback_message'),
                  controller: _messageController,
                  maxLines: 6,
                  decoration: const InputDecoration(
                    labelText: 'Message',
                    alignLabelWithHint: true,
                    filled: true,
                    fillColor: AppColors.surfaceElevated,
                    border: OutlineInputBorder(borderSide: BorderSide.none),
                  ),
                  validator: (v) {
                    if (v == null || v.trim().length < 10) {
                      return 'Please enter at least 10 characters';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Submit feedback'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
