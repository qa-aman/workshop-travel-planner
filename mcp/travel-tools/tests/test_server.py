import subprocess
import sys
from pathlib import Path

import pytest

SERVER = Path(__file__).parent.parent / "server.py"


def test_server_refuses_to_start_without_key(monkeypatch):
    env = {"PATH": "/usr/bin:/bin", "TRAVEL_TOOLS_DOTENV": "/nonexistent"}
    p = subprocess.run([sys.executable, str(SERVER)], env=env, capture_output=True, text=True, timeout=20)
    assert p.returncode == 2
    assert "GOOGLE_MAPS_API_KEY" in p.stderr


def test_server_registers_five_tools(monkeypatch):
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "k")
    import importlib
    import server
    importlib.reload(server)
    names = {t.name for t in server.mcp._tool_manager.list_tools()}
    assert names == {"search_places", "get_walking_route", "get_rail_route", "convert_currency", "get_weather"}
