from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.auth.service import create_invitation, create_user

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


def test_register_with_invitation_logs_in(client, db):
    token = create_invitation(db, "nueva@example.com", datetime.now(UTC))
    response = client.post(
        "/api/auth/register",
        json={"token": token, "password": "clave-segura-123", "display_name": "Nueva"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["email"] == "nueva@example.com"
    assert "session" in response.cookies
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["display_name"] == "Nueva"


def test_register_rejects_reused_invitation(client, db):
    token = create_invitation(db, "nueva@example.com", datetime.now(UTC))
    body = {"token": token, "password": "clave-segura-123", "display_name": "Nueva"}
    assert client.post("/api/auth/register", json=body).status_code == 201
    second = TestClient(client.app, headers={"Origin": "http://localhost:3000"})
    response = second.post("/api/auth/register", json=body)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_INVITATION"


def test_register_rejects_expired_invitation(client, db):
    token = create_invitation(db, "nueva@example.com", datetime.now(UTC) - timedelta(days=8))
    response = client.post(
        "/api/auth/register",
        json={"token": token, "password": "clave-segura-123", "display_name": "Nueva"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_INVITATION"


def test_register_rejects_short_password(client, db):
    token = create_invitation(db, "nueva@example.com", datetime.now(UTC))
    response = client.post(
        "/api/auth/register", json={"token": token, "password": "corta", "display_name": "N"}
    )
    assert response.status_code == 422


def test_login_wrong_password_and_unknown_email(client, db):
    create_user(db, "ana@example.com", "clave-segura-123", "Ana")
    for email, password in [("ana@example.com", "incorrecta-123"), ("nadie@example.com", "x")]:
        response = client.post("/api/auth/login", json={"email": email, "password": password})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_rate_limit(client, db):
    create_user(db, "ana@example.com", "clave-segura-123", "Ana")
    for _ in range(5):
        client.post("/api/auth/login", json={"email": "ana@example.com", "password": "mala-123"})
    response = client.post(
        "/api/auth/login", json={"email": "ana@example.com", "password": "clave-segura-123"}
    )
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "LOGIN_RATE_LIMITED"


def test_me_requires_session(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "NOT_AUTHENTICATED"


def test_logout_revokes_session(client_a):
    assert client_a.post("/api/auth/logout").status_code == 204
    assert client_a.get("/api/auth/me").status_code == 401


def test_session_expires_without_activity(make_client, set_now):
    set_now(NOW)
    c = make_client("ana@example.com")
    set_now(NOW + timedelta(days=31))
    assert c.get("/api/auth/me").status_code == 401


def test_session_slides_with_activity(make_client, set_now):
    set_now(NOW)
    c = make_client("ana@example.com")
    set_now(NOW + timedelta(days=20))
    assert c.get("/api/auth/me").status_code == 200
    set_now(NOW + timedelta(days=45))
    assert c.get("/api/auth/me").status_code == 200


def test_mutation_with_foreign_origin_is_rejected(client_a):
    response = client_a.post("/api/auth/logout", headers={"Origin": "https://evil.example"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ORIGIN_NOT_ALLOWED"


def test_mutation_without_origin_header_is_allowed(app, db):
    create_user(db, "ana@example.com", "clave-segura-123", "Ana")
    no_origin = TestClient(app)
    response = no_origin.post(
        "/api/auth/login", json={"email": "ana@example.com", "password": "clave-segura-123"}
    )
    assert response.status_code == 200
