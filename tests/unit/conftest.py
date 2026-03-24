"""
Conftest for unit tests — minimal setup, no FastAPI app required.
Adds the backend directory to sys.path so src.* imports work.
"""
import sys
import os

# Add backend/ to path so "from src.xxx import yyy" works
backend_dir = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
sys.path.insert(0, os.path.abspath(backend_dir))
