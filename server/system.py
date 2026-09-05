import ctypes
import os
import psutil

# Windows Power Management Constants
ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001
ES_AWAYMODE_REQUIRED = 0x00000040

_sleep_inhibit_active = False


def enable_sleep_inhibit() -> bool:
    """Prevents Windows laptop from going to sleep while daemon runs."""
    global _sleep_inhibit_active
    try:
        if os.name == "nt":
            flags = ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED
            result = ctypes.windll.kernel32.SetThreadExecutionState(flags)
            _sleep_inhibit_active = bool(result != 0)
            return _sleep_inhibit_active
    except Exception as e:
        print(f"[System] Warning: Failed to set sleep inhibit: {e}")
    return False


def disable_sleep_inhibit() -> bool:
    """Restores default Windows sleep behavior."""
    global _sleep_inhibit_active
    try:
        if os.name == "nt":
            result = ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)
            _sleep_inhibit_active = False
            return bool(result != 0)
    except Exception as e:
        print(f"[System] Warning: Failed to clear sleep inhibit: {e}")
    return False


def get_system_vitals() -> dict:
    """Returns real-time laptop telemetry: CPU, RAM, battery, charging status."""
    battery = psutil.sensors_battery()
    battery_info = None
    if battery:
        battery_info = {
            "percent": round(battery.percent, 1),
            "is_charging": battery.power_plugged,
            "secs_left": battery.secsleft if battery.secsleft != psutil.POWER_TIME_UNLIMITED else -1,
        }

    return {
        "cpu_percent": psutil.cpu_percent(interval=None),
        "memory_percent": psutil.virtual_memory().percent,
        "battery": battery_info,
        "sleep_inhibit_active": _sleep_inhibit_active,
    }
