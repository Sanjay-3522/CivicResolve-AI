"""
CivicResolve — Test Fixtures and Configuration
"""

import os
import sys

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure backend root is on sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Set test environment variables before importing app
os.environ["ADMIN_API_KEY"] = "test-admin-secret-2026"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["FRONTEND_URL"] = "http://localhost:3000"

from database import Base, get_db
from main import app
from services.auth import reopen_limiter, report_limiter, upvote_limiter

TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db():
    connection = test_engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest_asyncio.fixture
async def client(db):
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    # Reset in-memory rate limiters for fresh test runs
    report_limiter.reset()
    upvote_limiter.reset()
    reopen_limiter.reset()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
def admin_headers():
    return {"X-Admin-Key": "test-admin-secret-2026"}
