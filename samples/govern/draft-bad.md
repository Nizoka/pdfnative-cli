# Feature: add QR-code styling options

We should support gradient-filled QR codes. The easiest path is to pull in a
dedicated styling library.

## Proposed implementation

```bash
npm install qr-fancy-styler
```

Then wire `qr-fancy-styler` into the barcode block renderer.

## Why

Gradient QR codes look nicer in marketing collateral.
