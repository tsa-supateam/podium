# ADR 0004: JSON over a loopback WebSocket (not MessagePack)

**Status:** accepted (deviation from the first spec draft)

The spec proposed MessagePack. At about 40 small messages per second, JSON's overhead is negligible.
It is readable in devtools and in the NDJSON telemetry, and it needs no extra library on either side.
Binary frames are still used for files (video upload, WAV download): a 4-byte header length, a JSON
header, then the raw bytes.

The engine stamps gaze samples with its own audio clock (samples received ÷ 16 000) when they arrive.
That replaced the NTP-style clock sync in the spec: loopback latency (< 2 ms) is far below one video
frame, and a single clock removes a whole class of alignment bugs.
