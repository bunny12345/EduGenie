import 'dart:js_interop';
import 'dart:typed_data';

@JS('Blob')
extension type _Blob._(JSObject _) implements JSObject {
  external factory _Blob(JSArray<JSUint8Array> parts, _BlobOptions options);
}

extension type _BlobOptions._(JSObject _) implements JSObject {
  external factory _BlobOptions({String type});
}

@JS('URL.createObjectURL')
external String _createObjectURL(_Blob blob);

@JS('URL.revokeObjectURL')
external void _revokeObjectURL(String url);

@JS('document.createElement')
external _Anchor _createElement(String tag);

extension type _Anchor._(JSObject _) implements JSObject {
  external set href(String value);
  external set download(String value);
  external void click();
}

Future<void> saveAttachment(Uint8List bytes, String filename, String mimeType) async {
  final url = _createObjectURL(_Blob([bytes.toJS].toJS, _BlobOptions(type: mimeType)));
  try {
    _createElement('a')
      ..href = url
      ..download = filename
      ..click();
    await Future<void>.delayed(const Duration(seconds: 1));
  } finally {
    _revokeObjectURL(url);
  }
}
