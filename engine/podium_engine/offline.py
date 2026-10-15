"""Runtime offline guard.

Podium must never reach the network. `enforce()` is called at engine start-up:
it sets the offline flags that ML libraries respect and replaces socket
connect so that any attempt to reach a non-loopback host raises immediately.
"""

from __future__ import annotations

import ipaddress
import os
import socket

_LOOPBACK_NAMES = {"localhost", "127.0.0.1", "::1"}


class NetworkBlockedError(RuntimeError):
    pass


def _is_loopback(host: object) -> bool:
    if not isinstance(host, str):
        return True  # AF_UNIX paths, etc.
    if host in _LOOPBACK_NAMES:
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def enforce() -> None:
    for var in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "HF_DATASETS_OFFLINE"):
        os.environ[var] = "1"

    original_connect = socket.socket.connect

    def guarded_connect(self: socket.socket, address: object) -> None:  # type: ignore[override]
        host = address[0] if isinstance(address, tuple) else address
        if not _is_loopback(host):
            raise NetworkBlockedError(f"Podium is offline-only; blocked connection to {host!r}")
        return original_connect(self, address)  # type: ignore[arg-type]

    socket.socket.connect = guarded_connect  # type: ignore[method-assign]
