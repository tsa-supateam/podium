import socket

import pytest

from podium_engine import offline


def test_external_connections_are_blocked(monkeypatch):
    original = socket.socket.connect
    try:
        offline.enforce()
        s = socket.socket()
        with pytest.raises(offline.NetworkBlockedError):
            s.connect(("93.184.216.34", 80))
        s.close()
    finally:
        socket.socket.connect = original


def test_loopback_detection():
    assert offline._is_loopback("127.0.0.1")
    assert offline._is_loopback("::1")
    assert offline._is_loopback("localhost")
    assert not offline._is_loopback("8.8.8.8")
    assert not offline._is_loopback("example.com")
