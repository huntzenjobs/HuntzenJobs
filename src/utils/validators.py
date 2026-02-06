"""
Input Validation & Sanitization for Backend
Prevents SQL injection, XSS, and validates user inputs
"""

import re
from typing import Optional


def validate_user_input(text: str, max_length: int = 5000) -> str:
    """
    Validate and sanitize user input.

    Args:
        text: Raw user input
        max_length: Maximum allowed length

    Returns:
        Sanitized text

    Raises:
        ValueError: If input is invalid
    """
    if not text or not isinstance(text, str):
        raise ValueError("Input must be a non-empty string")

    if len(text) > max_length:
        raise ValueError(f"Input must be between 1 and {max_length} characters")

    # Remove null bytes
    text = text.replace('\x00', '')

    # Check for dangerous SQL injection patterns
    dangerous_patterns = [
        r';--',
        r'DROP\s+TABLE',
        r'UNION\s+SELECT',
        r'INSERT\s+INTO',
        r'DELETE\s+FROM',
        r'<script>',
        r'javascript:',
        r'onerror=',
        r'onload=',
    ]

    text_lower = text.lower()
    for pattern in dangerous_patterns:
        if re.search(pattern, text_lower, re.IGNORECASE):
            raise ValueError("Invalid input detected")

    return text.strip()


def validate_email(email: str) -> str:
    """
    Validate email address.

    Args:
        email: Email string

    Returns:
        Sanitized email

    Raises:
        ValueError: If email is invalid
    """
    email = validate_user_input(email, max_length=254).lower()

    email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_regex, email):
        raise ValueError("Invalid email format")

    return email


def validate_phone(phone: str) -> str:
    """
    Validate and sanitize phone number.

    Args:
        phone: Phone string

    Returns:
        Sanitized phone

    Raises:
        ValueError: If phone is invalid
    """
    # Remove all non-digit characters except + at start
    phone = re.sub(r'[^\d+]', '', phone)

    if not phone or len(phone) < 8 or len(phone) > 20:
        raise ValueError("Invalid phone number length")

    return phone


def validate_job_title(title: str) -> str:
    """
    Validate job title.

    Args:
        title: Job title string

    Returns:
        Sanitized title

    Raises:
        ValueError: If title is invalid
    """
    title = validate_user_input(title, max_length=200)

    # Job titles should only contain letters, numbers, spaces, and basic punctuation
    if not re.match(r'^[a-zA-Z0-9\s\-/&,.\(\)]+$', title):
        raise ValueError("Invalid characters in job title")

    return title


def validate_country_code(code: str) -> str:
    """
    Validate ISO country code.

    Args:
        code: Country code (e.g., 'fr', 'us')

    Returns:
        Sanitized code

    Raises:
        ValueError: If code is invalid
    """
    code = code.strip().lower()

    if not re.match(r'^[a-z]{2}$', code):
        raise ValueError("Invalid country code format")

    return code


def validate_city(city: str) -> str:
    """
    Validate city name.

    Args:
        city: City name

    Returns:
        Sanitized city

    Raises:
        ValueError: If city is invalid
    """
    city = validate_user_input(city, max_length=100)

    # City names can contain letters (including accented), spaces, hyphens, apostrophes, parentheses
    # Updated to support Unicode letters for international city names (Paris, Montréal, São Paulo, etc.)
    if not re.match(r'^[\w\s\-\'\.\(\)]+$', city, re.UNICODE):
        raise ValueError("Invalid characters in city name")

    return city


def validate_company_name(name: str) -> str:
    """
    Validate company name.

    Args:
        name: Company name

    Returns:
        Sanitized company name

    Raises:
        ValueError: If company name is invalid
    """
    name = validate_user_input(name, max_length=200)

    # Company names can contain alphanumeric, spaces, hyphens, dots, ampersands
    if not re.match(r'^[a-zA-Z0-9\s\-\.&\']+$', name):
        raise ValueError("Invalid characters in company name")

    return name


def validate_url(url: str) -> str:
    """
    Validate and sanitize URL.

    Args:
        url: URL string

    Returns:
        Validated URL

    Raises:
        ValueError: If URL is invalid or dangerous
    """
    if not url or not isinstance(url, str):
        raise ValueError("URL must be a non-empty string")

    url = url.strip()

    # Check URL length
    if len(url) > 2000:
        raise ValueError("URL is too long (max 2000 characters)")

    # Basic URL pattern check
    url_pattern = r'^https?://[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}(/[^\s]*)?$'
    if not re.match(url_pattern, url):
        raise ValueError("Invalid URL format")

    # Block dangerous protocols
    dangerous_protocols = ['javascript:', 'data:', 'file:', 'ftp:']
    url_lower = url.lower()
    for protocol in dangerous_protocols:
        if url_lower.startswith(protocol):
            raise ValueError("URL protocol not allowed")

    return url
