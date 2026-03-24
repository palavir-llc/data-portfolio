"""Shared formatting utilities for fraud analysis scripts."""


def fmt_dollars(amount):
    """Format dollar amount with appropriate suffix."""
    if abs(amount) >= 1e12:
        return f"${amount / 1e12:.1f}T"
    if abs(amount) >= 1e9:
        return f"${amount / 1e9:.1f}B"
    if abs(amount) >= 1e6:
        return f"${amount / 1e6:.1f}M"
    if abs(amount) >= 1e3:
        return f"${amount / 1e3:.0f}K"
    return f"${amount:.0f}"


def fmt_pct(value, decimals=1):
    """Format as percentage."""
    return f"{value * 100:.{decimals}f}%"


def fmt_number(n):
    """Format with commas."""
    return f"{n:,.0f}"
