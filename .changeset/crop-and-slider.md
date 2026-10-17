---
"@ghub/ui": minor
---

Modern gains the two controls drawn for GPlatform Identity's picture dialog (sheet 34, C4). `Slider` is a styled native range input named by its visible label, with the value in words as `aria-valuetext` and printed at its end. `ImageCrop` moves and scales a picture under a fixed circle: drag, or with the crop focused the arrows move it a pixel, Shift and an arrow ten, plus and minus zoom by a tenth, and Home resets, each announced in the caller's words. The zoom is the caller's, so a `Slider` can drive it, and the crop reports the square inside the circle in the picture's own pixels; `drawCrop` draws that square onto a canvas at a size. The arithmetic is exported as `cropArea`, `clampCropPosition`, `zoomCropPosition` and `cropBaseScale`.
