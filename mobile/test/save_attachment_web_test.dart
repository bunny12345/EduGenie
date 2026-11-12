@TestOn('browser')
library;

import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/services/save_attachment_web.dart';

@JS('document')
external JSObject get _document;

void main() {
  test('browser download creates an image blob and downloads with the requested filename', () async {
    final original = _document.getProperty<JSFunction>('createElement'.toJS);
    String? filename;
    String? href;
    var clicked = 0;
    _document.setProperty(
      'createElement'.toJS,
      ((JSString tag) {
        final element = original.callAsFunction(_document, tag) as JSObject;
        if (tag.toDart == 'a') {
          element.setProperty(
            'click'.toJS,
            (() {
              clicked++;
              filename = element.getProperty<JSString>('download'.toJS).toDart;
              href = element.getProperty<JSString>('href'.toJS).toDart;
            }).toJS,
          );
        }
        return element;
      }).toJS,
    );
    addTearDown(() => _document.setProperty('createElement'.toJS, original));
    await saveAttachment(Uint8List.fromList([137, 80, 78, 71]), 'homework.png', 'image/png');
    expect(clicked, 1);
    expect(filename, 'homework.png');
    expect(href, startsWith('blob:'));
  });
}
